import io
from pathlib import Path
import pytest
from reportlab.pdfgen import canvas

from answering.answer import answer_question
from answering.llm import FakeLLMClient
from db.store import delete_document
from ingestion.pipeline import ingest_pdf


@pytest.fixture(scope="module")
def seeded_answering_doc():
    file_name = "answering_test_syllabus.pdf"
    delete_document(file_name)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    # Page 1
    c.drawString(100, 750, "Course Grading: Midterm 40 percent, Final exam 60 percent.")
    c.showPage()
    # Page 2
    c.drawString(100, 750, "Office hours are Wednesdays 1pm to 3pm in room CS-101.")
    c.showPage()
    c.save()
    buffer.seek(0)

    ingest_pdf(buffer, file_name=file_name)
    yield file_name
    delete_document(file_name)


def test_normal_cited_answer(seeded_answering_doc: str, tmp_path: Path):
    """Test standard successful answering with valid citation."""
    fake_json = (
        '{"supported": true, '
        f'"answer": "Office hours are on Wednesdays [answering_test_syllabus.pdf p.2].", '
        f'"citations": [{{"file": "{seeded_answering_doc}", "page": 2}}]}}'
    )
    client = FakeLLMClient(default_response=fake_json, cache_dir=tmp_path / "cache")

    res = answer_question("When are office hours?", k=3, llm_client=client)

    assert res["abstained"] is False
    assert res["abstain_reason"] is None
    assert "Wednesdays" in res["answer"]
    assert len(res["citations"]) == 1
    assert res["citations"][0]["file"] == seeded_answering_doc
    assert res["citations"][0]["page"] == 2
    assert res["tokens"]["input"] > 0
    assert res["tokens"]["output"] > 0
    assert res["latency"] >= 0.0


def test_not_found_abstention(seeded_answering_doc: str, tmp_path: Path):
    """Test model declaring NOT_FOUND converts to proper abstention."""
    fake_json = '{"supported": false, "answer": "NOT_FOUND", "citations": []}'
    client = FakeLLMClient(default_response=fake_json, cache_dir=tmp_path / "cache")

    res = answer_question("What is the exact date of the final exam?", k=3, llm_client=client)

    assert res["abstained"] is True
    assert res["abstain_reason"] == "not_found"
    assert res["answer"] == "NOT_FOUND"
    assert res["citations"] == []


def test_invalid_citation_rejection_empty(seeded_answering_doc: str, tmp_path: Path):
    """Test model providing supported answer with empty citations is rejected."""
    fake_json = '{"supported": true, "answer": "Midterm is 40 percent", "citations": []}'
    client = FakeLLMClient(default_response=fake_json, cache_dir=tmp_path / "cache")

    res = answer_question("What is the midterm weight?", k=3, llm_client=client)

    assert res["abstained"] is True
    assert res["abstain_reason"] == "invalid_citation"
    assert res["citations"] == []


def test_invalid_citation_rejection_hallucinated_page(seeded_answering_doc: str, tmp_path: Path):
    """Test citation pointing to a page/file not retrieved is rejected."""
    fake_json = (
        '{"supported": true, '
        '"answer": "Midterm is 40 percent", '
        f'"citations": [{{"file": "{seeded_answering_doc}", "page": 99}}]}}'
    )
    client = FakeLLMClient(default_response=fake_json, cache_dir=tmp_path / "cache")

    res = answer_question("What is the midterm weight?", k=3, llm_client=client)

    assert res["abstained"] is True
    assert res["abstain_reason"] == "invalid_citation"


def test_bad_json_retry_success(seeded_answering_doc: str, tmp_path: Path):
    """Test retry once when initial model output is not valid JSON."""
    bad_output = "I am a helpful assistant: the midterm is 40%."
    good_json = (
        '{"supported": true, '
        '"answer": "Midterm is 40 percent [answering_test_syllabus.pdf p.1].", '
        f'"citations": [{{"file": "{seeded_answering_doc}", "page": 1}}]}}'
    )
    client = FakeLLMClient(
        responses=[bad_output, good_json],
        cache_dir=tmp_path / "cache",
    )

    res = answer_question("What is the midterm weight?", k=3, llm_client=client)

    assert res["abstained"] is False
    assert res["abstain_reason"] == None
    assert client.call_count == 2


