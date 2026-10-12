"""Regression tests for the medium-severity findings of the round-2 audit (M1, M2, M4, M6)."""
import uuid

import pytest
from fastapi.testclient import TestClient

from answering.notebook_answer import build_system_prompt
from api.main import app
from db.connection import get_connection
from tests.test_notebook import make_pdf

client = TestClient(app)


@pytest.fixture
def auth_headers():
    email = f"r2_{uuid.uuid4().hex}@test.com"
    resp = client.post("/auth/register", json={"email": email, "password": "password123"})
    assert resp.status_code == 200
    user_id = resp.json()["user"]["id"]
    yield {"Authorization": f"Bearer {resp.json()['token']}"}
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s;", (user_id,))


@pytest.fixture
def subject_id(auth_headers):
    return client.post("/subjects", json={"name": "Round 2 fixes"}, headers=auth_headers).json()["id"]


class _FakeResponse:
    is_redirect = False

    def __init__(self, content: bytes, content_type: str, status_code: int = 200):
        self.content = content
        self.status_code = status_code
        self.headers = {"content-type": content_type}

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")


def fake_fetch(monkeypatch, content: bytes, content_type: str, status_code: int = 200):
    """Serve `content` for any URL without touching the network or the SSRF resolver."""

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def get(self, url, headers=None):
            return _FakeResponse(content, content_type, status_code)

    monkeypatch.setattr("ingestion.parsers.validate_url_safe", lambda url: None)
    monkeypatch.setattr("ingestion.parsers.httpx.Client", _FakeClient)


def list_sources(subject_id, headers):
    return client.get(f"/subjects/{subject_id}/sources", headers=headers).json()


# --- M1: a link to a PDF must be parsed as a PDF, never stored as raw bytes ---------------

