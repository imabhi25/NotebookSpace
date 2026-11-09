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
    assert response.json()["status"] == "ok"


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
    assert "conflicts" in data
    assert "conflict_detected" in data
    assert isinstance(data["citations"], list)
    assert isinstance(data["conflicts"], list)
    assert isinstance(data["conflict_detected"], bool)
    assert isinstance(data["tokens"], dict)


def test_ask_response_optional_model():
    """Verify AskResponse handles the optional model field."""
    from api.main import AskResponse, TokenUsage
    resp = AskResponse(
        answer="sample",
        citations=[],
        conflicts=[],
        conflict_detected=False,
        abstained=False,
        abstain_reason=None,
        retrieved=[],
        tokens=TokenUsage(input=1, output=1, total=2),
        latency=0.2,
        model="gemini-1.5-flash",
    )
    assert resp.model == "gemini-1.5-flash"

    resp_default = AskResponse(
        answer="sample",
        citations=[],
        conflicts=[],
        conflict_detected=False,
        abstained=False,
        abstain_reason=None,
        retrieved=[],
        tokens=TokenUsage(input=1, output=1, total=2),
        latency=0.2,
    )
    assert resp_default.model is None


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
    """Test that uploading a file larger than MAX_UPLOAD_SIZE_BYTES returns 413."""
    from api.main import MAX_UPLOAD_SIZE_BYTES
    oversized_content = b"0" * (MAX_UPLOAD_SIZE_BYTES + 100)
    response = client.post(
        "/upload",
        files={"file": ("huge_doc.pdf", oversized_content, "application/pdf")},
    )
    assert response.status_code == 413
    assert "limit" in response.json()["detail"].lower()


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


def test_cors_headers():
    """Test CORS headers allow http://localhost:5173."""
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_documents_endpoint():
    """Test GET /documents lists documents with file_name, upload_date, and chunk_count."""
    file_name = "api_documents_test.pdf"
    delete_document(file_name)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    c.drawString(100, 750, "Doc test content")
    c.showPage()
    c.save()
    buffer.seek(0)

    client.post(
        "/upload",
        files={"file": (file_name, buffer.getvalue(), "application/pdf")},
    )

    response = client.get("/documents")
    assert response.status_code == 200
    docs = response.json()
    assert isinstance(docs, list)
    found = next((d for d in docs if d["file_name"] == file_name), None)
    assert found is not None
    assert "upload_date" in found
    assert found["chunk_count"] >= 1

    delete_document(file_name)


