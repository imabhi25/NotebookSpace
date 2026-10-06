import io
import json
from pathlib import Path
import pytest
from reportlab.pdfgen import canvas

from tools.dump_pages import dump_pages, dump_pdf_pages
from tools.validate_questions import validate_questions_file


@pytest.fixture
def sample_pdf(tmp_path: Path) -> Path:
    pdf_path = tmp_path / "test_sample.pdf"
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    # Page 1: with text
    c.drawString(100, 750, "Content on page one of sample document.")
    c.showPage()
    # Page 2: empty page
    c.showPage()
    # Page 3: with text
    c.drawString(100, 750, "Content on page three.")
    c.showPage()
    c.save()
    pdf_path.write_bytes(buffer.getvalue())
    return pdf_path


def test_dump_pages_single_pdf(sample_pdf: Path, tmp_path: Path, capsys):
    out_dir = tmp_path / "dumps"
    written = dump_pages(sample_pdf, output_dir=out_dir)

    assert len(written) == 1
    dump_file = written[0]
    assert dump_file.exists()
    assert dump_file.name == "test_sample.txt"

    content = dump_file.read_text(encoding="utf-8")
    assert "=== PAGE 1 ===" in content
    assert "Content on page one of sample document." in content
    assert "=== PAGE 2 ===" in content
    assert "=== PAGE 3 ===" in content
    assert "Content on page three." in content

    # Verify stdout mentioned page 2 was empty
    captured = capsys.readouterr()
    assert "Page 2 of test_sample.pdf extracted as empty." in captured.out


def test_dump_pages_directory(tmp_path: Path):
    pdf_dir = tmp_path / "pdf_folder"
    pdf_dir.mkdir()

    for name in ["doc1.pdf", "doc2.pdf"]:
        buf = io.BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(100, 750, f"Text in {name}")
        c.showPage()
        c.save()
        (pdf_dir / name).write_bytes(buf.getvalue())

    out_dir = tmp_path / "dumps"
    written = dump_pages(pdf_dir, output_dir=out_dir)

    assert len(written) == 2
    assert (out_dir / "doc1.txt").exists()
    assert (out_dir / "doc2.txt").exists()


