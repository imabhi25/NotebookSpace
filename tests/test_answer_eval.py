import json
import io
from pathlib import Path
import pytest
from reportlab.pdfgen import canvas

from answering.llm import FakeLLMClient
from db.store import delete_document
from evaluation.run_answer_eval import calculate_percentile, evaluate_answering
from ingestion.pipeline import ingest_pdf


def test_calculate_percentile():
    data = [1.0, 2.0, 3.0, 4.0, 5.0]
    assert calculate_percentile(data, 50) == 3.0
    assert calculate_percentile([10.0], 50) == 10.0
    assert calculate_percentile([], 50) == 0.0


def test_evaluate_answering_pipeline(tmp_path: Path):
    file_name = "eval_answering_doc.pdf"
    delete_document(file_name)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    c.drawString(100, 750, "Course Grading is 50 percent final exam.")
    c.showPage()
    c.drawString(100, 750, "Project requires proposal and implementation.")
    c.showPage()
    c.save()
    buffer.seek(0)
    ingest_pdf(buffer, file_name=file_name)

    test_questions = [
        {
            "id": "e1",
            "question": "What is the final exam percentage?",
            "type": "single_page",
            "expected_sources": [{"file": file_name, "page": 1}],
            "expected_answer_contains": ["50 percent"],
        },
        {
            "id": "e2",
            "question": "What is the secret professor passcode?",
            "type": "not_in_documents",
            "expected_sources": [],
            "expected_answer_contains": [],
        },
    ]

    q_file = tmp_path / "questions.json"
    q_file.write_text(json.dumps(test_questions), encoding="utf-8")

    # Responses: 1st for e1 (supported answer), 2nd for e2 (unsupported / not found)
    resp_e1 = (
        '{"supported": true, "answer": "Final exam is 50 percent [eval_answering_doc.pdf p.1]", '
        f'"citations": [{{"file": "{file_name}", "page": 1}}]}}'
    )
    resp_e2 = '{"supported": false, "answer": "NOT_FOUND", "citations": []}'

    fake_client = FakeLLMClient(
        responses=[resp_e1, resp_e2],
        cache_dir=tmp_path / "cache",
    )

    report = evaluate_answering(
        questions_path=q_file,
        llm_client=fake_client,
        results_dir=tmp_path / "results",
    )

    assert report["total_questions"] == 2
    assert "single_page" in report["by_type"]
    assert report["by_type"]["single_page"]["answered_rate"] == 1.0
    assert report["by_type"]["single_page"]["cited_page_correct_rate"] == 1.0
    assert report["by_type"]["single_page"]["abstained_on_answerable_rate"] == 0.0

    assert "not_in_documents" in report["by_type"]
    assert report["by_type"]["not_in_documents"]["unsupported_answer_rate"] == 0.0
    assert report["by_type"]["not_in_documents"]["abstention_rate"] == 1.0

    assert report["tokens"]["total"] > 0
    assert Path(report["saved_to"]).exists()
    assert len(report["failures"]) == 0

    delete_document(file_name)
