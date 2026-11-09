"""The one-click sample notebook ships a second, newer source that conflicts with the syllabus (no database needed)."""
from fastapi.testclient import TestClient

import api.main as main
from api.main import app


def _client(monkeypatch):
    calls = {"sources": [], "processed": [], "messages": [], "search": []}
    app.dependency_overrides[main.get_current_user_or_404] = lambda: {"id": "user-1"}
    monkeypatch.setattr(main, "get_subjects_for_user", lambda **kw: [])
    monkeypatch.setattr(main, "check_user_ask_rate_limit", lambda *a, **kw: None)
    monkeypatch.setattr(main, "create_subject", lambda **kw: {"id": "subj-1"})

    def fake_create_source(**kw):
        calls["sources"].append(kw)
        return {"id": f"src-{len(calls['sources'])}"}

    monkeypatch.setattr(main, "create_source", fake_create_source)
    monkeypatch.setattr(main, "_process_and_store_source", lambda **kw: calls["processed"].append(kw))
    monkeypatch.setattr(main, "create_conversation", lambda **kw: {"id": "conv-1"})
    monkeypatch.setattr(main, "save_message", lambda **kw: calls["messages"].append(kw))

    def fake_search(**kw):
        calls["search"].append(kw)
        return [{"id": 1, "score": 0.74, "matched_terms": ["late"]}]

    monkeypatch.setattr(main, "search_scoped", fake_search)
    monkeypatch.setattr(main, "get_subject_by_id", lambda **kw: {"id": "subj-1", "source_count": 2})
    return TestClient(app), calls


def teardown_function():
    app.dependency_overrides.clear()


def test_sample_ingests_the_syllabus_and_a_conflicting_announcement(monkeypatch):
    client, calls = _client(monkeypatch)
    assert client.post("/subjects/sample").status_code == 200
    assert [s["file_name"] for s in calls["sources"]] == ["syllabus.pdf", "announcement_week4.md"]
    assert [s["source_type"] for s in calls["sources"]] == ["pdf", "markdown"]
    # Both are embedded and indexed.
    assert [p["source_id"] for p in calls["processed"]] == ["src-1", "src-2"]
    announcement_pages = calls["processed"][1]["pages"]
    assert announcement_pages and announcement_pages[0][0] == "announcement_week4.md" and announcement_pages[0][1] == 1
    assert "5 percent per day" in announcement_pages[0][2]


def test_sample_retrieval_covers_both_sources(monkeypatch):
    client, calls = _client(monkeypatch)
    client.post("/subjects/sample")
    assert calls["search"][0]["selected_source_ids"] == ["src-1", "src-2"]


def test_sample_answer_cites_both_sources_and_records_the_conflict(monkeypatch):
    client, calls = _client(monkeypatch)
    client.post("/subjects/sample")
    answer = next(m for m in calls["messages"] if m["role"] == "assistant")
    assert answer["model"] == "Sample"
    assert [(c["file"], c["page"]) for c in answer["citations"]] == [("syllabus.pdf", 2), ("announcement_week4.md", 1)]
    assert [c["source_id"] for c in answer["citations"]] == ["src-1", "src-2"]
    assert "[syllabus.pdf p.2]" in answer["content"] and "[announcement_week4.md p.1]" in answer["content"]
    assert answer["conflict_detected"] is True
    (conflict,) = answer["conflicts"]
    assert conflict["topic"] == "Late penalty"
    assert {(c["file"], c["value"]) for c in conflict["claims"]} == {
        ("syllabus.pdf", "10 percent per day"),
        ("announcement_week4.md", "5 percent per day"),
    }
    assert answer["selected_source_ids"] == ["src-1", "src-2"]
    assert answer["source_versions"] == {"src-1": 1, "src-2": 1}
    # The real retrieved passages are still saved with their scores.
    assert answer["retrieved"][0]["score"] == 0.74


def test_every_citation_claims_a_source_that_was_created(monkeypatch):
    client, calls = _client(monkeypatch)
    client.post("/subjects/sample")
    answer = next(m for m in calls["messages"] if m["role"] == "assistant")
    created = {f"src-{i + 1}" for i in range(len(calls["sources"]))}
    assert {c["source_id"] for c in answer["citations"]} <= created
    assert {c["source_id"] for conf in answer["conflicts"] for c in conf["claims"]} <= created


def test_sample_syllabus_page_2_contains_the_cited_excerpt(monkeypatch):
    client, calls = _client(monkeypatch)
    client.post("/subjects/sample")
    pages = calls["processed"][0]["pages"]
    page2 = next(text for _file, page, text in pages if page == 2)
    answer = next(m for m in calls["messages"] if m["role"] == "assistant")
    syllabus_cite = next(c for c in answer["citations"] if c["file"] == "syllabus.pdf")
    assert syllabus_cite["page"] == 2
    assert syllabus_cite["excerpt"] in page2
    assert "10 percent per day" in page2
