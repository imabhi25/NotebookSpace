"""Regression tests for API access control, settings validation and rate limits.

Every route is classified below. A route that is added without being classified fails
test_every_route_is_classified, so a new endpoint cannot ship without an access decision.
All data here is synthetic.
"""
import uuid

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from api.main import app, reset_rate_limits
from db.connection import get_connection
from db.store import get_passages_for_page

client = TestClient(app)

CANARY = "AUTHFIX-CANARY-7731"

# Routes that carry no user data and are meant to be reachable without credentials.
PUBLIC_ROUTES = {
    ("GET", "/health"),
    ("GET", "/documents"),       # lists the shared demo corpus only
    ("POST", "/search"),         # searches the shared demo corpus only
    ("POST", "/ask"),            # answers from the shared demo corpus only, rate limited
    ("POST", "/upload"),         # adds to the shared demo corpus, refused in demo mode
    ("POST", "/auth/register"),
    ("POST", "/auth/login"),
    ("POST", "/auth/demo-login"),
    ("GET", "/auth/config"),
    ("POST", "/auth/guest-session"),
}

# Session routes: they act on the caller's own session and answer 401 without one.
SESSION_ROUTES = {
    ("GET", "/auth/me"),
    ("POST", "/auth/logout"),
}

# Routes that read or write user data. No credentials, a bad token and another user's
# credentials must all answer 404.
OWNER_ROUTES = {
    ("GET", "/passages"),
    ("GET", "/subjects"),
    ("POST", "/subjects"),
    ("GET", "/subjects/{subject_id}"),
    ("PUT", "/subjects/{subject_id}"),
    ("DELETE", "/subjects/{subject_id}"),
    ("POST", "/subjects/{subject_id}/archive"),
    ("POST", "/subjects/{subject_id}/restore"),
    ("GET", "/subjects/{subject_id}/starter-questions"),
    ("GET", "/subjects/{subject_id}/sources"),
    ("POST", "/subjects/{subject_id}/sources/upload"),
    ("POST", "/subjects/{subject_id}/sources/paste"),
    ("POST", "/subjects/{subject_id}/sources/url"),
    ("GET", "/subjects/{subject_id}/sources/{source_id}"),
    ("PUT", "/subjects/{subject_id}/sources/{source_id}"),
    ("DELETE", "/subjects/{subject_id}/sources/{source_id}"),
    ("POST", "/subjects/{subject_id}/sources/{source_id}/retry"),
    ("POST", "/subjects/{subject_id}/sources/{source_id}/replace"),
    ("GET", "/subjects/{subject_id}/conversations"),
    ("POST", "/subjects/{subject_id}/conversations"),
    ("GET", "/subjects/{subject_id}/conversations/{conversation_id}"),
    ("PUT", "/subjects/{subject_id}/conversations/{conversation_id}"),
    ("DELETE", "/subjects/{subject_id}/conversations/{conversation_id}"),
    ("GET", "/subjects/{subject_id}/conversations/{conversation_id}/messages"),
    ("POST", "/subjects/{subject_id}/conversations/{conversation_id}/messages"),
    ("GET", "/subjects/{subject_id}/notes"),
    ("POST", "/subjects/{subject_id}/notes"),
    ("GET", "/subjects/{subject_id}/notes/{note_id}"),
    ("PUT", "/subjects/{subject_id}/notes/{note_id}"),
    ("DELETE", "/subjects/{subject_id}/notes/{note_id}"),
}

# Collection routes have no resource of another user in their path. Another guest gets
# their own (empty) collection, which is checked separately.
COLLECTION_ROUTES = {("GET", "/subjects"), ("POST", "/subjects")}

TEXT_FILE = {"file": ("authfix_probe.txt", b"SYNTHETIC probe file.", "text/plain")}

