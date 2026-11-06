import io
import uuid
import pytest
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

from api.main import app
from db.connection import get_connection
from db.notebook_store import (
    create_subject,
    create_conversation,
    save_message,
    get_messages_for_conversation,
)
from answering.notebook_answer import answer_notebook_question
from answering.llm import FakeLLMClient

client = TestClient(app)


def make_pdf(pages_text: list[str]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    for text in pages_text:
        c.drawString(100, 750, text)
        c.showPage()
    c.save()
    buf.seek(0)
    return buf.getvalue()


@pytest.fixture
def auth_headers():
    email = f"test_{uuid.uuid4().hex}@test.com"
    resp = client.post("/auth/register", json={"email": email, "password": "password123"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    user_id = resp.json()["user"]["id"]
    yield {"Authorization": f"Bearer {token}", "X-User-Id": user_id}
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s;", (user_id,))


@pytest.fixture
def test_subject(auth_headers):
    resp = client.post(
        "/subjects",
        json={"name": "Source and Send Test Subject", "course_code": "TEST 101"},
        headers={"Authorization": auth_headers["Authorization"]},
    )
    assert resp.status_code == 200
    return resp.json()


def test_upload_unsupported_file_creates_failed_source_row(auth_headers, test_subject):
    """Bug 3: Unsupported file types must consistently create a failed source row instead of throwing 400."""
    sub_id = test_subject["id"]
    headers = {"Authorization": auth_headers["Authorization"]}

    resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("unsupported_data.csv", b"col1,col2\nval1,val2\n", "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "failed"
    assert "Unsupported format" in data["error_message"]
    assert data["file_name"] == "unsupported_data.csv"

    # Also verify it appears in the subject's sources list
    list_resp = client.get(f"/subjects/{sub_id}/sources", headers=headers)
    assert list_resp.status_code == 200
    sources = list_resp.json()
    csv_src = next((s for s in sources if s["file_name"] == "unsupported_data.csv"), None)
    assert csv_src is not None
    assert csv_src["status"] == "failed"
    assert "Unsupported format" in csv_src["error_message"]


def test_upload_empty_file_creates_failed_source_row(auth_headers, test_subject):
    """Bug 3: Empty file creates a failed source row with clear message."""
    sub_id = test_subject["id"]
    headers = {"Authorization": auth_headers["Authorization"]}

    resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("empty.txt", b"", "text/plain")},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "failed"
    assert "empty" in data["error_message"].lower()


def test_replace_source_name_update_rules(auth_headers, test_subject):
    """Bug 3: Replace must update displayed title to replacement's name unless user renamed it."""
    sub_id = test_subject["id"]
    headers = {"Authorization": auth_headers["Authorization"]}

    # 1. Upload initial source without custom renaming
    content1 = b"First version text content for testing algorithms."
    up_resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("initial.txt", content1, "text/plain")},
        headers=headers,
    )
    assert up_resp.status_code == 200
    src1 = up_resp.json()
    assert src1["title"] == "initial.txt"
    assert src1["file_name"] == "initial.txt"

    # Replace with second file (user did not rename)
    content2 = b"Second replacement version content for algorithms."
    rep_resp = client.post(
        f"/subjects/{sub_id}/sources/{src1['id']}/replace",
        files={"file": ("replacement_v2.txt", content2, "text/plain")},
        headers=headers,
    )
    assert rep_resp.status_code == 200
    replaced1 = rep_resp.json()
    assert replaced1["file_name"] == "replacement_v2.txt"
    assert replaced1["title"] == "replacement_v2.txt"

    # 2. Upload another source, but user explicitly renames it
    up_resp2 = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("doc_a.txt", content1, "text/plain")},
        headers=headers,
    )
    assert up_resp2.status_code == 200
    src2 = up_resp2.json()

    # User renames it
    ren_resp = client.put(
        f"/subjects/{sub_id}/sources/{src2['id']}",
        json={"title": "My Custom Notes Title"},
        headers=headers,
    )
    assert ren_resp.status_code == 200
    assert ren_resp.json()["title"] == "My Custom Notes Title"

    # Now replace it with a new file
    rep_resp2 = client.post(
        f"/subjects/{sub_id}/sources/{src2['id']}/replace",
        files={"file": ("doc_b.txt", content2, "text/plain")},
        headers=headers,
    )
    assert rep_resp2.status_code == 200
    replaced2 = rep_resp2.json()
    assert replaced2["file_name"] == "doc_b.txt"
    # Title must remain the user's custom title!
    assert replaced2["title"] == "My Custom Notes Title"