def test_bad_json_retry_then_abstain(seeded_answering_doc: str, tmp_path: Path):
    """Test model failing JSON parse on both attempts results in bad_output abstention."""
    bad_output_1 = "This is not valid json."
    bad_output_2 = "Still not valid json."
    client = FakeLLMClient(
        responses=[bad_output_1, bad_output_2],
        cache_dir=tmp_path / "cache",
    )

    res = answer_question("What is the midterm weight?", k=3, llm_client=client)

    assert res["abstained"] is True
    assert res["abstain_reason"] == "bad_output"
    assert res["citations"] == []
    assert client.call_count == 2


def test_low_score_pre_check(monkeypatch, tmp_path: Path):
    """Test that low similarity score pre-check abstains without calling the LLM."""
    monkeypatch.setenv("SUPPORT_MIN_SCORE", "0.99")  # Unreachably high threshold
    client = FakeLLMClient(default_response="{}", cache_dir=tmp_path / "cache")

    res = answer_question("Completely unrelated query about space travel", k=3, llm_client=client)

    assert res["abstained"] is True
    assert res["abstain_reason"] == "low_retrieval_score"
    assert res["tokens"]["total"] == 0
    assert client.call_count == 0  # Did not call the model!


def test_latency_uses_recorded_model_latency_on_cache_hit(tmp_path, monkeypatch):
    from answering import answer as ans
    from answering.llm import LLMResponse

    class Stub:
        def generate(self, system, user):
            return LLMResponse(
                text='{"supported": true, "answer": "x [a.pdf p.1]", "citations": [{"file": "a.pdf", "page": 1}]}',
                input_tokens=10,
                output_tokens=5,
                latency_seconds=2.5,
            )

    monkeypatch.setattr(
        ans, "search",
        lambda q, k=5, db_url=None: [
            {"file_name": "a.pdf", "page_number": 1, "text": "t", "score": 0.9}
        ],
    )
    out = ans.answer_question("q", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert out["latency"] >= 2.5


def test_conflict_detection_two_distinct_files(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    mock_retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Due Oct 10", "score": 0.9, "upload_date": "2026-09-01T10:00:00"},
        {"file_name": "assignment.pdf", "page_number": 2, "text": "Due Oct 15", "score": 0.88, "upload_date": "2026-09-05T12:00:00"},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: mock_retrieved)

    conflict_json = (
        '{"supported": true, '
        '"answer": "Syllabus says Oct 10 [syllabus.pdf p.1], but assignment says Oct 15 [assignment.pdf p.2].", '
        '"citations": [{"file": "syllabus.pdf", "page": 1}, {"file": "assignment.pdf", "page": 2}], '
        '"conflicts": [{'
        '  "topic": "Due Date", '
        '  "claims": ['
        '    {"file": "syllabus.pdf", "page": 1, "value": "October 10"}, '
        '    {"file": "assignment.pdf", "page": 2, "value": "October 15"}'
        '  ]'
        '}]}'
    )

    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=conflict_json, input_tokens=10, output_tokens=10, latency_seconds=0.5)

    res = ans.answer_question("When is it due?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")

    assert res["abstained"] is False
    assert res["conflict_detected"] is True
    assert len(res["conflicts"]) == 1
    conflict = res["conflicts"][0]
    assert conflict["topic"] == "Due Date"
    assert len(conflict["claims"]) == 2
    assert conflict["claims"][0]["file"] == "syllabus.pdf"
    assert conflict["claims"][0]["upload_date"] == "2026-09-01T10:00:00"
    assert conflict["claims"][1]["file"] == "assignment.pdf"
    assert conflict["claims"][1]["upload_date"] == "2026-09-05T12:00:00"