# One valid request per owner route, addressed at guest A's resources.
REQUESTS = {
    ("GET", "/passages"): {"params": {"file": "{source_name}", "page": 1}},
    ("POST", "/subjects"): {"json": {"name": "SYNTHETIC probe subject"}},
    ("PUT", "/subjects/{subject_id}"): {"json": {"name": "SYNTHETIC renamed by intruder"}},
    ("POST", "/subjects/{subject_id}/sources/upload"): {"files": TEXT_FILE},
    ("POST", "/subjects/{subject_id}/sources/paste"): {"json": {"title": "SYNTHETIC intruder paste", "text": "SYNTHETIC text."}},
    ("POST", "/subjects/{subject_id}/sources/url"): {"json": {"url": "https://example.com/"}},
    ("PUT", "/subjects/{subject_id}/sources/{source_id}"): {"json": {"title": "SYNTHETIC renamed by intruder"}},
    ("POST", "/subjects/{subject_id}/sources/{source_id}/replace"): {"files": TEXT_FILE},
    ("POST", "/subjects/{subject_id}/conversations"): {"json": {"title": "SYNTHETIC intruder chat"}},
    ("PUT", "/subjects/{subject_id}/conversations/{conversation_id}"): {"json": {"title": "SYNTHETIC renamed by intruder"}},
    ("POST", "/subjects/{subject_id}/conversations/{conversation_id}/messages"): {"json": {"question": "What is the marker?", "selected_source_ids": []}},
    ("POST", "/subjects/{subject_id}/notes"): {"json": {"title": "SYNTHETIC intruder note", "content": "SYNTHETIC text."}},
    ("PUT", "/subjects/{subject_id}/notes/{note_id}"): {"json": {"title": "SYNTHETIC renamed by intruder"}},
}


def _delete_user(user_id: str) -> None:
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s;", (user_id,))


def _new_guest() -> tuple[dict[str, str], str]:
    resp = client.post("/auth/guest-session")
    assert resp.status_code == 200
    body = resp.json()
    return {"Authorization": f"Bearer {body['token']}"}, body["user"]["id"]


@pytest.fixture
def guest_b():
    headers, user_id = _new_guest()
    yield headers
    _delete_user(user_id)