def test_passages_endpoint():
    """Test GET /passages returns page chunks for a given file and page."""
    file_name = "api_passages_test.pdf"
    delete_document(file_name)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    c.drawString(100, 750, "Sample page 1 content here")
    c.showPage()
    c.drawString(100, 750, "Sample page 2 content here")
    c.showPage()
    c.save()
    buffer.seek(0)

    client.post(
        "/upload",
        files={"file": (file_name, buffer.getvalue(), "application/pdf")},
    )

    # Shared demo documents are readable by any signed-in session, never anonymously.
    assert client.get(f"/passages?file={file_name}&page=1").status_code == 404
    token = client.post("/auth/guest-session").json()["token"]
    response = client.get(
        f"/passages?file={file_name}&page=1",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    passages = response.json()
    assert isinstance(passages, list)
    assert len(passages) >= 1
    assert passages[0]["file_name"] == file_name
    assert passages[0]["page_number"] == 1
    assert "text" in passages[0]

    delete_document(file_name)


def test_demo_mode_upload_disabled(monkeypatch):
    """Test POST /upload returns 403 when DEMO_MODE=true."""
    monkeypatch.setenv("DEMO_MODE", "true")
    buffer = io.BytesIO(b"%PDF-1.4 test")
    response = client.post(
        "/upload",
        files={"file": ("test.pdf", buffer.getvalue(), "application/pdf")},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Upload is disabled in demo mode."


def test_demo_mode_ask_rate_limit(monkeypatch):
    """Test POST /ask rate limiting per IP when DEMO_MODE=true."""
    from api.main import reset_rate_limits

    reset_rate_limits()
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("DEMO_ASK_PER_MINUTE", "3")
    monkeypatch.setenv("LLM_PROVIDER", "fake")

    client_ip_headers = {"X-Forwarded-For": "192.168.1.100"}

    # 3 requests should succeed
    for _ in range(3):
        res = client.post(
            "/ask",
            json={"question": "What is the policy?", "k": 1},
            headers=client_ip_headers,
        )
        assert res.status_code == 200

    # 4th request from same IP should be rejected with 429
    res_blocked = client.post(
        "/ask",
        json={"question": "What is the policy?", "k": 1},
        headers=client_ip_headers,
    )
    assert res_blocked.status_code == 429
    assert (
        res_blocked.json()["detail"]
        == "Rate limit exceeded. Demo allows up to 3 questions per minute."
    )

    # Different IP should succeed
    res_other = client.post(
        "/ask",
        json={"question": "What is the policy?", "k": 1},
        headers={"X-Forwarded-For": "192.168.1.200"},
    )
    assert res_other.status_code == 200

    reset_rate_limits()




def test_demo_rate_limit_ignores_forged_forwarded_for_prefix(monkeypatch):
    """Rotating the first X-Forwarded-For entry must not bypass the limit."""
    from api.main import reset_rate_limits

    reset_rate_limits()
    monkeypatch.setenv("DEMO_MODE", "true")
    monkeypatch.setenv("DEMO_ASK_PER_MINUTE", "2")
    monkeypatch.setenv("LLM_PROVIDER", "fake")

    statuses = []
    for i in range(3):
        res = client.post(
            "/ask",
            json={"question": "q", "k": 1},
            headers={"X-Forwarded-For": f"10.0.0.{i}, 203.0.113.7"},
        )
        statuses.append(res.status_code)
    assert statuses[-1] == 429
    reset_rate_limits()


def test_ask_endpoint_model_null_on_pre_generation_abstention(monkeypatch):
    """Verify /ask returns model=null when abstaining before any model invocation."""
    class FailingLLMClient:
        model = "should-not-be-called"

        def generate(self, system: str, user: str):
            raise AssertionError("generate() must not be invoked when abstaining on low retrieval score")

    monkeypatch.setattr("answering.answer.get_llm_client", lambda: FailingLLMClient())
    monkeypatch.setattr("answering.answer.search", lambda question, k=5, db_url=None: [])

    response = client.post(
        "/ask",
        json={"question": "Nonexistent course info query", "k": 3},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["abstained"] is True
    assert data["abstain_reason"] == "low_retrieval_score"
    assert data["model"] is None


def test_ask_endpoint_returns_custom_model_name(monkeypatch, tmp_path):
    """Verify /ask returns the model name from the LLM client, including on cached replay."""
    from answering.llm import FakeLLMClient

    custom_model = "fake-custom-llm-v1"
    client_instance = FakeLLMClient(
        model=custom_model,
        default_response='{"supported": true, "answer": "Policy test answer [api_documents_test.pdf p.1]", "citations": [{"file": "api_documents_test.pdf", "page": 1}]}',
        cache_dir=tmp_path / "cache",
    )
    monkeypatch.setattr("answering.answer.get_llm_client", lambda: client_instance)

    file_name = "api_documents_test.pdf"
    delete_document(file_name)
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    c.drawString(100, 750, "The course policy is strictly enforced.")
    c.showPage()
    c.save()
    buffer.seek(0)
    client.post(
        "/upload",
        files={"file": (file_name, buffer.getvalue(), "application/pdf")},
    )

    response = client.post("/ask", json={"question": "What is the course policy?", "k": 3})
    assert response.status_code == 200
    data = response.json()
    assert data["model"] == custom_model

    # Verify cached replay also reports the custom model name
    cached_response = client.post("/ask", json={"question": "What is the course policy?", "k": 3})
    assert cached_response.status_code == 200
    cached_data = cached_response.json()
    assert cached_data["model"] == custom_model

    delete_document(file_name)


def test_old_response_shapes_validate():
    """Verify that old response shapes without model still validate."""
    from api.main import AskResponse, TokenUsage

    old_ask = AskResponse(
        answer="Sample legacy answer",
        citations=[],
        conflicts=[],
        conflict_detected=False,
        abstained=False,
        abstain_reason=None,
        retrieved=[],
        tokens=TokenUsage(input=10, output=5, total=15),
        latency=0.35,
    )
    assert old_ask.model is None
    assert old_ask.answer == "Sample legacy answer"



def test_health_reports_readiness_without_blocking(monkeypatch):
    monkeypatch.setattr("api.main._embedding_model_loaded", lambda: True)
    monkeypatch.setattr("api.main._database_readiness", lambda: "ready")
    body = client.get("/health").json()
    assert body == {"status": "ok", "database": "ready", "embedding": "ready", "ready": True}


def test_health_stays_ok_when_the_database_is_down_and_model_cold(monkeypatch):
    import api.main as m

    monkeypatch.setattr(m, "_embedding_model_loaded", lambda: False)
    monkeypatch.setattr(m, "_database_readiness", lambda: "down")
    monkeypatch.setattr(m, "_health_embedding_state", "cold")
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok" and body["database"] == "down" and body["ready"] is False
    # Warm-up is disabled under test, so a cold model stays "cold" and no thread is started.
    assert body["embedding"] == "cold"
