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
