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
