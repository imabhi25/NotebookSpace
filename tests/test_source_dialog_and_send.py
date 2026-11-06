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


def test_retry_after_stopped_generation_replaces_assistant_turn(auth_headers, test_subject, monkeypatch):
    """Bug 2: Retry after user-initiated stop must replace the stopped turn, not store a 2nd assistant answer."""
    import answering.notebook_answer as na
    from answering.llm import FakeLLMClient

    fake_client = FakeLLMClient(responses=[
        '{"supported": true, "answer": "The midterm date is Thursday, Nov 19, 2026 [course.pdf p.1].", "citations": [{"file": "course.pdf", "page": 1, "quote": "Midterm Exam on Thursday, Nov 19, 2026."}]}',
        '{"supported": true, "answer": "Retried answer: Midterm date is Nov 19 [course.pdf p.1].", "citations": [{"file": "course.pdf", "page": 1, "quote": "Midterm Exam on Thursday, Nov 19, 2026."}]}'
    ])
    monkeypatch.setattr(na, "get_llm_client", lambda **kwargs: fake_client)

    sub_id = test_subject["id"]
    headers = {"Authorization": auth_headers["Authorization"]}

    # Upload a source with midterm date
    pdf = make_pdf(["Course Overview\nMidterm Exam on Thursday, Nov 19, 2026."])
    up_resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("course.pdf", pdf, "application/pdf")},
        headers=headers,
    )
    assert up_resp.status_code == 200
    src = up_resp.json()

    # Create conversation
    conv_resp = client.post(
        f"/subjects/{sub_id}/conversations",
        json={"title": "Midterm Query"},
        headers=headers,
    )
    assert conv_resp.status_code == 200
    conv_id = conv_resp.json()["id"]

    # First ask: simulate generation
    ask_resp1 = client.post(
        f"/subjects/{sub_id}/conversations/{conv_id}/messages",
        json={
            "question": "When is the midterm exam?",
            "selected_source_ids": [src["id"]],
        },
        headers=headers,
    )
    assert ask_resp1.status_code == 200
    msg1 = ask_resp1.json()

    # Verify conversation now has 1 user and 1 assistant message
    msgs_resp1 = client.get(f"/subjects/{sub_id}/conversations/{conv_id}/messages", headers=headers)
    msgs1 = msgs_resp1.json()
    assert len(msgs1) == 2
    assert msgs1[0]["role"] == "user"
    assert msgs1[1]["role"] == "assistant"

    # Now simulate user stopped generation on client (client stopped ID like "stopped-1730000000")
    # and user clicks "Retry".
    retry_resp = client.post(
        f"/subjects/{sub_id}/conversations/{conv_id}/messages",
        json={
            "question": "When is the midterm exam?",
            "selected_source_ids": [src["id"]],
            "is_retry": True,
            "retry_message_id": "stopped-1730932800000",
        },
        headers=headers,
    )
    assert retry_resp.status_code == 200

    # Conversation must STILL have exactly 1 user message and 1 assistant message (replaced, NOT duplicated)
    msgs_resp2 = client.get(f"/subjects/{sub_id}/conversations/{conv_id}/messages", headers=headers)
    msgs2 = msgs_resp2.json()
    assert len(msgs2) == 2, f"Expected 2 messages (1 user, 1 assistant), got {len(msgs2)}: {[m['role'] for m in msgs2]}"
    assert msgs2[0]["role"] == "user"
    assert msgs2[1]["role"] == "assistant"
    assert "Retried answer" in msgs2[1]["content"]