def test_validate_questions_valid_dataset(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    # Create two 2-page sample PDFs
    for name in ["syllabus.pdf", "assignments.pdf"]:
        buf = io.BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(100, 750, f"Page 1 in {name}")
        c.showPage()
        c.drawString(100, 750, f"Page 2 in {name}")
        c.showPage()
        c.save()
        (data_dir / name).write_bytes(buf.getvalue())

    valid_questions = [
        {
            "id": "q1",
            "question": "What is covered on the first day?",
            "type": "single_page",
            "expected_sources": [{"file": "syllabus.pdf", "page": 1}],
        },
        {
            "id": "q2",
            "question": "How do homework assignments connect to the midterm syllabus?",
            "type": "multi_page",
            "expected_sources": [
                {"file": "syllabus.pdf", "page": 1},
                {"file": "assignments.pdf", "page": 2},
            ],
        },
        {
            "id": "q3",
            "question": "What is the secret professor room code?",
            "type": "not_in_documents",
            "expected_sources": [],
        },
        {
            "id": "q4",
            "question": "What is the policy discrepancy between the syllabus and the assignments?",
            "type": "conflicting",
            "expected_sources": [
                {"file": "syllabus.pdf", "page": 2},
                {"file": "assignments.pdf", "page": 1},
            ],
            "expected_conflict_files": ["syllabus.pdf", "assignments.pdf"],
        },
    ]

    q_file = tmp_path / "test_questions.json"
    q_file.write_text(json.dumps(valid_questions), encoding="utf-8")

    is_valid, errors, counts = validate_questions_file(q_file, data_dir=data_dir)
    assert is_valid is True
    assert len(errors) == 0
    assert counts["single_page"] == 1
    assert counts["multi_page"] == 1
    assert counts["not_in_documents"] == 1
    assert counts["conflicting"] == 1


def test_validate_questions_catches_all_error_types(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    # Only create a 1-page PDF
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(100, 750, "Only 1 page here")
    c.showPage()
    c.save()
    (data_dir / "short_doc.pdf").write_bytes(buf.getvalue())

    invalid_questions = [
        # 1. Missing fields
        {"id": "q1", "type": "single_page"},
        # 2. Duplicate ID & duplicate question text & label-like text in question
        {
            "id": "q1",
            "question": "This is a PLACEHOLDER question text.",
            "type": "single_page",
            "expected_sources": [{"file": "short_doc.pdf", "page": 1}],
        },
        {
            "id": "q2",
            "question": "This is a placeholder question text.",
            "type": "single_page",
            "expected_sources": [{"file": "short_doc.pdf", "page": 1}],
        },
        # 3. Placeholder: true entry
        {
            "id": "q3",
            "placeholder": True,
            "question": "Valid text here?",
            "type": "single_page",
            "expected_sources": [{"file": "short_doc.pdf", "page": 1}],
        },
        # 4. not_in_documents with expected_sources
        {
            "id": "q4",
            "question": "What is the passcode?",
            "type": "not_in_documents",
            "expected_sources": [{"file": "short_doc.pdf", "page": 1}],
        },
        # 5. conflicting without 2 distinct files
        {
            "id": "q5",
            "question": "What differs between documents?",
            "type": "conflicting",
            "expected_sources": [{"file": "short_doc.pdf", "page": 1}],
            "expected_conflict_files": ["short_doc.pdf", "short_doc.pdf"],
        },
        # 6. Expected file does not exist
        {
            "id": "q6",
            "question": "Question about missing document?",
            "type": "single_page",
            "expected_sources": [{"file": "ghost.pdf", "page": 1}],
        },
        # 7. Page exceeds total page count (short_doc has 1 page, asking for page 5)
        {
            "id": "q7",
            "question": "Question about non-existent page 5?",
            "type": "single_page",
            "expected_sources": [{"file": "short_doc.pdf", "page": 5}],
        },
    ]

    q_file = tmp_path / "invalid_questions.json"
    q_file.write_text(json.dumps(invalid_questions), encoding="utf-8")

    is_valid, errors, _ = validate_questions_file(q_file, data_dir=data_dir)

    assert is_valid is False
    assert len(errors) >= 7

    error_text = " ".join(errors)
    assert "Duplicate question id" in error_text
    assert "Duplicate question text" in error_text
    assert "label-like text" in error_text
    assert "'placeholder': true" in error_text
    assert "'not_in_documents' but has" in error_text
    assert "must have 2 distinct files" in error_text
    assert "ghost.pdf" in error_text and "not found" in error_text
    assert "page 5 exceeds total page count (1)" in error_text


def test_validate_questions_target_counts(tmp_path: Path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    # Small questions file with only 1 question
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(100, 750, "Doc")
    c.showPage()
    c.save()
    (data_dir / "syllabus.pdf").write_bytes(buf.getvalue())

    questions = [
        {
            "id": "q1",
            "question": "What is covered?",
            "type": "single_page",
            "expected_sources": [{"file": "syllabus.pdf", "page": 1}],
        }
    ]
    q_file = tmp_path / "questions.json"
    q_file.write_text(json.dumps(questions), encoding="utf-8")

    # Without require_targets: passes
    is_valid, errors, _ = validate_questions_file(q_file, data_dir=data_dir, require_targets=False)
    assert is_valid is True

    # With require_targets: fails because single_page count is 1 instead of 25
    is_valid_strict, errors_strict, _ = validate_questions_file(q_file, data_dir=data_dir, require_targets=True)
    assert is_valid_strict is False
    assert any("Target count mismatch for 'single_page'" in err for err in errors_strict)
