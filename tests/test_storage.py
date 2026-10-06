import io
import pytest
from pathlib import Path
from reportlab.pdfgen import canvas
from db.connection import get_connection
from db.store import delete_document, get_document_chunks_count, store_document_chunks
from ingestion.chunker import Chunk
from ingestion.embedder import embed_batch, embed_text
from ingestion.pipeline import ingest_pdf


def test_embedder_dimensions():
    """Verify that FastEmbed model produces 384-dimensional embeddings."""
    vec = embed_text("Course document sample text")
    assert isinstance(vec, list)
    assert len(vec) == 384

    batch_vecs = embed_batch(["Hello world", "Machine Learning lecture"])
    assert len(batch_vecs) == 2
    assert len(batch_vecs[0]) == 384
    assert len(batch_vecs[1]) == 384


def test_embed_five_sentences_unit_normalized():
    """Verify that embedding 5 fixed sentences produces 384-dim vectors with unit L2 norm."""
    sentences = [
        "The course syllabus outlines lecture topics and grading criteria.",
        "Assignment one is due on Friday at midnight.",
        "Office hours are held on Tuesdays and Thursdays in room 302.",
        "Final examination accounts for fifty percent of the total grade.",
        "Academic honesty policy is strictly enforced across all submissions.",
    ]
    vectors = embed_batch(sentences)
    assert len(vectors) == 5
    for vec in vectors:
        assert isinstance(vec, list)
        assert len(vec) == 384
        l2_norm = sum(x * x for x in vec) ** 0.5
        assert pytest.approx(1.0, abs=1e-4) == l2_norm

    single_vec = embed_text(sentences[0])
    assert len(single_vec) == 384
    assert pytest.approx(1.0, abs=1e-4) == (sum(x * x for x in single_vec) ** 0.5)


def test_store_and_idempotency():
    """Verify that storing chunks is idempotent and does not create duplicate entries."""
    test_file = "test_idempotent_doc.pdf"

    # Cleanup any prior state
    delete_document(test_file)

    chunks = [
        Chunk(file_name=test_file, page_number=1, chunk_index=0, text="First chunk on page 1"),
        Chunk(file_name=test_file, page_number=1, chunk_index=1, text="Second chunk on page 1"),
        Chunk(file_name=test_file, page_number=2, chunk_index=2, text="Third chunk on page 2"),
    ]
    embeddings = embed_batch([c.text for c in chunks])

    # First ingestion
    stored_1 = store_document_chunks(test_file, chunks, embeddings)
    assert stored_1 == 3
    assert get_document_chunks_count(test_file) == 3

    # Re-upload the exact same document chunks (idempotent operation)
    stored_2 = store_document_chunks(test_file, chunks, embeddings)
    assert stored_2 == 3
    assert get_document_chunks_count(test_file) == 3

    # Cleanup
    delete_document(test_file)
    assert get_document_chunks_count(test_file) == 0


def test_full_pipeline_ingest_idempotent(tmp_path: Path):
    """Test full pipeline PDF ingestion and idempotency."""
    pdf_path = tmp_path / "sample_syllabus.pdf"

    # Create 2-page sample PDF
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    c.drawString(100, 750, "Computer Science 101 Syllabus. Prerequisites: Math 100.")
    c.showPage()
    c.drawString(100, 750, "Grading: Midterm 30 percent, Final Exam 50 percent, Labs 20 percent.")
    c.showPage()
    c.save()
    pdf_path.write_bytes(buffer.getvalue())

    # Ingest first time
    count_1 = ingest_pdf(pdf_path)
    assert count_1 == 2
    assert get_document_chunks_count("sample_syllabus.pdf") == 2

    # Ingest second time
    count_2 = ingest_pdf(pdf_path)
    assert count_2 == 2
    assert get_document_chunks_count("sample_syllabus.pdf") == 2

    # Clean up
    delete_document("sample_syllabus.pdf")
