import io
import pytest
from pathlib import Path
from reportlab.pdfgen import canvas
from ingestion.parser import parse_pdf


def create_sample_pdf_bytes() -> bytes:
    """Generate an in-memory 3-page PDF where page 2 is blank."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)

    # Page 1: Has content
    c.drawString(100, 750, "Page 1: Introduction to Computer Science and Algorithms.")
    c.drawString(100, 730, "This syllabus outlines all grading criteria.")
    c.showPage()

    # Page 2: Blank / empty page
    c.showPage()

    # Page 3: Has content
    c.drawString(100, 750, "Page 3: Final Exam will be held on December 15th.")
    c.drawString(100, 730, "No cheat sheets allowed.")
    c.showPage()

    c.save()
    buffer.seek(0)
    return buffer.getvalue()


@pytest.fixture
def sample_pdf_path(tmp_path: Path) -> Path:
    pdf_bytes = create_sample_pdf_bytes()
    file_path = tmp_path / "course_syllabus.pdf"
    file_path.write_bytes(pdf_bytes)
    return file_path


def test_parse_pdf_extracts_pages_with_empty_handled(sample_pdf_path: Path):
    """Test extracting all pages while preserving empty pages and page numbers."""
    pages = parse_pdf(sample_pdf_path)

    assert len(pages) == 3

    # Page 1
    file_1, page_1, text_1 = pages[0]
    assert file_1 == "course_syllabus.pdf"
    assert page_1 == 1
    assert "Page 1: Introduction to Computer Science" in text_1

    # Page 2 (empty page)
    file_2, page_2, text_2 = pages[1]
    assert file_2 == "course_syllabus.pdf"
    assert page_2 == 2
    assert text_2 == ""

    # Page 3
    file_3, page_3, text_3 = pages[2]
    assert file_3 == "course_syllabus.pdf"
    assert page_3 == 3
    assert "Page 3: Final Exam will be held on December 15th" in text_3


def test_parse_pdf_skip_empty(sample_pdf_path: Path):
    """Test skipping empty pages while preserving page indices."""
    pages = parse_pdf(sample_pdf_path, skip_empty=True)

    assert len(pages) == 2
    assert pages[0][1] == 1
    assert pages[1][1] == 3
    assert "Page 3: Final Exam" in pages[1][2]


def test_parse_pdf_from_stream():
    """Test parsing directly from a BytesIO stream."""
    stream = io.BytesIO(create_sample_pdf_bytes())
    pages = parse_pdf(stream, file_name="in_memory_doc.pdf")

    assert len(pages) == 3
    assert pages[0][0] == "in_memory_doc.pdf"
    assert pages[0][1] == 1
    assert pages[2][1] == 3


def test_parse_pdf_nonexistent_file(tmp_path: Path):
    """Test error handling when file does not exist."""
    with pytest.raises(FileNotFoundError):
        parse_pdf(tmp_path / "does_not_exist.pdf")


def test_parse_pdf_strips_nul_bytes(monkeypatch):
    """PostgreSQL text fields cannot hold NUL bytes, so the parser must remove them."""
    import io
    from ingestion import parser

    class FakePage:
        def extract_text(self):
            return "  before\x00after \x00 "

    class FakeReader:
        def __init__(self, source):
            self.pages = [FakePage()]

    monkeypatch.setattr(parser.pypdf, "PdfReader", FakeReader)
    result = parser.parse_pdf(io.BytesIO(b"x"), file_name="f.pdf")
    assert result == [("f.pdf", 1, "beforeafter")]
