"""Regression tests for the backend audit fixes. All data here is synthetic."""
import ipaddress
import uuid

import pytest
from fastapi.testclient import TestClient

from api.main import app, reset_rate_limits
from db.connection import get_connection
from db.notebook_store import _escape_like
from ingestion import parsers

client = TestClient(app)


@pytest.fixture
def nb(monkeypatch):
    """A guest with two notebooks, a pasted source, a conversation and a note in the first."""
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.delenv("DEMO_MODE", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    reset_rate_limits()
    body = client.post("/auth/guest-session").json()
    h = {"Authorization": f"Bearer {body['token']}"}
    sid = client.post("/subjects", json={"name": "SYNTHETIC audit A"}, headers=h).json()["id"]
    other_sid = client.post("/subjects", json={"name": "SYNTHETIC audit B"}, headers=h).json()["id"]
    src = client.post(
        f"/subjects/{sid}/sources/paste",
        json={"title": f"SYNTHETIC audit {uuid.uuid4().hex[:8]}", "text": "SYNTHETIC TEST TEXT about heaps."},
        headers=h,
    ).json()
    conv = client.post(f"/subjects/{sid}/conversations", json={"title": "SYNTHETIC chat"}, headers=h).json()
    note = client.post(
        f"/subjects/{sid}/notes", json={"title": "SYNTHETIC note", "content": "SYNTHETIC body."}, headers=h
    ).json()
    yield {"h": h, "sid": sid, "other_sid": other_sid, "src": src["id"], "conv": conv["id"], "note": note["id"]}
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s;", (body["user"]["id"],))


# --- Malformed ids answer 404, not 500 ------------------------------------------------------

@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/subjects/not-a-uuid"),
        ("GET", "/subjects/not-a-uuid/sources"),
        ("GET", "/subjects/{sid}/sources/not-a-uuid"),
        ("GET", "/subjects/{sid}/conversations/not-a-uuid/messages"),
        ("DELETE", "/subjects/{sid}/notes/not-a-uuid"),
    ],
)
def test_malformed_ids_answer_404(nb, method, path):
    resp = client.request(method, path.format(sid=nb["sid"]), headers=nb["h"])
    assert resp.status_code == 404


def test_malformed_selected_source_ids_are_ignored_not_a_500(nb):
    url = f"/subjects/{nb['sid']}/conversations/{nb['conv']}/messages"
    resp = client.post(url, json={"question": "What about heaps?", "selected_source_ids": ["nope"]}, headers=nb["h"])
    assert resp.status_code == 200
    assert resp.json()["abstain_reason"] == "no_sources_selected"


# --- A resource addressed through the wrong notebook is not changed -------------------------

def test_wrong_notebook_cannot_rename_or_delete_a_source(nb):
    base = f"/subjects/{nb['other_sid']}/sources/{nb['src']}"
    assert client.put(base, json={"title": "SYNTHETIC hijacked"}, headers=nb["h"]).status_code == 404
    assert client.delete(base, headers=nb["h"]).status_code == 404
    src = client.get(f"/subjects/{nb['sid']}/sources/{nb['src']}", headers=nb["h"]).json()
    assert src["title"] != "SYNTHETIC hijacked"


def test_wrong_notebook_cannot_rename_or_delete_a_conversation(nb):
    base = f"/subjects/{nb['other_sid']}/conversations/{nb['conv']}"
    assert client.put(base, json={"title": "SYNTHETIC hijacked"}, headers=nb["h"]).status_code == 404
    assert client.delete(base, headers=nb["h"]).status_code == 404
    conv = client.get(f"/subjects/{nb['sid']}/conversations/{nb['conv']}", headers=nb["h"]).json()
    assert conv["title"] == "SYNTHETIC chat"


def test_wrong_notebook_cannot_edit_or_delete_a_note(nb):
    base = f"/subjects/{nb['other_sid']}/notes/{nb['note']}"
    assert client.put(base, json={"title": "SYNTHETIC hijacked"}, headers=nb["h"]).status_code == 404
    assert client.delete(base, headers=nb["h"]).status_code == 404
    note = client.get(f"/subjects/{nb['sid']}/notes/{nb['note']}", headers=nb["h"]).json()
    assert note["title"] == "SYNTHETIC note"


# --- Retry only replaces an assistant turn of the same conversation -------------------------

def test_retry_never_deletes_a_user_message(nb):
    url = f"/subjects/{nb['sid']}/conversations/{nb['conv']}/messages"
    client.post(url, json={"question": "What about heaps?", "selected_source_ids": [nb["src"]]}, headers=nb["h"])
    before = client.get(url, headers=nb["h"]).json()
    user_msg = next(m for m in before if m["role"] == "user")

    client.post(
        url,
        json={
            "question": "What about heaps?",
            "selected_source_ids": [nb["src"]],
            "is_retry": True,
            "retry_message_id": user_msg["id"],
        },
        headers=nb["h"],
    )
    after = client.get(url, headers=nb["h"]).json()
    assert user_msg["id"] in [m["id"] for m in after]


# --- Input limits -----------------------------------------------------------------------

def test_overlong_password_is_rejected_before_hashing():
    resp = client.post(
        "/auth/register", json={"email": f"audit_{uuid.uuid4().hex}@test.com", "password": "x" * 10_000}
    )
    assert resp.status_code == 422


# --- Keyword search treats LIKE wildcards literally --------------------------------------

def test_like_wildcards_are_escaped():
    assert _escape_like("max_len") == "max\\_len"
    assert _escape_like("50%") == "50\\%"
    assert _escape_like("a\\b") == "a\\\\b"


# --- URL fetching -------------------------------------------------------------------------

@pytest.mark.parametrize("addr", ["100.64.0.1", "::ffff:127.0.0.1", "169.254.169.254", "10.0.0.5", "127.0.0.1"])
def test_non_public_addresses_are_blocked(addr):
    assert parsers.is_ip_private_or_restricted(ipaddress.ip_address(addr))


def test_public_address_is_allowed():
    assert not parsers.is_ip_private_or_restricted(ipaddress.ip_address("93.184.216.34"))


def test_oversized_page_stops_downloading_at_the_limit(monkeypatch):
    pulled = {"n": 0}

    class _Endless:
        is_redirect = False
        status_code = 200
        headers = {"content-type": "text/html"}
        charset_encoding = None

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def iter_bytes(self):
            while True:
                pulled["n"] += 1
                yield b"x" * 1024 * 1024

    class _Client:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def stream(self, method, url, headers=None):
            return _Endless()

    monkeypatch.setattr(parsers, "validate_url_safe", lambda url: None)
    monkeypatch.setattr(parsers.httpx, "Client", _Client)
    with pytest.raises(ValueError, match="5 MB"):
        parsers.fetch_and_parse_url("https://example.org/huge")
    assert pulled["n"] <= 6