@pytest.fixture
def world(monkeypatch):
    """Guest A with one notebook holding a pasted source, a conversation with one answered
    question, and a note."""
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.delenv("DEMO_MODE", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    reset_rate_limits()
    headers, user_id = _new_guest()
    source_name = f"SYNTHETIC authfix note {uuid.uuid4().hex[:8]}"
    subject = client.post("/subjects", json={"name": "SYNTHETIC authfix subject"}, headers=headers).json()
    sid = subject["id"]
    source = client.post(
        f"/subjects/{sid}/sources/paste",
        json={"title": source_name, "text": f"SYNTHETIC TEST TEXT. The private marker of guest A is {CANARY}."},
        headers=headers,
    ).json()
    assert source["status"] == "ready"
    conversation = client.post(f"/subjects/{sid}/conversations", json={"title": "SYNTHETIC chat"}, headers=headers).json()
    message = client.post(
        f"/subjects/{sid}/conversations/{conversation['id']}/messages",
        json={"question": "What is the private marker?", "selected_source_ids": [source["id"]]},
        headers=headers,
    )
    assert message.status_code == 200
    note = client.post(
        f"/subjects/{sid}/notes",
        json={"title": "SYNTHETIC note", "content": f"SYNTHETIC note text with {CANARY}."},
        headers=headers,
    ).json()
    yield {
        "headers": headers,
        "ids": {
            "subject_id": sid,
            "source_id": source["id"],
            "conversation_id": conversation["id"],
            "note_id": note["id"],
            "source_name": source_name,
        },
    }
    reset_rate_limits()
    _delete_user(user_id)


def _call(method: str, path: str, ids: dict[str, str], headers: dict[str, str] | None):
    spec = REQUESTS.get((method, path), {})
    kwargs: dict = {}
    if "json" in spec:
        kwargs["json"] = spec["json"]
    if "files" in spec:
        kwargs["files"] = spec["files"]
    if "params" in spec:
        kwargs["params"] = {k: (v.format(**ids) if isinstance(v, str) else v) for k, v in spec["params"].items()}
    return client.request(method, path.format(**ids), headers=headers or {}, **kwargs)


def _snapshot(world) -> dict:
    """Guest A's data as guest A sees it, to prove that refused requests changed nothing."""
    h, ids = world["headers"], world["ids"]
    sid = ids["subject_id"]
    return {
        "subject": client.get(f"/subjects/{sid}", headers=h).json(),
        "sources": [(s["id"], s["title"], s["version"], s["status"]) for s in client.get(f"/subjects/{sid}/sources", headers=h).json()],
        "conversations": [(c["id"], c["title"]) for c in client.get(f"/subjects/{sid}/conversations", headers=h).json()],
        "messages": [m["id"] for m in client.get(f"/subjects/{sid}/conversations/{ids['conversation_id']}/messages", headers=h).json()],
        "notes": [(n["id"], n["title"], n["content"]) for n in client.get(f"/subjects/{sid}/notes", headers=h).json()],
    }


# --------------------------------------------------------------------------------------
# Route inventory
# --------------------------------------------------------------------------------------

def test_every_route_is_classified():
    declared = {
        (method, route.path)
        for route in app.routes
        if isinstance(route, APIRoute)
        for method in route.methods
        if method not in ("HEAD", "OPTIONS")
    }
    classified = PUBLIC_ROUTES | SESSION_ROUTES | OWNER_ROUTES
    assert declared - classified == set(), "New routes need an access decision in tests/test_api_auth.py"
    assert classified - declared == set(), "Classified routes that no longer exist"
    assert not (PUBLIC_ROUTES & OWNER_ROUTES) and not (SESSION_ROUTES & OWNER_ROUTES)


def test_session_routes_answer_401_without_a_session():
    assert client.get("/auth/me").status_code == 401
    assert client.post("/auth/logout").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"}).status_code == 401


# --------------------------------------------------------------------------------------
# Owner-only routes
# --------------------------------------------------------------------------------------

@pytest.mark.parametrize("method,path", sorted(OWNER_ROUTES))
def test_owner_route_without_credentials_is_404(world, method, path):
    before = _snapshot(world)
    assert _call(method, path, world["ids"], None).status_code == 404
    assert _call(method, path, world["ids"], {"Authorization": "Bearer not-a-real-token"}).status_code == 404
    assert _call(method, path, world["ids"], {"Authorization": "Basic abc"}).status_code == 404
    assert _snapshot(world) == before


@pytest.mark.parametrize("method,path", sorted(OWNER_ROUTES - COLLECTION_ROUTES))
def test_owner_route_with_another_guests_credentials_is_404(world, guest_b, method, path):
    before = _snapshot(world)
    resp = _call(method, path, world["ids"], guest_b)
    assert resp.status_code == 404
    assert CANARY not in resp.text
    assert _snapshot(world) == before


def test_collections_only_show_the_callers_own_data(world, guest_b):
    assert client.get("/subjects", headers=guest_b).json() == []
    created = client.post("/subjects", json={"name": "SYNTHETIC guest B subject"}, headers=guest_b).json()
    a_subjects = [s["id"] for s in client.get("/subjects", headers=world["headers"]).json()]
    assert created["id"] not in a_subjects
    assert world["ids"]["subject_id"] not in [s["id"] for s in client.get("/subjects", headers=guest_b).json()]


def test_owner_can_still_reach_everything(world):
    h, ids = world["headers"], world["ids"]
    for method, path in sorted(OWNER_ROUTES):
        if method != "GET":
            continue
        assert _call(method, path, ids, h).status_code == 200, (method, path)


def test_other_guests_ids_inside_own_notebook_are_404(world, guest_b):
    """Guest B cannot reach guest A's source, conversation or note through B's own notebook."""
    ids = world["ids"]
    b_sid = client.post("/subjects", json={"name": "SYNTHETIC guest B subject"}, headers=guest_b).json()["id"]
    for path in (
        f"/subjects/{b_sid}/sources/{ids['source_id']}",
        f"/subjects/{b_sid}/conversations/{ids['conversation_id']}",
        f"/subjects/{b_sid}/conversations/{ids['conversation_id']}/messages",
        f"/subjects/{b_sid}/notes/{ids['note_id']}",
    ):
        resp = client.get(path, headers=guest_b)
        assert resp.status_code == 404, path
        assert CANARY not in resp.text


def test_message_cannot_pull_in_another_guests_source_or_delete_their_message(world, guest_b):
    ids = world["ids"]
    before = _snapshot(world)
    b_sid = client.post("/subjects", json={"name": "SYNTHETIC guest B subject"}, headers=guest_b).json()["id"]
    b_conv = client.post(f"/subjects/{b_sid}/conversations", json={}, headers=guest_b).json()["id"]
    resp = client.post(
        f"/subjects/{b_sid}/conversations/{b_conv}/messages",
        json={
            "question": f"What is {CANARY}?",
            "selected_source_ids": [ids["source_id"]],
            "is_retry": True,
            "retry_message_id": before["messages"][-1],
        },
        headers=guest_b,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["retrieved"] == []
    assert CANARY not in " ".join(str(c.get("excerpt", "")) for c in body.get("citations", []))
    assert _snapshot(world) == before


# --------------------------------------------------------------------------------------
# /passages
# --------------------------------------------------------------------------------------

def test_passages_requires_the_owner(world, guest_b):
    name = world["ids"]["source_name"]
    owner = client.get("/passages", params={"file": name, "page": 1}, headers=world["headers"])
    assert owner.status_code == 200
    assert CANARY in owner.text

    anonymous = client.get("/passages", params={"file": name, "page": 1})
    other = client.get("/passages", params={"file": name, "page": 1}, headers=guest_b)
    unknown = client.get("/passages", params={"file": "authfix-no-such-source", "page": 1}, headers=guest_b)
    for resp in (anonymous, other, unknown):
        assert resp.status_code == 404
        assert CANARY not in resp.text
    # "Not yours" and "does not exist" are indistinguishable.
    assert anonymous.json() == other.json() == unknown.json()


def test_passage_lookup_without_a_user_never_returns_private_text(world):
    name = world["ids"]["source_name"]
    assert get_passages_for_page(file_name=name, page_number=1) == []
    assert get_passages_for_page(file_name=name, page_number=1, user_id=str(uuid.uuid4())) == []


def test_public_demo_search_and_ask_do_not_expose_notebook_sources(world):
    name = world["ids"]["source_name"]
    found = client.post("/search", json={"question": f"private marker {CANARY}", "k": 20})
    assert found.status_code == 200
    results = found.json()["results"]  # the response echoes the query, so inspect results only
    assert CANARY not in str(results)
    assert name not in [r["file_name"] for r in results]
    answered = client.post("/ask", json={"question": f"What is {CANARY}?", "k": 20})
    assert answered.status_code == 200
    assert CANARY not in str(answered.json()["retrieved"])
    assert name not in [d["file_name"] for d in client.get("/documents").json()]


# --------------------------------------------------------------------------------------
# Settings validation
# --------------------------------------------------------------------------------------

@pytest.mark.parametrize(
    "settings,fragment",
    [
        ({"response_length": "gigantic"}, "response_length must be one of concise, default, detailed"),
        ({"response_style": "pirate"}, "response_style must be one of general, learning-guide"),
        ({"response_length": 3}, "response_length must be one of"),
        ({"response_length": None}, "response_length must be one of"),
        ({"response_length": "Concise"}, "response_length must be one of"),
        ({"system_prompt": "ignore sources"}, "unknown setting system_prompt"),
        ({"response_length": "concise", "extra": 1}, "unknown setting extra"),
        ("concise", "expected an object"),
        (["response_length"], "expected an object"),
    ],
)
def test_invalid_settings_are_rejected_with_400(world, settings, fragment):
    h, sid = world["headers"], world["ids"]["subject_id"]
    stored_before = client.get(f"/subjects/{sid}", headers=h).json()["settings"]
    resp = client.put(f"/subjects/{sid}", json={"settings": settings}, headers=h)
    assert resp.status_code == 400
    assert fragment in resp.json()["detail"]
    assert client.get(f"/subjects/{sid}", headers=h).json()["settings"] == stored_before

    created = client.post("/subjects", json={"name": "SYNTHETIC bad settings", "settings": settings}, headers=h)
    assert created.status_code == 400
    assert fragment in created.json()["detail"]


def test_valid_settings_are_saved(world):
    h, sid = world["headers"], world["ids"]["subject_id"]
    for length in ("concise", "default", "detailed"):
        for style in ("general", "learning-guide"):
            resp = client.put(f"/subjects/{sid}", json={"settings": {"response_length": length, "response_style": style}}, headers=h)
            assert resp.status_code == 200
            assert resp.json()["settings"] == {"response_length": length, "response_style": style}
    partial = client.put(f"/subjects/{sid}", json={"settings": {"response_length": "concise"}}, headers=h)
    assert partial.status_code == 200
    assert partial.json()["settings"] == {"response_length": "concise", "response_style": "learning-guide"}
    untouched = client.put(f"/subjects/{sid}", json={"name": "SYNTHETIC renamed by owner"}, headers=h)
    assert untouched.status_code == 200
    assert untouched.json()["settings"] == partial.json()["settings"]


# --------------------------------------------------------------------------------------
# Rate limits and other documented limits
# --------------------------------------------------------------------------------------

def _assert_429(resp, limit_text: str) -> None:
    assert resp.status_code == 429
    assert limit_text in resp.json()["detail"]
    retry_after = int(resp.headers["retry-after"])
    assert 1 <= retry_after <= 60


def test_demo_ask_limit_is_10_a_minute_with_retry_after(monkeypatch):
    reset_rate_limits()
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.delenv("DEMO_ASK_PER_MINUTE", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    headers = {"X-Forwarded-For": "198.51.100.20"}
    statuses = [client.post("/ask", json={"question": f"q{i}", "k": 1}, headers=headers).status_code for i in range(10)]
    assert statuses == [200] * 10
    _assert_429(client.post("/ask", json={"question": "q10", "k": 1}, headers=headers), "up to 10 questions per minute")
    # A different client is unaffected.
    assert client.post("/ask", json={"question": "q", "k": 1}, headers={"X-Forwarded-For": "198.51.100.21"}).status_code == 200
    reset_rate_limits()


def test_demo_ask_limit_holds_when_the_proxy_hop_changes(monkeypatch):
    """Production shape: the same client behind an edge whose own address rotates.
    Thirteen such requests all passed before the fix."""
    reset_rate_limits()
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.delenv("DEMO_ASK_PER_MINUTE", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    statuses = []
    for i in range(13):
        headers = {"CF-Connecting-IP": "203.0.113.50", "X-Forwarded-For": f"203.0.113.50, 172.70.0.{i}"}
        statuses.append(client.post("/ask", json={"question": f"q{i}", "k": 1}, headers=headers).status_code)
    assert statuses == [200] * 10 + [429] * 3
    reset_rate_limits()


def test_edge_header_can_be_distrusted(monkeypatch):
    """Outside Cloudflare the edge header is client-supplied and must be ignorable."""
    reset_rate_limits()
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("DEMO_ASK_PER_MINUTE", "2")
    monkeypatch.setenv("TRUST_CF_CONNECTING_IP", "false")
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    statuses = []
    for i in range(3):
        headers = {"CF-Connecting-IP": f"192.0.2.{i}", "X-Forwarded-For": "203.0.113.60"}
        statuses.append(client.post("/ask", json={"question": f"q{i}", "k": 1}, headers=headers).status_code)
    assert statuses == [200, 200, 429]
    reset_rate_limits()


def test_notebook_question_limit_is_15_a_minute_with_retry_after(world, monkeypatch):
    reset_rate_limits()
    monkeypatch.setattr("api.main.answer_notebook_question", lambda **kwargs: {"content": "SYNTHETIC stub answer"})
    h, ids = world["headers"], world["ids"]
    url = f"/subjects/{ids['subject_id']}/conversations/{ids['conversation_id']}/messages"
    statuses = [client.post(url, json={"question": f"q{i}"}, headers=h).status_code for i in range(15)]
    assert statuses == [200] * 15
    _assert_429(client.post(url, json={"question": "q15"}, headers=h), "up to 15 questions per minute")
    reset_rate_limits()


def test_notebook_and_source_caps_are_enforced(world, monkeypatch):
    h, sid = world["headers"], world["ids"]["subject_id"]
    monkeypatch.setattr("api.main._process_and_store_source", lambda **kwargs: None)
    for i in range(14):  # the fixture already added one source
        added = client.post(f"/subjects/{sid}/sources/paste", json={"title": f"SYNTHETIC cap {i}", "text": f"SYNTHETIC text {i}."}, headers=h)
        assert added.status_code == 200
    over = client.post(f"/subjects/{sid}/sources/paste", json={"title": "SYNTHETIC cap over", "text": "SYNTHETIC text over."}, headers=h)
    assert over.status_code == 400
    assert "maximum 15 materials per subject" in over.json()["detail"]

    for i in range(9):  # the fixture already created one notebook
        assert client.post("/subjects", json={"name": f"SYNTHETIC cap subject {i}"}, headers=h).status_code == 200
    eleventh = client.post("/subjects", json={"name": "SYNTHETIC cap subject over"}, headers=h)
    assert eleventh.status_code == 400
    assert "maximum 10 subjects" in eleventh.json()["detail"]


def test_upload_ingestion_runs_off_the_event_loop(world, monkeypatch):
    """Parsing and embedding must not block the event loop, or the host's health check
    times out mid-upload and the server is restarted."""
    import asyncio

    h, sid = world["headers"], world["ids"]["subject_id"]
    seen = []

    def record_loop_state(**kwargs):
        try:
            asyncio.get_running_loop()
            seen.append("event loop")
        except RuntimeError:
            seen.append("worker thread")

    monkeypatch.setattr("api.main._process_and_store_source", record_loop_state)
    res = client.post(
        f"/subjects/{sid}/sources/upload",
        files={"file": (f"SYNTHETIC-offloop-{uuid.uuid4().hex[:8]}.txt", b"SYNTHETIC upload text.", "text/plain")},
        headers=h,
    )
    assert res.status_code == 200
    assert seen == ["worker thread"]
