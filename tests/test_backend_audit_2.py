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


# --- A retry asks the model again instead of replaying the cached answer ------------------

def test_retry_bypasses_the_llm_response_cache(tmp_path):
    from answering.llm import FakeLLMClient

    cache = tmp_path / "cache"
    FakeLLMClient(default_response="SYNTHETIC first", cache_dir=cache).generate("s", "u")
    replay = FakeLLMClient(default_response="SYNTHETIC second", cache_dir=cache)
    assert replay.generate("s", "u").text == "SYNTHETIC first"
    replay.read_cache = False
    assert replay.generate("s", "u").text == "SYNTHETIC second"
    assert replay.call_count == 1


def test_notebook_retry_calls_the_model_even_for_a_cached_prompt(nb, monkeypatch):
    import answering.notebook_answer as na
    from answering.llm import FakeLLMClient

    model_calls: list[str] = []

    class _Counting(FakeLLMClient):
        def _raw_generate(self, system, user):
            model_calls.append(user)
            return "not json", 1, 1

    monkeypatch.setattr(na, "get_llm_client", lambda *a, **k: _Counting())
    url = f"/subjects/{nb['sid']}/conversations/{nb['conv']}/messages"
    body = {"selected_source_ids": [nb["src"]], "question": "What is a binary heap?"}
    first = client.post(url, json=body, headers=nb["h"]).json()
    retry = {**body, "is_retry": True}
    second = client.post(url, json={**retry, "retry_message_id": first["id"]}, headers=nb["h"]).json()
    calls_before = len(model_calls)
    # The second retry sends exactly the prompt the first retry sent.
    client.post(url, json={**retry, "retry_message_id": second["id"]}, headers=nb["h"])
    assert model_calls[calls_before] == model_calls[calls_before - 2]
    assert len(model_calls) > calls_before


# --- Reserved addresses can't be registered -------------------------------------------------

@pytest.mark.parametrize("email", ["guest_abcdef123456@notebookspace.local", "Student@NotebookSpace.local"])
def test_reserved_email_domain_cannot_register(clean_limits, email):
    resp = client.post("/auth/register", json={"email": email, "password": "SYNTHETIC-pass"})
    assert resp.status_code == 400


# --- Replacing a source with a file makes it a file source ----------------------------------

def test_replacing_a_pasted_source_with_a_file_drops_the_old_text(nb):
    base = f"/subjects/{nb['sid']}/sources/{nb['src']}"
    resp = client.post(
        f"{base}/replace",
        files={"file": ("SYNTHETIC notes.md", b"SYNTHETIC TEST TEXT about tries and heaps.", "text/markdown")},
        headers=nb["h"],
    )
    assert resp.status_code == 200
    src = client.get(base, headers=nb["h"]).json()
    assert src["source_type"] == "markdown"
    assert "tries" in src["raw_content"]


def test_failed_replace_does_not_retry_from_the_old_text(nb, monkeypatch):
    def broken(*args, **kwargs):
        raise ValueError("SYNTHETIC parse failure")

    monkeypatch.setattr(main, "_parse_uploaded_pages", broken)
    base = f"/subjects/{nb['sid']}/sources/{nb['src']}"
    failed = client.post(
        f"{base}/replace", files={"file": ("SYNTHETIC new.txt", b"SYNTHETIC new text", "text/plain")}, headers=nb["h"]
    ).json()
    assert failed["status"] == "failed"
    assert failed["source_type"] == "txt"
    # Retrying would otherwise mark the source ready again with the text it was replaced from.
    assert client.post(f"{base}/retry", headers=nb["h"]).status_code == 400


def test_failed_answer_retry_removes_old_row_on_reload(nb, monkeypatch):
    import answering.notebook_answer as na
    from answering.llm import LLMResponse, LLMServiceError

    class FailsThenSucceeds:
        model = 'test'
        calls = 0

        def generate(self, system, user):
            self.calls += 1
            if self.calls == 1:
                raise LLMServiceError('quota', 'provider detail')
            return LLMResponse('{"supported": true, "answer": "A heap is a data structure.", "citations": []}', 1, 1, 0.1)

    model = FailsThenSucceeds()
    monkeypatch.setattr(na, 'get_llm_client', lambda: model)
    monkeypatch.setattr(na, 'search_scoped', lambda **kwargs: [{'score': 0.9, 'text': 'A heap is a data structure.', 'file': 'heaps.txt', 'page': 1}])
    url = f"/subjects/{nb['sid']}/conversations/{nb['conv']}/messages"
    body = {'selected_source_ids': [nb['src']], 'question': 'What is a heap?'}
    failed = client.post(url, json=body, headers=nb['h']).json()
    assert failed['abstain_reason'] == 'generation_failed'
    assert failed['abstained'] is False
    retried = client.post(url, json={**body, 'is_retry': True, 'retry_message_id': failed['id']}, headers=nb['h'])
    assert retried.status_code == 200
    messages = client.get(url, headers=nb['h']).json()
    assert [message['role'] for message in messages] == ['user', 'assistant']
    assert failed['id'] not in [message['id'] for message in messages]
    assert messages[-1]['id'] == retried.json()['id']


# --- Retrieval keeps the exact cosine beside the boosted score --------------------------------

def test_search_scoped_returns_exact_raw_cosine_and_final_score(nb):
    from db.notebook_store import search_scoped

    me = client.get("/auth/me", headers=nb["h"]).json()
    results = search_scoped(
        question="binary heaps",
        user_id=me["id"],
        subject_id=nb["sid"],
        selected_source_ids=[nb["src"]],
        k=5,
    )
    assert results
    for r in results:
        assert -1.0 <= r["raw_cosine"] <= 1.0
        if r["matched_terms"]:
            assert r["score"] == min(1.0, max(r["raw_cosine"] + 0.30, 0.40))
        else:
            assert r["score"] == r["raw_cosine"]
        assert r["similarity_score"] == r["score"]