def test_pdf_link_is_ingested_as_pdf_text(monkeypatch, auth_headers, subject_id):
    pdf = make_pdf(["The heron mascot is named Quill and the tutorial room is QX 4."])
    fake_fetch(monkeypatch, pdf, "application/pdf")

    resp = client.post(
        f"/subjects/{subject_id}/sources/url",
        json={"url": "https://files.example.org/handout.pdf"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    src = resp.json()
    assert src["status"] == "ready"

    detail = client.get(f"/subjects/{subject_id}/sources/{src['id']}", headers=auth_headers).json()
    assert "Quill" in detail["raw_content"]
    assert "%PDF" not in detail["raw_content"]
    assert "endobj" not in detail["raw_content"]


def test_pdf_link_detected_by_content_even_when_server_says_html(monkeypatch, auth_headers, subject_id):
    pdf = make_pdf(["Reading week starts October 26 for every section."])
    fake_fetch(monkeypatch, pdf, "text/html; charset=utf-8")

    resp = client.post(
        f"/subjects/{subject_id}/sources/url",
        json={"url": "https://files.example.org/download?id=7"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    detail = client.get(f"/subjects/{subject_id}/sources/{resp.json()['id']}", headers=auth_headers).json()
    assert "Reading week" in detail["raw_content"]
    assert "%PDF" not in detail["raw_content"]


def test_unreadable_pdf_link_is_rejected_with_a_clear_message(monkeypatch, auth_headers, subject_id):
    fake_fetch(monkeypatch, b"%PDF-1.4\n" + b"\x00\x93\xfe garbage " * 60, "application/pdf")

    resp = client.post(
        f"/subjects/{subject_id}/sources/url",
        json={"url": "https://files.example.org/broken.pdf"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "pdf" in resp.json()["detail"].lower()
    assert list_sources(subject_id, auth_headers) == []


def test_other_binary_links_are_rejected(monkeypatch, auth_headers, subject_id):
    fake_fetch(monkeypatch, b"PK\x03\x04" + b"\x00\x01\x02\x03" * 400, "application/zip")

    resp = client.post(
        f"/subjects/{subject_id}/sources/url",
        json={"url": "https://files.example.org/archive.zip"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert list_sources(subject_id, auth_headers) == []


# --- M2: a refused link must not leave a source behind -----------------------------------

def test_refused_link_leaves_no_source_row(auth_headers, subject_id):
    resp = client.post(
        f"/subjects/{subject_id}/sources/url",
        json={"url": "http://127.0.0.1:8000/documents"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "blocked" in resp.json()["detail"].lower()
    assert list_sources(subject_id, auth_headers) == []


def test_refused_links_do_not_use_up_the_source_limit(monkeypatch, auth_headers, subject_id):
    fake_fetch(monkeypatch, b"gone", "text/html", status_code=404)
    for i in range(16):
        resp = client.post(
            f"/subjects/{subject_id}/sources/url",
            json={"url": f"https://example.org/missing-{i}"},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "404" in resp.json()["detail"]
    assert list_sources(subject_id, auth_headers) == []


# --- M4: an interrupted ingestion must not stay on "Processing..." forever ----------------

def _age_source(source_id: str, status: str, minutes: int) -> None:
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE sources SET status = %s, updated_at = CURRENT_TIMESTAMP - make_interval(mins => %s) WHERE id = %s;",
                    (status, minutes, source_id),
                )


def test_stale_processing_source_becomes_failed_and_retryable(monkeypatch, auth_headers, subject_id):
    page = "<html><title>Tides</title><body><p>" + "Tides are caused by the gravity of the moon and the sun. " * 6 + "</p></body></html>"
    fake_fetch(monkeypatch, page.encode(), "text/html")
    src = client.post(
        f"/subjects/{subject_id}/sources/url", json={"url": "https://example.org/tides"}, headers=auth_headers
    ).json()
    assert src["status"] == "ready"

    _age_source(src["id"], "processing", minutes=45)
    listed = list_sources(subject_id, auth_headers)[0]
    assert listed["status"] == "failed"
    assert "interrupted" in listed["error_message"].lower()

    retried = client.post(f"/subjects/{subject_id}/sources/{src['id']}/retry", headers=auth_headers)
    assert retried.status_code == 200
    assert retried.json()["status"] == "ready"


def test_recent_processing_source_is_left_alone(auth_headers, subject_id):
    src = client.post(
        f"/subjects/{subject_id}/sources/paste",
        json={"title": "Fresh notes", "text": "The lab safety code is ORCHID-55 and goggles are mandatory."},
        headers=auth_headers,
    ).json()
    _age_source(src["id"], "processing", minutes=1)
    assert list_sources(subject_id, auth_headers)[0]["status"] == "processing"


def test_interrupted_pasted_source_can_be_retried_from_its_saved_text(auth_headers, subject_id):
    src = client.post(
        f"/subjects/{subject_id}/sources/paste",
        json={"title": "Saved notes", "text": "The archive code for the course is LARCH-90."},
        headers=auth_headers,
    ).json()
    _age_source(src["id"], "processing", minutes=45)
    assert list_sources(subject_id, auth_headers)[0]["status"] == "failed"

    retried = client.post(f"/subjects/{subject_id}/sources/{src['id']}/retry", headers=auth_headers)
    assert retried.status_code == 200
    assert retried.json()["status"] == "ready"


# --- M6: Concise must be a real limit, not a tone suggestion ------------------------------

def test_concise_prompt_sets_a_hard_length_limit():
    concise = build_system_prompt({"response_length": "concise"})
    default = build_system_prompt({"response_length": "default"})
    detailed = build_system_prompt({"response_length": "detailed"})

    assert "60 words" in concise
    assert "60 words" not in default and "60 words" not in detailed
    assert len({concise, default, detailed}) == 3


def test_concise_limit_survives_the_learning_guide_style():
    prompt = build_system_prompt({"response_length": "concise", "response_style": "learning-guide"})
    assert "60 words" in prompt
    assert prompt.index("Response Style") < prompt.index("60 words")