def test_replace_source_with_unsupported_format_marks_failed(auth_headers, test_subject):
    """Bug 3: Replacing a source with an unsupported format marks it failed with a clear message."""
    sub_id = test_subject["id"]
    headers = {"Authorization": auth_headers["Authorization"]}

    content = b"Some valid content for syllabus."
    up_resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("valid.txt", content, "text/plain")},
        headers=headers,
    )
    assert up_resp.status_code == 200
    src = up_resp.json()
    assert src["status"] == "ready"

    # Replace with an unsupported extension (.zip)
    rep_resp = client.post(
        f"/subjects/{sub_id}/sources/{src['id']}/replace",
        files={"file": ("archive.zip", b"PK\x03\x04...", "application/zip")},
        headers=headers,
    )
    assert rep_resp.status_code == 200
    rep_data = rep_resp.json()
    assert rep_data["status"] == "failed"
    assert "Unsupported format" in rep_data["error_message"]


def test_retry_scenario_a_stop_after_save_then_retry(auth_headers, test_subject, monkeypatch):
    """(a) stop after save then Retry -> exactly one assistant answer."""
    import answering.notebook_answer as na

    fake_client = FakeLLMClient(responses=[
        '{"supported": true, "answer": "Answer 1 [course.pdf p.1].", "citations": [{"file": "course.pdf", "page": 1, "quote": "Midterm Exam on Thursday, Nov 19, 2026."}]}',
        '{"supported": true, "answer": "Retried Answer [course.pdf p.1].", "citations": [{"file": "course.pdf", "page": 1, "quote": "Midterm Exam on Thursday, Nov 19, 2026."}]}',
    ])
    monkeypatch.setattr(na, "get_llm_client", lambda **kwargs: fake_client)

    sub_id = test_subject["id"]
    headers = {"Authorization": auth_headers["Authorization"]}

    pdf = make_pdf(["Course Overview\nMidterm Exam on Thursday, Nov 19, 2026."])
    up_resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("course.pdf", pdf, "application/pdf")},
        headers=headers,
    )
    assert up_resp.status_code == 200
    src = up_resp.json()

    conv_resp = client.post(
        f"/subjects/{sub_id}/conversations",
        json={"title": "Test Conv A"},
        headers=headers,
    )
    assert conv_resp.status_code == 200
    conv_id = conv_resp.json()["id"]

    # Initial ask
    ask_resp1 = client.post(
        f"/subjects/{sub_id}/conversations/{conv_id}/messages",
        json={"question": "When is the midterm?", "selected_source_ids": [src["id"]]},
        headers=headers,
    )
    assert ask_resp1.status_code == 200

    # Conversation has [user, assistant]
    msgs_1 = client.get(f"/subjects/{sub_id}/conversations/{conv_id}/messages", headers=headers).json()
    assert len(msgs_1) == 2

    # User clicks Retry (e.g. stopped ID from client)
    retry_resp = client.post(
        f"/subjects/{sub_id}/conversations/{conv_id}/messages",
        json={
            "question": "When is the midterm?",
            "selected_source_ids": [src["id"]],
            "is_retry": True,
            "retry_message_id": "stopped-12345",
        },
        headers=headers,
    )
    assert retry_resp.status_code == 200

    # Conversation must STILL have exactly 2 messages: 1 user, 1 assistant
    msgs_2 = client.get(f"/subjects/{sub_id}/conversations/{conv_id}/messages", headers=headers).json()
    assert len(msgs_2) == 2
    assert msgs_2[0]["role"] == "user"
    assert msgs_2[0]["content"] == "When is the midterm?"
    assert msgs_2[1]["role"] == "assistant"
    assert "Retried Answer" in msgs_2[1]["content"]


