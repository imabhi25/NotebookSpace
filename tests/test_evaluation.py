import json
import io
import pytest
from pathlib import Path
from reportlab.pdfgen import canvas
from db.store import delete_document
from evaluation.run_retrieval_eval import evaluate_retrieval, is_source_match
from ingestion.pipeline import ingest_pdf


def test_questions_json_format():
    """Verify that evaluation/questions.json strictly follows the required 60-question benchmark schema."""
    questions_file = Path(__file__).resolve().parent.parent / "evaluation" / "questions.json"
    assert questions_file.exists()

    with open(questions_file, "r", encoding="utf-8") as f:
        questions = json.load(f)

    assert isinstance(questions, list)
    assert len(questions) == 60  # Exactly 60 benchmark questions

    # Check unique IDs
    ids = [q["id"] for q in questions]
    assert len(ids) == len(set(ids)), "Question IDs must be unique"

    valid_types = {"single_page", "multi_page", "not_in_documents", "conflicting"}
    type_counts = {t: 0 for t in valid_types}

    sample_docs_dir = Path(__file__).resolve().parent.parent / "docs" / "sample_docs"
    has_sample_docs = sample_docs_dir.exists()

    for q in questions:
        assert "id" in q
        assert "question" in q
        assert isinstance(q["question"], str) and len(q["question"].strip()) > 0
        assert "type" in q
        assert q["type"] in valid_types
        type_counts[q["type"]] += 1
        assert "expected_sources" in q
        assert isinstance(q["expected_sources"], list)

        if q["type"] == "not_in_documents":
            assert q["expected_sources"] == []
        elif q["type"] == "single_page":
            assert len(q["expected_sources"]) == 1
        elif q["type"] == "multi_page":
            assert len(q["expected_sources"]) >= 2
        elif q["type"] == "conflicting":
            assert len(q["expected_sources"]) >= 2
            assert "expected_conflict_files" in q
            assert isinstance(q["expected_conflict_files"], list)
            assert len(q["expected_conflict_files"]) >= 2

        for src in q.get("expected_sources", []):
            assert "file" in src
            assert "page" in src
            assert isinstance(src["file"], str) and src["file"].endswith(".pdf")
            assert isinstance(src["page"], int) and src["page"] >= 1
            if has_sample_docs:
                target_pdf = sample_docs_dir / src["file"]
                assert target_pdf.exists(), f"Referenced file does not exist: {src['file']}"

    assert type_counts["single_page"] == 25, f"Expected 25 single_page questions, got {type_counts['single_page']}"
    assert type_counts["multi_page"] == 10, f"Expected 10 multi_page questions, got {type_counts['multi_page']}"
    assert type_counts["not_in_documents"] == 15, f"Expected 15 not_in_documents questions, got {type_counts['not_in_documents']}"
    assert type_counts["conflicting"] == 10, f"Expected 10 conflicting questions, got {type_counts['conflicting']}"


def test_source_matching_helper():
    """Verify is_source_match handles casing and path differences."""
    assert is_source_match("syllabus.pdf", 1, "syllabus.pdf", 1)
    assert is_source_match("SYLLABUS.PDF", 2, "syllabus.pdf", 2)
    assert is_source_match("/path/to/syllabus.pdf", 3, "syllabus.pdf", 3)
    assert not is_source_match("syllabus.pdf", 1, "syllabus.pdf", 2)
    assert not is_source_match("other.pdf", 1, "syllabus.pdf", 1)


def test_evaluation_run_with_seeded_data(tmp_path: Path):
    """Test evaluate_retrieval on temporary test data and verify metrics reporting."""
    file_name = "eval_test_syllabus.pdf"
    delete_document(file_name)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    c.drawString(100, 750, "Grading Breakdown: Final exam is worth 50 percent, Midterm 30 percent.")
    c.showPage()
    c.drawString(100, 750, "Office hours are on Wednesdays at 10 AM in Lassonde building room 200.")
    c.showPage()
    c.save()
    buffer.seek(0)
    ingest_pdf(buffer, file_name=file_name)

    test_questions = [
        {
            "id": "t1",
            "question": "What is the final exam percentage weight?",
            "type": "single_page",
            "expected_sources": [{"file": file_name, "page": 1}],
        },
        {
            "id": "t2",
            "question": "Where are office hours located?",
            "type": "single_page",
            "expected_sources": [{"file": file_name, "page": 2}],
        },
        {
            "id": "t3",
            "question": "What is the secret passkey for the course server?",
            "type": "not_in_documents",
            "expected_sources": [],
        },
    ]

    q_file = tmp_path / "test_questions.json"
    q_file.write_text(json.dumps(test_questions), encoding="utf-8")

    report = evaluate_retrieval(q_file)

    assert report["total_questions"] == 3
    assert report["total_answerable"] == 2
    assert report["not_in_documents_count"] == 1
    assert report["top_3_hits"] == 2
    assert report["top_5_hits"] == 2
    assert report["recall_at_3"] == 1.0
    assert report["recall_at_5"] == 1.0
    assert len(report["misses"]) == 0

    delete_document(file_name)
