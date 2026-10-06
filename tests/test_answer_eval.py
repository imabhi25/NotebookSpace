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


def test_evaluate_answering_conflict_metrics(tmp_path: Path):
    doc_a = "eval_conflict_a.pdf"
    doc_b = "eval_conflict_b.pdf"
    delete_document(doc_a)
    delete_document(doc_b)

    buf_a = io.BytesIO()
    c_a = canvas.Canvas(buf_a)
    c_a.drawString(100, 750, "Assignment due date is October 10.")
    c_a.showPage()
    c_a.save()
    buf_a.seek(0)
    ingest_pdf(buf_a, file_name=doc_a)

    buf_b = io.BytesIO()
    c_b = canvas.Canvas(buf_b)
    c_b.drawString(100, 750, "Assignment due date is October 15.")
    c_b.showPage()
    c_b.save()
    buf_b.seek(0)
    ingest_pdf(buf_b, file_name=doc_b)

    questions = [
        {
            "id": "c1",
            "question": "When is the assignment due?",
            "type": "conflicting",
            "expected_sources": [{"file": doc_a, "page": 1}, {"file": doc_b, "page": 1}],
            "expected_conflict_files": [doc_a, doc_b],
            "expected_answer_contains": ["October 10", "October 15"],
        },
        {
            "id": "c2",
            "question": "What is the date in doc A?",
            "type": "single_page",
            "expected_sources": [{"file": doc_a, "page": 1}],
            "expected_answer_contains": ["October 10"],
        },
    ]

    q_file = tmp_path / "conflict_questions.json"
    q_file.write_text(json.dumps(questions), encoding="utf-8")

    # c1: returns detected conflict between doc_a and doc_b
    resp_c1 = (
        '{"supported": true, '
        f'"answer": "Doc A says October 10 [{doc_a} p.1] but Doc B says October 15 [{doc_b} p.1].", '
        f'"citations": [{{"file": "{doc_a}", "page": 1}}, {{"file": "{doc_b}", "page": 1}}], '
        f'"conflicts": [{{"topic": "Due date", "claims": [{{"file": "{doc_a}", "page": 1, "value": "October 10"}}, {{"file": "{doc_b}", "page": 1, "value": "October 15"}}]}}]}}'
    )
    # c2: normal single page answer, no conflict
    resp_c2 = (
        '{"supported": true, '
        f'"answer": "October 10 [{doc_a} p.1]", '
        f'"citations": [{{"file": "{doc_a}", "page": 1}}], '
        '"conflicts": []}'
    )

    fake_client = FakeLLMClient(
        responses=[resp_c1, resp_c2],
        cache_dir=tmp_path / "cache",
    )

    report = evaluate_answering(
        questions_path=q_file,
        llm_client=fake_client,
        results_dir=tmp_path / "results",
    )

    assert report["total_questions"] == 2
    assert "conflicting" in report["by_type"]
    assert report["by_type"]["conflicting"]["conflict_detection_rate"] == 1.0
    assert report["conflict_detection_rate"] == 1.0
    assert report["false_positive_conflict_rate"] == 0.0
    assert len(report["failures"]) == 0

    delete_document(doc_a)
    delete_document(doc_b)


def test_evaluate_answering_with_label_and_markdown(tmp_path: Path):
    doc_name = "eval_md_doc.pdf"
    delete_document(doc_name)

    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(100, 750, "Sample course notes for markdown test.")
    c.showPage()
    c.save()
    buf.seek(0)
    ingest_pdf(buf, file_name=doc_name)

    questions = [
        {
            "id": "md1",
            "question": "What are these notes?",
            "type": "single_page",
            "expected_sources": [{"file": doc_name, "page": 1}],
            "expected_answer_contains": ["Sample course notes"],
        }
    ]
    q_file = tmp_path / "custom_questions.json"
    q_file.write_text(json.dumps(questions), encoding="utf-8")

    fake_client = FakeLLMClient(
        responses=[
            f'{{"supported": true, "answer": "Sample course notes [{doc_name} p.1]", "citations": [{{"file": "{doc_name}", "page": 1}}]}}'
        ],
        cache_dir=tmp_path / "cache",
    )

    report = evaluate_answering(
        questions_path=q_file,
        llm_client=fake_client,
        label="test_run",
        results_dir=tmp_path / "results",
        generate_markdown=True,
    )

    assert report["label"] == "test_run"
    assert "saved_to" in report
    assert "saved_to_markdown" in report
    json_path = Path(report["saved_to"])
    md_path = Path(report["saved_to_markdown"])

    assert json_path.exists()
    assert json_path.name.startswith("test_run_")
    assert json_path.suffix == ".json"

    assert md_path.exists()
    assert md_path.name.startswith("test_run_")
    assert md_path.suffix == ".md"

    md_content = md_path.read_text(encoding="utf-8")
    assert "# Answer Generation Evaluation Report: test_run" in md_content
    assert "Retrieval Hit Rate" in md_content
    assert "Worst Failures by Question Type" in md_content

    delete_document(doc_name)


def test_evaluate_answering_failure_reporting(tmp_path: Path):
    doc_name = "eval_fail_doc.pdf"
    delete_document(doc_name)

    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(100, 750, "The secret pass phrase is not revealed in this course.")
    c.showPage()
    c.save()
    buf.seek(0)
    ingest_pdf(buf, file_name=doc_name)

    # A question that should abstain because document explicitly says it is not revealed
    questions = [
        {
            "id": "fail1",
            "question": "What is the secret pass phrase?",
            "type": "not_in_documents",
            "expected_sources": [],
            "expected_answer_contains": [],
        }
    ]
    q_file = tmp_path / "fail_questions.json"
    q_file.write_text(json.dumps(questions), encoding="utf-8")

    # Model hallucinates supported answer
    fake_client = FakeLLMClient(
        responses=[
            f'{{"supported": true, "answer": "The secret is xyz [{doc_name} p.1]", "citations": [{{"file": "{doc_name}", "page": 1}}]}}'
        ],
        cache_dir=tmp_path / "cache",
    )

    report = evaluate_answering(
        questions_path=q_file,
        llm_client=fake_client,
        label="fail_test",
        results_dir=tmp_path / "results",
        generate_markdown=True,
    )

    assert report["failures_count"] == 1
    worst = report["worst_failures_by_type"]["not_in_documents"]
    assert len(worst) == 1
    fail_entry = worst[0]
    assert fail_entry["id"] == "fail1"
    assert "secret" in fail_entry["question"]
    assert "Abstain" in fail_entry["expected"]
    assert fail_entry["model_answer"].startswith("The secret is xyz")
    assert "Answered unsupported question" in fail_entry["failure_reason"]

    delete_document(doc_name)


def test_evaluate_answering_refuses_canonical_without_label():
    from evaluation.run_answer_eval import project_root
    canonical = project_root / "evaluation" / "questions.json"
    with pytest.raises(ValueError, match="requires a label"):
        evaluate_answering(questions_path=canonical, label=None)


def test_cli_main_refuses_without_label(monkeypatch):
    import sys
    from evaluation.run_answer_eval import main

    monkeypatch.setattr(sys, "argv", ["run_answer_eval.py"])
    with pytest.raises(SystemExit) as exc_info:
        main()
    assert exc_info.value.code == 1

