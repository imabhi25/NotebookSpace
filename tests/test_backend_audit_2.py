"""Regression tests for the second round of backend audit fixes. All data here is synthetic."""
import asyncio
import uuid

import pytest
from fastapi.testclient import TestClient

import api.main as main
from api.main import app, reset_rate_limits
from db.connection import get_connection

client = TestClient(app)


def _delete_user(user_id: str) -> None:
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s;", (user_id,))


def _guest(headers: dict[str, str] | None = None) -> tuple[dict[str, str], str]:
    resp = client.post("/auth/guest-session", headers=headers or {})
    assert resp.status_code == 200
    body = resp.json()
    return {"Authorization": f"Bearer {body['token']}"}, body["user"]["id"]


@pytest.fixture
def clean_limits(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.delenv("DEMO_MODE", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    reset_rate_limits()
    yield
    reset_rate_limits()


@pytest.fixture
def nb(clean_limits):
    """A guest with one notebook holding a pasted source and a conversation."""
    h, user_id = _guest()
    sid = client.post("/subjects", json={"name": "SYNTHETIC audit 2"}, headers=h).json()["id"]
    src = client.post(
        f"/subjects/{sid}/sources/paste",
        json={"title": f"SYNTHETIC heaps {uuid.uuid4().hex[:8]}", "text": "SYNTHETIC TEST TEXT about binary heaps."},
        headers=h,
    ).json()
    conv = client.post(f"/subjects/{sid}/conversations", json={"title": "SYNTHETIC chat"}, headers=h).json()
    yield {"h": h, "sid": sid, "src": src["id"], "conv": conv["id"]}
    _delete_user(user_id)


# --- New guest sessions can't reset the demo question limit ------------------------------

def test_demo_mode_limits_new_guest_sessions_per_address(clean_limits, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("GUEST_SESSIONS_PER_MINUTE", "2")
    ip = {"X-Forwarded-For": "198.51.100.70"}
    created = []
    for _ in range(2):
        resp = client.post("/auth/guest-session", headers=ip)
        assert resp.status_code == 200
        created.append(resp.json()["user"]["id"])
    third = client.post("/auth/guest-session", headers=ip)
    assert third.status_code == 429
    assert 1 <= int(third.headers["retry-after"]) <= 60
    # Another address is unaffected.
    other = client.post("/auth/guest-session", headers={"X-Forwarded-For": "198.51.100.71"})
    assert other.status_code == 200
    created.append(other.json()["user"]["id"])
    for user_id in created:
        _delete_user(user_id)


def test_guest_sessions_are_not_limited_outside_demo_mode(clean_limits, monkeypatch):
    monkeypatch.setenv("GUEST_SESSIONS_PER_MINUTE", "1")
    ids = [_guest({"X-Forwarded-For": "198.51.100.72"})[1] for _ in range(3)]
    for user_id in ids:
        _delete_user(user_id)


def test_demo_question_limit_spans_guest_sessions_from_one_address(clean_limits, monkeypatch):
    ip = {"X-Forwarded-For": "198.51.100.73"}
    guests = []
    for _ in range(3):
        h, user_id = _guest(ip)
        sid = client.post("/subjects", json={"name": "SYNTHETIC limit"}, headers=h).json()["id"]
        conv = client.post(f"/subjects/{sid}/conversations", json={}, headers=h).json()["id"]
        guests.append((h, user_id, f"/subjects/{sid}/conversations/{conv}/messages"))

    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("DEMO_ASK_PER_MINUTE", "2")
    statuses = [
        client.post(url, json={"question": "SYNTHETIC question?"}, headers={**h, **ip}).status_code
        for h, _, url in guests
    ]
    assert statuses == [200, 200, 429]
    for _, user_id, _ in guests:
        _delete_user(user_id)


# --- Uploads are read with a cap ------------------------------------------------------

def test_oversized_text_upload_is_rejected(nb, monkeypatch):
    monkeypatch.setattr(main, "MAX_TEXT_SIZE_BYTES", 1024)
    resp = client.post(
        f"/subjects/{nb['sid']}/sources/upload",
        files={"file": ("SYNTHETIC big.txt", b"x" * 5000, "text/plain")},
        headers=nb["h"],
    )
    assert resp.status_code == 413


def test_capped_read_stops_once_past_the_limit():
    class _Endless:
        reads = 0

        async def read(self, size: int = -1) -> bytes:
            self.reads += 1
            return b"x" * size

    upload = _Endless()
    assert asyncio.run(main._read_upload_capped(upload, 3 * main._UPLOAD_READ_CHUNK)) is None
    assert upload.reads == 4


def test_capped_read_returns_the_whole_small_file():
    class _Small:
        def __init__(self) -> None:
            self.left = b"SYNTHETIC small file"

        async def read(self, size: int = -1) -> bytes:
            piece, self.left = self.left[:size], self.left[size:]
            return piece

    assert asyncio.run(main._read_upload_capped(_Small(), 1024)) == b"SYNTHETIC small file"


# --- Sign-up race ----------------------------------------------------------------------

def test_concurrent_signup_for_one_email_answers_409_not_500(clean_limits, monkeypatch):
    email = f"audit2_{uuid.uuid4().hex}@test.com"
    first = client.post("/auth/register", json={"email": email, "password": "SYNTHETIC-pass"})
    assert first.status_code == 200
    # The second request passed its existence check before the first one committed.
    monkeypatch.setattr(main, "get_user_by_email", lambda _email: None)
    second = client.post("/auth/register", json={"email": email, "password": "SYNTHETIC-pass"})
    assert second.status_code == 409
    _delete_user(first.json()["user"]["id"])


# --- Searches treat LIKE wildcards literally -----------------------------------------------

def test_note_search_matches_underscore_literally(nb):
    url = f"/subjects/{nb['sid']}/notes"
    client.post(url, json={"title": "SYNTHETIC max_len", "content": "SYNTHETIC body."}, headers=nb["h"])
    client.post(url, json={"title": "SYNTHETIC maxXlen", "content": "SYNTHETIC body."}, headers=nb["h"])
    titles = [n["title"] for n in client.get(url, params={"search": "max_len"}, headers=nb["h"]).json()]
    assert titles == ["SYNTHETIC max_len"]


def test_subject_search_matches_percent_literally(nb):
    client.post("/subjects", json={"name": "SYNTHETIC 50% off"}, headers=nb["h"])
    names = [s["name"] for s in client.get("/subjects", params={"search": "%"}, headers=nb["h"]).json()]
    assert names == ["SYNTHETIC 50% off"]


# --- Note payload limits ---------------------------------------------------------------

def test_note_with_too_many_citations_is_rejected(nb):
    resp = client.post(
        f"/subjects/{nb['sid']}/notes",
        json={"title": "SYNTHETIC", "content": "SYNTHETIC", "citations": [{"file": "a", "page": 1}] * 101},
        headers=nb["h"],
    )
    assert resp.status_code == 422


# --- Retrying a follow-up keeps its context -------------------------------------------------

def test_retried_follow_up_searches_with_the_earlier_question(nb, monkeypatch):
    import answering.notebook_answer as na

    searched: list[str] = []
    real_search = na.search_scoped

    def spy(question, **kwargs):
        searched.append(question)
        return real_search(question=question, **kwargs)

    monkeypatch.setattr(na, "search_scoped", spy)
    url = f"/subjects/{nb['sid']}/conversations/{nb['conv']}/messages"
    body = {"selected_source_ids": [nb["src"]]}
    client.post(url, json={**body, "question": "What is a binary heap?"}, headers=nb["h"])
    failed = client.post(url, json={**body, "question": "explain it simpler"}, headers=nb["h"]).json()
    client.post(
        url,
        json={**body, "question": "explain it simpler", "is_retry": True, "retry_message_id": failed["id"]},
        headers=nb["h"],
    )
    assert searched[1] == "explain it simpler What is a binary heap?"
    assert searched[2] == searched[1]