def test_conflict_dropped_when_single_file(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    mock_retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Midterm 40%", "score": 0.9, "upload_date": "2026-09-01T10:00:00"},
        {"file_name": "syllabus.pdf", "page_number": 2, "text": "Midterm 50%", "score": 0.88, "upload_date": "2026-09-01T10:00:00"},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: mock_retrieved)

    # Conflict has 2 claims, but both from syllabus.pdf -> must be dropped
    conflict_json = (
        '{"supported": true, '
        '"answer": "Midterm is 40% [syllabus.pdf p.1] or 50% [syllabus.pdf p.2].", '
        '"citations": [{"file": "syllabus.pdf", "page": 1}, {"file": "syllabus.pdf", "page": 2}], '
        '"conflicts": [{'
        '  "topic": "Midterm weight", '
        '  "claims": ['
        '    {"file": "syllabus.pdf", "page": 1, "value": "40%"}, '
        '    {"file": "syllabus.pdf", "page": 2, "value": "50%"}'
        '  ]'
        '}]}'
    )

    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=conflict_json, input_tokens=10, output_tokens=10, latency_seconds=0.5)

    res = ans.answer_question("What is the midterm weight?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")

    assert res["abstained"] is False
    assert res["conflict_detected"] is False
    assert res["conflicts"] == []


def test_conflict_dropped_when_hallucinated_page(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    mock_retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Due Oct 10", "score": 0.9, "upload_date": "2026-09-01T10:00:00"},
        {"file_name": "assignment.pdf", "page_number": 2, "text": "Due Oct 15", "score": 0.88, "upload_date": "2026-09-05T12:00:00"},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: mock_retrieved)

    # Claim points to assignment.pdf page 99 (not in retrieved passages) -> must be dropped
    conflict_json = (
        '{"supported": true, '
        '"answer": "Due date mentioned [syllabus.pdf p.1].", '
        '"citations": [{"file": "syllabus.pdf", "page": 1}], '
        '"conflicts": [{'
        '  "topic": "Due Date", '
        '  "claims": ['
        '    {"file": "syllabus.pdf", "page": 1, "value": "October 10"}, '
        '    {"file": "assignment.pdf", "page": 99, "value": "October 15"}'
        '  ]'
        '}]}'
    )

    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=conflict_json, input_tokens=10, output_tokens=10, latency_seconds=0.5)

    res = ans.answer_question("When is it due?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")

    assert res["abstained"] is False
    assert res["conflict_detected"] is False
    assert res["conflicts"] == []


def test_conflict_dropped_when_insufficient_claims(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    mock_retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Due Oct 10", "score": 0.9, "upload_date": "2026-09-01T10:00:00"},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: mock_retrieved)

    # Only 1 claim in conflict -> must be dropped
    conflict_json = (
        '{"supported": true, '
        '"answer": "Due date mentioned [syllabus.pdf p.1].", '
        '"citations": [{"file": "syllabus.pdf", "page": 1}], '
        '"conflicts": [{'
        '  "topic": "Due Date", '
        '  "claims": ['
        '    {"file": "syllabus.pdf", "page": 1, "value": "October 10"}'
        '  ]'
        '}]}'
    )

    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=conflict_json, input_tokens=10, output_tokens=10, latency_seconds=0.5)

    res = ans.answer_question("When is it due?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")

    assert res["abstained"] is False
    assert res["conflict_detected"] is False
    assert res["conflicts"] == []


import pytest


@pytest.mark.parametrize(
    "v1,v2",
    [("October 10", "october  10"), ("", "October 15"), ("  ", "  ")],
)
def test_conflict_dropped_when_values_do_not_differ(monkeypatch, tmp_path, v1, v2):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "a.pdf", "page_number": 1, "text": "x", "score": 0.9},
        {"file_name": "b.pdf", "page_number": 1, "text": "y", "score": 0.8},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = (
        '{"supported": true, "answer": "x [a.pdf p.1]", '
        '"citations": [{"file": "a.pdf", "page": 1}], '
        '"conflicts": [{"topic": "T", "claims": ['
        '{"file": "a.pdf", "page": 1, "value": "%s"}, '
        '{"file": "b.pdf", "page": 1, "value": "%s"}]}]}' % (v1, v2)
    )

    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=1, output_tokens=1, latency_seconds=0.1)

    res = ans.answer_question("q", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert res["conflict_detected"] is False
    assert res["conflicts"] == []
