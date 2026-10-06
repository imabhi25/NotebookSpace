import io
import pytest
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas
from api.main import app
from db.store import delete_document

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_search_endpoint():
    response = client.post("/search", json={"question": "Where are office hours?", "k": 3})
    assert response.status_code == 200
    data = response.json()
    assert "query" in data
    assert "k" in data
    assert "results" in data
    assert data["k"] == 3
    assert isinstance(data["results"], list)


def test_ask_endpoint(monkeypatch):
    """Test POST /ask returns the expected schema."""
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    response = client.post("/ask", json={"question": "What is the grading policy?", "k": 3})
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert "citations" in data
    assert "abstained" in data
    assert "abstain_reason" in data
    assert "retrieved" in data
    assert "tokens" in data
    assert "latency" in data
    assert isinstance(data["citations"], list)
    assert isinstance(data["tokens"], dict)


def test_upload_endpoint():
    file_name = "api_upload_test.pdf"
    delete_document(file_name)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    c.drawString(100, 750, "Course API test content on page 1.")
    c.showPage()
    c.save()
    buffer.seek(0)

    response = client.post(
        "/upload",
        files={"file": (file_name, buffer.getvalue(), "application/pdf")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["file_name"] == file_name
    assert data["chunks_stored"] == 1

    delete_document(file_name)


def test_upload_invalid_extension():
    response = client.post(
        "/upload",
        files={"file": ("notes.txt", b"plain text", "text/plain")},
    )
    assert response.status_code == 400


def test_upload_exceeds_size_limit():
    """Test that uploading a file larger than 10MB returns 413."""
    oversized_content = b"0" * (10 * 1024 * 1024 + 100)  # > 10MB
    response = client.post(
        "/upload",
        files={"file": ("huge_doc.pdf", oversized_content, "application/pdf")},
    )
    assert response.status_code == 413
    assert "10 MB" in response.json()["detail"]


def test_upload_corrupted_pdf_generic_error():
    """Test that corrupted PDF returns generic 500 error without leaking exception text."""
    corrupted_content = b"%PDF-1.4 completely invalid bytes"
    response = client.post(
        "/upload",
        files={"file": ("corrupt.pdf", corrupted_content, "application/pdf")},
    )
    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail == "An error occurred while processing the uploaded file."