def test_retry_scenario_b_stop_before_save_with_earlier_qa(auth_headers, test_subject, monkeypatch):
    """(b) stop before the user message was saved, with an earlier Q1/A1 in the conversation -> Retry keeps A1, saves Q2 and adds one answer A2."""
    import answering.notebook_answer as na

    fake_client = FakeLLMClient(responses=[
        '{"supported": true, "answer": "Answer to Q1 [course.pdf p.1].", "citations": [{"file": "course.pdf", "page": 1, "quote": "Course Overview"}]}',
        '{"supported": true, "answer": "Answer to Q2 [course.pdf p.1].", "citations": [{"file": "course.pdf", "page": 1, "quote": "Midterm Exam on Thursday, Nov 19, 2026."}]}',
    ])
    monkeypatch.setattr(na, "get_llm_client", lambda **kwargs: fake_client)

    sub_id = test_subject["id"]
    headers = {"Authorization": auth_headers["Authorization"]}

    pdf = make_pdf(["Course Overview\nMidterm Exam on Thursday, Nov 19, 2026."])
    up_resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("course.pdf", pdf, "application/pdf")},
        headers=headers,
    )
    assert up_resp.status_code == 200
    src = up_resp.json()

    conv_resp = client.post(
        f"/subjects/{sub_id}/conversations",
        json={"title": "Test Conv B"},
        headers=headers,
    )
    assert conv_resp.status_code == 200
    conv_id = conv_resp.json()["id"]

    # First turn Q1 / A1
    ask1 = client.post(
        f"/subjects/{sub_id}/conversations/{conv_id}/messages",
        json={"question": "What course is this?", "selected_source_ids": [src["id"]]},
        headers=headers,
    )
    assert ask1.status_code == 200

    msgs_1 = client.get(f"/subjects/{sub_id}/conversations/{conv_id}/messages", headers=headers).json()
    assert len(msgs_1) == 2
    assert msgs_1[0]["content"] == "What course is this?"
    assert msgs_1[1]["content"] == "Answer to Q1 [course.pdf p.1]."

    # Now user typed Q2: "When is the midterm?", but generation was stopped before Q2 was saved in DB.
    # The user then clicks Retry for Q2.
    # The backend must NOT remove A1, must save Q2, and must add A2!
    retry_resp = client.post(
        f"/subjects/{sub_id}/conversations/{conv_id}/messages",
        json={
            "question": "When is the midterm?",
            "selected_source_ids": [src["id"]],
            "is_retry": True,
            "retry_message_id": "stopped-99999",
        },
        headers=headers,
    )
    assert retry_resp.status_code == 200

    msgs_2 = client.get(f"/subjects/{sub_id}/conversations/{conv_id}/messages", headers=headers).json()
    # Must have 4 messages: [Q1, A1, Q2, A2]
    assert len(msgs_2) == 4
    assert msgs_2[0]["role"] == "user"
    assert msgs_2[0]["content"] == "What course is this?"
    assert msgs_2[1]["role"] == "assistant"
    assert msgs_2[1]["content"] == "Answer to Q1 [course.pdf p.1]."
    assert msgs_2[2]["role"] == "user"
    assert msgs_2[2]["content"] == "When is the midterm?"
    assert msgs_2[3]["role"] == "assistant"
    assert msgs_2[3]["content"] == "Answer to Q2 [course.pdf p.1]."


