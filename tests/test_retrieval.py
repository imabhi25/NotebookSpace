import io
import pytest
from reportlab.pdfgen import canvas
from db.retrieval import search
from db.store import delete_document
from ingestion.pipeline import ingest_pdf


@pytest.fixture(scope="module")
def seeded_syllabus():
    file_name = "retrieval_test_syllabus.pdf"
    delete_document(file_name)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)

    # Page 1: Grading policy
    c.drawString(100, 750, "Grading Policy: Homework is 20 percent, midterm is 30 percent, final exam is 50 percent.")
    c.showPage()

    # Page 2: Office hours
    c.drawString(100, 750, "Instructor office hours are held every Tuesday from 2pm to 4pm in room CS-204.")
    c.showPage()

    # Page 3: Textbook
    c.drawString(100, 750, "Required textbook: Introduction to Algorithms by Cormen, Leiserson, Rivest, and Stein.")
    c.showPage()

    c.save()
    buffer.seek(0)

    ingest_pdf(buffer, file_name=file_name)
    yield file_name
    delete_document(file_name)


def test_search_retrieves_relevant_page(seeded_syllabus: str):
    """Verify that searching for office hours returns Page 2 as the top result."""
    results = search("Where and when are office hours?", k=3)
    assert len(results) >= 1

    top_result = results[0]
    assert top_result["file_name"] == seeded_syllabus
    assert top_result["page_number"] == 2
    assert "office hours" in top_result["text"].lower()
    assert top_result["similarity_score"] > 0.0


def test_search_retrieves_grading_page(seeded_syllabus: str):
    """Verify that searching for final exam weighting returns Page 1 as the top result."""
    results = search("What is the percentage weight of the final exam?", k=3)
    assert len(results) >= 1

    top_result = results[0]
    assert top_result["file_name"] == seeded_syllabus
    assert top_result["page_number"] == 1
    assert "grading policy" in top_result["text"].lower()


def test_search_returns_requested_k(seeded_syllabus: str):
    """Verify that search respects the k limit."""
    results = search("exam and grades", k=2)
    assert len(results) <= 2


def test_search_empty_query():
    """Verify that empty or whitespace queries return empty list safely."""
    results = search("   ", k=5)
    assert results == []


def test_search_includes_upload_date(seeded_syllabus: str):
    """Verify that search results include document upload_date and preserve all existing keys."""
    results = search("grading policy", k=1)
    assert len(results) == 1
    item = results[0]

    # Verify upload_date exists and is populated
    assert "upload_date" in item
    assert isinstance(item["upload_date"], str)
    assert len(item["upload_date"]) > 0

    # Verify all existing keys are still working
    expected_keys = {
        "file",
        "file_name",
        "page",
        "page_number",
        "text",
        "chunk_text",
        "chunk_index",
        "score",
        "similarity_score",
        "upload_date",
    }
    for key in expected_keys:
        assert key in item

