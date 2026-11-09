"""include_passages option on the source-detail endpoint (no database needed)."""
from fastapi.testclient import TestClient

import api.main as main
from api.main import app

SUBJECT_ID = "subj-1"
SOURCE_ID = "src-1"


def _source(subject_id: str = SUBJECT_ID) -> dict:
    return {"id": SOURCE_ID, "subject_id": subject_id, "title": "Doc", "raw_content": "--- Page 1 ---\nhello"}


def _client(monkeypatch, source, calls):
    app.dependency_overrides[main.get_current_user_or_404] = lambda: {"id": "user-1"}

    def fake_get_source(user_id, source_id, include_raw_content=False, **kw):
        calls.append(("source", user_id, source_id, include_raw_content))
        return dict(source) if source else None

    def fake_passages(user_id, source_id, **kw):
        calls.append(("passages", user_id, source_id))
        return [{"id": "c1", "text": "hello", "chunk_text": "hello", "page_number": 1}]

    monkeypatch.setattr(main, "get_source_by_id", fake_get_source)
    monkeypatch.setattr(main, "get_source_passages", fake_passages)
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_default_still_returns_passages(monkeypatch):
    calls = []
    body = _client(monkeypatch, _source(), calls).get(f"/subjects/{SUBJECT_ID}/sources/{SOURCE_ID}").json()
    assert body["raw_content"].startswith("--- Page 1 ---")
    assert len(body["passages"]) == 1
    assert ("passages", "user-1", SOURCE_ID) in calls


def test_opt_out_returns_raw_content_without_passages_or_query(monkeypatch):
    calls = []
    resp = _client(monkeypatch, _source(), calls).get(
        f"/subjects/{SUBJECT_ID}/sources/{SOURCE_ID}?include_passages=false"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["raw_content"].startswith("--- Page 1 ---")
    assert body["passages"] == []
    assert not any(c[0] == "passages" for c in calls)


def test_scoping_holds_in_both_modes(monkeypatch):
    for suffix in ("", "?include_passages=false"):
        calls = []
        other_subject = _client(monkeypatch, _source(subject_id="someone-elses"), calls)
        assert other_subject.get(f"/subjects/{SUBJECT_ID}/sources/{SOURCE_ID}{suffix}").status_code == 404
        missing = _client(monkeypatch, None, [])
        assert missing.get(f"/subjects/{SUBJECT_ID}/sources/{SOURCE_ID}{suffix}").status_code == 404