def test_retry_scenario_c_failed_provider_answer_replaces_failure(auth_headers, test_subject, monkeypatch):
    """(c) normal retry of a failed provider answer still replaces the failure."""
    import answering.notebook_answer as na
    from answering.llm import LLMServiceError

    # First call will raise LLMServiceError; second call will succeed
    class FailingThenSucceedingLLM:
        def __init__(self):
            self.calls = 0

        def generate(self, system: str, user: str):
            self.calls += 1
            if self.calls == 1:
                raise LLMServiceError("unavailable", "Provider timeout")
            from answering.llm import LLMResponse
            return LLMResponse(
                text='{"supported": true, "answer": "Recovered answer [course.pdf p.1].", "citations": [{"file": "course.pdf", "page": 1, "quote": "Course Overview"}]}',
                latency_seconds=0.1,
                input_tokens=10,
                output_tokens=15,
            )

    failing_client = FailingThenSucceedingLLM()
    monkeypatch.setattr(na, "get_llm_client", lambda **kwargs: failing_client)

    sub_id = test_subject["id"]
    headers = {"Authorization": auth_headers["Authorization"]}

    pdf = make_pdf(["Course Overview\nMidterm Exam on Thursday, Nov 19, 2026."])
    up_resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("course.pdf", pdf, "application/pdf")},
        headers=headers,
    )
    assert up_resp.status_code == 200
    src = up_resp.json()

    conv_resp = client.post(
        f"/subjects/{sub_id}/conversations",
        json={"title": "Test Conv C"},
        headers=headers,
    )
    assert conv_resp.status_code == 200
    conv_id = conv_resp.json()["id"]

    # First ask fails at LLM
    ask1 = client.post(
        f"/subjects/{sub_id}/conversations/{conv_id}/messages",
        json={"question": "When is the midterm exam?", "selected_source_ids": [src["id"]]},
        headers=headers,
    )
    assert ask1.status_code == 200
    failed_msg = ask1.json()
    assert failed_msg["abstained"] is False
    assert failed_msg["abstain_reason"] == "generation_failed"

    msgs_1 = client.get(f"/subjects/{sub_id}/conversations/{conv_id}/messages", headers=headers).json()
    assert len(msgs_1) == 2
    assert msgs_1[1]["id"] == failed_msg["id"]

    # Retry the failed message with its exact retry_message_id
    retry_resp = client.post(
        f"/subjects/{sub_id}/conversations/{conv_id}/messages",
        json={
            "question": "When is the midterm exam?",
            "selected_source_ids": [src["id"]],
            "is_retry": True,
            "retry_message_id": failed_msg["id"],
        },
        headers=headers,
    )
    assert retry_resp.status_code == 200
    retried_msg = retry_resp.json()
    assert "Recovered answer" in retried_msg["content"]

    # Exactly 2 messages in conversation (the failed assistant message was replaced)
    msgs_2 = client.get(f"/subjects/{sub_id}/conversations/{conv_id}/messages", headers=headers).json()
    assert len(msgs_2) == 2
    assert msgs_2[0]["role"] == "user"
    assert msgs_2[1]["role"] == "assistant"
    assert "Recovered answer" in msgs_2[1]["content"]


def test_failed_sources_excluded_from_source_count_and_cap(auth_headers, test_subject):
    """Bug 3: Failed source rows must not count toward the card's source_count or the 15-source limit."""
    sub_id = test_subject["id"]
    headers = {"Authorization": auth_headers["Authorization"]}

    # Initially 0 sources
    subj_resp = client.get(f"/subjects", headers=headers)
    assert subj_resp.status_code == 200
    subj_data = next(s for s in subj_resp.json() if s["id"] == sub_id)
    assert subj_data["source_count"] == 0

    # 1. Upload a failed source (unsupported format)
    resp_failed = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("invalid.exe", b"binary content", "application/octet-stream")},
        headers=headers,
    )
    assert resp_failed.status_code == 200
    assert resp_failed.json()["status"] == "failed"

    # Card's source_count must STILL be 0
    subj_resp2 = client.get(f"/subjects", headers=headers)
    subj_data2 = next(s for s in subj_resp2.json() if s["id"] == sub_id)
    assert subj_data2["source_count"] == 0, f"Expected source_count 0, got {subj_data2['source_count']}"

    # Also check /subjects/{id} endpoint
    single_subj = client.get(f"/subjects/{sub_id}", headers=headers).json()
    assert single_subj["source_count"] == 0

    # 2. Upload 15 valid sources (should all succeed despite the 1 failed source)
    for i in range(15):
        txt_content = f"Valid content for source {i} detailing algorithms course requirements."
        up = client.post(
            f"/subjects/{sub_id}/sources/upload",
            files={"file": (f"source_{i}.txt", txt_content.encode("utf-8"), "text/plain")},
            headers=headers,
        )
        assert up.status_code == 200, f"Upload {i} failed with status {up.status_code}: {up.text}"
        assert up.json()["status"] == "ready"

    # Card's source_count must be exactly 15 (excluding the 1 failed source)
    subj_resp3 = client.get(f"/subjects", headers=headers)
    subj_data3 = next(s for s in subj_resp3.json() if s["id"] == sub_id)
    assert subj_data3["source_count"] == 15

    # 3. Uploading a 16th valid source must now hit the 15-source limit
    up_16 = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("source_16.txt", b"Overflow source content", "text/plain")},
        headers=headers,
    )
    assert up_16.status_code == 400
    assert "Portfolio deployment limit reached" in up_16.json()["detail"]
