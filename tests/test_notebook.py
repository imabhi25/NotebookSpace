import io
import pytest
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

from api.main import app
from db.connection import get_connection

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


import uuid

@pytest.fixture
def auth_headers():
    email = f"test_{uuid.uuid4().hex}@test.com"
    resp = client.post("/auth/register", json={"email": email, "password": "password123"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    user_id = resp.json()["user"]["id"]
    yield {"Authorization": f"Bearer {token}"}
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s;", (user_id,))


@pytest.fixture
def other_user_headers():
    email = f"other_{uuid.uuid4().hex}@test.com"
    resp = client.post("/auth/register", json={"email": email, "password": "password123"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    user_id = resp.json()["user"]["id"]
    yield {"Authorization": f"Bearer {token}"}
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id = %s;", (user_id,))


def test_auth_flow(monkeypatch):
    # 1. Unauthenticated requests to user data receive 404, the same answer as a resource
    #    that does not exist. Only the session probe says 401.
    resp = client.get("/subjects")
    assert resp.status_code == 404
    assert client.get("/auth/me").status_code == 401

    # 2. Demo login is disabled by default in production (returns 403)
    monkeypatch.delenv("ALLOW_DEMO_LOGIN", raising=False)
    resp = client.post("/auth/demo-login")
    assert resp.status_code == 403
    assert "disabled" in resp.json()["detail"].lower()

    # 3. Direct login with shared student email is also rejected when disabled
    resp = client.post("/auth/login", json={"email": "student@notebookspace.local", "password": "wrong"})
    assert resp.status_code == 403

    # 4. Auth config reflects capability
    cfg_resp = client.get("/auth/config")
    assert cfg_resp.status_code == 200
    assert cfg_resp.json()["allow_demo_login"] is False

    # 5. When ALLOW_DEMO_LOGIN is explicitly enabled in local dev, it succeeds
    monkeypatch.setenv("ALLOW_DEMO_LOGIN", "true")
    resp_enabled = client.post("/auth/demo-login")
    assert resp_enabled.status_code == 200
    data = resp_enabled.json()
    assert "token" in data
    assert data["user"]["email"] == "student@notebookspace.local"

    # 6. /auth/me with valid token
    headers = {"Authorization": f"Bearer {data['token']}"}
    me_resp = client.get("/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "student@notebookspace.local"


def test_subject_management_and_isolation(auth_headers, other_user_headers):
    # User 1 creates a subject
    create_resp = client.post(
        "/subjects",
        json={
            "name": "EECS 3101 — Algorithms",
            "course_code": "EECS 3101",
            "description": "Design and Analysis of Algorithms",
            "settings": {"response_length": "concise", "response_style": "learning-guide"},
        },
        headers=auth_headers,
    )
    assert create_resp.status_code == 200
    sub_1 = create_resp.json()
    sub_id = sub_1["id"]
    assert sub_1["name"] == "EECS 3101 — Algorithms"

    # Other user cannot access User 1's subject
    forbidden_resp = client.get(f"/subjects/{sub_id}", headers=other_user_headers)
    assert forbidden_resp.status_code == 404

    # User 1 updates subject
    update_resp = client.put(
        f"/subjects/{sub_id}",
        json={"name": "EECS 3101 — Advanced Algorithms"},
        headers=auth_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "EECS 3101 — Advanced Algorithms"

    # User 1 archives and restores
    archive_resp = client.post(f"/subjects/{sub_id}/archive", headers=auth_headers)
    assert archive_resp.status_code == 200
    assert archive_resp.json()["is_archived"] is True

    # Check that it's excluded from active subjects
    list_active = client.get("/subjects", headers=auth_headers).json()
    assert not any(s["id"] == sub_id for s in list_active)

    restore_resp = client.post(f"/subjects/{sub_id}/restore", headers=auth_headers)
    assert restore_resp.status_code == 200
    assert restore_resp.json()["is_archived"] is False


def test_source_management_and_formats(auth_headers):
    # Create subject
    subj = client.post(
        "/subjects",
        json={"name": "EECS 2031 — Software Tools"},
        headers=auth_headers,
    ).json()
    sub_id = subj["id"]

    # 1. Upload valid PDF
    pdf_content = make_pdf([
        "Page 1: C Programming and Unix Tools introduction.",
        "Page 2: Pointers and memory management details.",
    ])
    upload_resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("syllabus.pdf", pdf_content, "application/pdf")},
        headers=auth_headers,
    )
    assert upload_resp.status_code == 200
    src_pdf = upload_resp.json()
    assert src_pdf["status"] == "ready"
    assert src_pdf["page_count"] == 2

    # 2. Duplicate detection
    dup_resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("syllabus.pdf", pdf_content, "application/pdf")},
        headers=auth_headers,
    )
    assert dup_resp.status_code == 409

    # 3. Scanned PDF (blank text) should be rejected
    blank_pdf = make_pdf(["", ""])
    blank_resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("scanned.pdf", blank_pdf, "application/pdf")},
        headers=auth_headers,
    )
    assert blank_resp.status_code == 200
    assert blank_resp.json()["status"] == "failed"
    assert "OCR" in blank_resp.json()["error_message"]

    # 4. Upload TXT / Markdown
    md_content = b"# Unix Shell Scripting\n\nBash commands include grep, sed, and awk for text filtering."
    md_resp = client.post(
        f"/subjects/{sub_id}/sources/upload",
        files={"file": ("shell_notes.md", md_content, "text/markdown")},
        headers=auth_headers,
    )
    assert md_resp.status_code == 200
    src_md = md_resp.json()
    assert src_md["status"] == "ready"

    # 5. Paste text
    paste_resp = client.post(
        f"/subjects/{sub_id}/sources/paste",
        json={"title": "Exam Schedule", "text": "Midterm Exam will take place on October 25th in Lassonde Building."},
        headers=auth_headers,
    )
    assert paste_resp.status_code == 200
    src_paste = paste_resp.json()
    assert src_paste["status"] == "ready"

    # 6. SSRF Protection: Private IPs must be rejected
    ssrf_resp = client.post(
        f"/subjects/{sub_id}/sources/url",
        json={"url": "http://127.0.0.1:8000/documents"},
        headers=auth_headers,
    )
    assert ssrf_resp.status_code == 400
    assert "blocked" in ssrf_resp.json()["detail"].lower()

    # 7. Rename source
    rename_resp = client.put(
        f"/subjects/{sub_id}/sources/{src_paste['id']}",
        json={"title": "Official Exam Schedule"},
        headers=auth_headers,
    )
    assert rename_resp.status_code == 200
    assert rename_resp.json()["title"] == "Official Exam Schedule"

    # 8. Inspect source content
    detail_resp = client.get(
        f"/subjects/{sub_id}/sources/{src_pdf['id']}",
        headers=auth_headers,
    )
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert "raw_content" in detail
    assert len(detail["passages"]) > 0


def test_conversational_chat_and_isolation(auth_headers, other_user_headers, monkeypatch):
    import os
    if not os.getenv("LLM_API_KEY"):
        from answering.llm import FakeLLMClient
        fake_response = '{"supported": true, "answer": "The secret code for Subject A is ALPHA-42 [doc_a.pdf p.1].", "citations": [{"file": "doc_a.pdf", "page": 1}]}'
        monkeypatch.setattr("answering.notebook_answer.get_llm_client", lambda *args, **kwargs: FakeLLMClient(default_response=fake_response))

    # Subject A
    subj_a = client.post("/subjects", json={"name": "Subject A"}, headers=auth_headers).json()
    pdf_a = make_pdf(["Subject A secret code is ALPHA-42. Grading is 40 percent exam."])
    src_a = client.post(
        f"/subjects/{subj_a['id']}/sources/upload",
        files={"file": ("doc_a.pdf", pdf_a, "application/pdf")},
        headers=auth_headers,
    ).json()

    # Subject B
    subj_b = client.post("/subjects", json={"name": "Subject B"}, headers=auth_headers).json()
    pdf_b = make_pdf(["Subject B secret code is BETA-99. Grading is 50 percent exam."])
    src_b = client.post(
        f"/subjects/{subj_b['id']}/sources/upload",
        files={"file": ("doc_b.pdf", pdf_b, "application/pdf")},
        headers=auth_headers,
    ).json()

    # Conversation in Subject A
    conv_a = client.post(
        f"/subjects/{subj_a['id']}/conversations",
        json={"title": "Chat A"},
        headers=auth_headers,
    ).json()

    # 1. Ask with no sources selected -> honest requirement explanation
    msg_no_sources = client.post(
        f"/subjects/{subj_a['id']}/conversations/{conv_a['id']}/messages",
        json={"question": "What is the secret code?", "selected_source_ids": []},
        headers=auth_headers,
    ).json()
    assert msg_no_sources["abstained"] is True
    assert "select" in msg_no_sources["content"].lower()

    # 2. Ask with Subject A source selected
    msg_a = client.post(
        f"/subjects/{subj_a['id']}/conversations/{conv_a['id']}/messages",
        json={"question": "What is the secret code for Subject A?", "selected_source_ids": [src_a["id"]]},
        headers=auth_headers,
    ).json()
    assert not msg_a["abstained"]
    assert "ALPHA-42" in msg_a["content"]
    assert len(msg_a["citations"]) > 0
    assert msg_a["citations"][0]["file"] == "doc_a.pdf"

    # 3. Cross-subject boundary test: Subject A cannot retrieve Subject B's secret code
    msg_cross = client.post(
        f"/subjects/{subj_a['id']}/conversations/{conv_a['id']}/messages",
        json={"question": "What is the secret code for Subject B?", "selected_source_ids": [src_a["id"]]},
        headers=auth_headers,
    ).json()
    # Must NOT hallucinate BETA-99 from Subject B
    assert "BETA-99" not in msg_cross["content"]

    # 4. Message history persisted
    history = client.get(
        f"/subjects/{subj_a['id']}/conversations/{conv_a['id']}/messages",
        headers=auth_headers,
    ).json()
    assert len(history) >= 4  # (user + asst) turns


def test_notes_management(auth_headers):
    subj = client.post("/subjects", json={"name": "Notes Test Subject"}, headers=auth_headers).json()
    sub_id = subj["id"]

    # 1. Create personal note
    create_resp = client.post(
        f"/subjects/{sub_id}/notes",
        json={"title": "My Study Plan", "content": "Review chapter 4 and solve practice problems."},
        headers=auth_headers,
    )
    assert create_resp.status_code == 200
    note = create_resp.json()
    assert note["title"] == "My Study Plan"
    assert note["is_saved_answer"] is False

    # 2. Save answer as note
    save_ans_resp = client.post(
        f"/subjects/{sub_id}/notes",
        json={
            "title": "Grading Policy",
            "content": "Assignments: 40%, Midterm: 25%, Final: 35% [syllabus.pdf p.1]",
            "is_saved_answer": True,
            "citations": [{"file": "syllabus.pdf", "page": 1}],
        },
        headers=auth_headers,
    )
    assert save_ans_resp.status_code == 200
    saved_note = save_ans_resp.json()
    assert saved_note["is_saved_answer"] is True
    assert len(saved_note["citations"]) == 1

    # 3. List and search notes
    notes_list = client.get(f"/subjects/{sub_id}/notes?search=Grading", headers=auth_headers).json()
    assert len(notes_list) == 1
    assert notes_list[0]["title"] == "Grading Policy"

    # 4. Update note
    upd_resp = client.put(
        f"/subjects/{sub_id}/notes/{note['id']}",
        json={"title": "Updated Study Plan", "content": "All chapters completed."},
        headers=auth_headers,
    )
    assert upd_resp.status_code == 200
    assert upd_resp.json()["title"] == "Updated Study Plan"

    # 5. Delete note
    del_resp = client.delete(f"/subjects/{sub_id}/notes/{note['id']}", headers=auth_headers)
    assert del_resp.status_code == 200


def test_guest_session_isolation_and_limits():
    from api.main import reset_rate_limits

    reset_rate_limits()

    # 1. Guest session generation
    guest_a_res = client.post("/auth/guest-session")
    assert guest_a_res.status_code == 200
    token_a = guest_a_res.json()["token"]
    user_a = guest_a_res.json()["user"]
    assert user_a["email"] == "Guest Workspace"
    headers_a = {"Authorization": f"Bearer {token_a}"}

    guest_b_res = client.post("/auth/guest-session")
    assert guest_b_res.status_code == 200
    token_b = guest_b_res.json()["token"]
    user_b = guest_b_res.json()["user"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Isolated user accounts
    assert user_a["id"] != user_b["id"]

    try:
        # 2. Guest A creates a subject
        subj_res = client.post(
            "/subjects",
            json={"name": "Guest A Secret Subject", "course_code": "SEC 101"},
            headers=headers_a,
        )
        assert subj_res.status_code == 200
        subj_a_id = subj_res.json()["id"]

        # Guest B sees 0 subjects
        list_b = client.get("/subjects", headers=headers_b).json()
        assert len(list_b) == 0

        # Guest B cannot access Guest A's subject
        get_b = client.get(f"/subjects/{subj_a_id}", headers=headers_b)
        assert get_b.status_code == 404

        # 3. Subject limit enforcement (max 10 subjects per guest)
        created_ids = [subj_a_id]
        for i in range(2, 11):
            s_res = client.post("/subjects", json={"name": f"Subject {i}"}, headers=headers_a)
            assert s_res.status_code == 200
            created_ids.append(s_res.json()["id"])

        # 11th subject rejected
        s11_res = client.post("/subjects", json={"name": "Subject 11"}, headers=headers_a)
        assert s11_res.status_code == 400
        assert "limit reached" in s11_res.json()["detail"].lower()

        # 4. Source limit enforcement (max 15 sources per subject)
        target_subj = created_ids[0]
        for i in range(15):
            p_res = client.post(
                f"/subjects/{target_subj}/sources/paste",
                json={"title": f"Note {i}", "text": f"Content for note {i}"},
                headers=headers_a,
            )
            assert p_res.status_code == 200

        # 16th source rejected
        p16_res = client.post(
            f"/subjects/{target_subj}/sources/paste",
            json={"title": "Note 16", "text": "Over the limit"},
            headers=headers_a,
        )
        assert p16_res.status_code == 400
        assert "maximum 15" in p16_res.json()["detail"].lower()

    finally:
        with get_connection() as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM users WHERE id IN (%s, %s);", (user_a["id"], user_b["id"]))


def test_conflict_and_citation_stable_source_id_after_rename(auth_headers):
    # Create test subject
    subj_res = client.post("/subjects", json={"name": "Rename Conflict Subject"}, headers=auth_headers)
    assert subj_res.status_code == 200
    subj_id = subj_res.json()["id"]

    # Ingest Source 1
    pdf_bytes_1 = make_pdf(["The final exam is worth 40 percent of the grade and is on Dec 10."])
    src_1 = client.post(
        f"/subjects/{subj_id}/sources/upload",
        files={"file": ("syllabus.pdf", pdf_bytes_1, "application/pdf")},
        headers=auth_headers,
    )
    assert src_1.status_code == 200
    src_1_id = src_1.json()["id"]

    # Ingest Source 2 with conflicting info
    pdf_bytes_2 = make_pdf(["The final exam is worth 50 percent of the grade and is on Dec 15."])
    src_2 = client.post(
        f"/subjects/{subj_id}/sources/upload",
        files={"file": ("schedule.pdf", pdf_bytes_2, "application/pdf")},
        headers=auth_headers,
    )
    assert src_2.status_code == 200
    src_2_id = src_2.json()["id"]

    # Rename Source 1
    rename_1 = client.put(
        f"/subjects/{subj_id}/sources/{src_1_id}",
        json={"title": "Official Course Syllabus (Renamed)"},
        headers=auth_headers,
    )
    assert rename_1.status_code == 200
    assert rename_1.json()["title"] == "Official Course Syllabus (Renamed)"

    # Rename Source 2
    rename_2 = client.put(
        f"/subjects/{subj_id}/sources/{src_2_id}",
        json={"title": "Instructor Schedule Updates (Renamed)"},
        headers=auth_headers,
    )
    assert rename_2.status_code == 200
    assert rename_2.json()["title"] == "Instructor Schedule Updates (Renamed)"

    # Create conversation and ask question
    conv_res = client.post(f"/subjects/{subj_id}/conversations", json={"title": "Exam Date Question"}, headers=auth_headers)
    assert conv_res.status_code == 200
    conv_id = conv_res.json()["id"]

    # Mock LLM returning citations and conflicts
    from answering.llm import LLMResponse
    class MockConflictLLM:
        def generate(self, system: str, user: str) -> LLMResponse:
            return LLMResponse(
                text="""{
                    "supported": true,
                    "answer": "The syllabus states the exam is worth 40% [Official Course Syllabus (Renamed) p.1], whereas schedule states 50% [Instructor Schedule Updates (Renamed) p.1].",
                    "citations": [
                        {"file": "Official Course Syllabus (Renamed)", "page": 1},
                        {"file": "Instructor Schedule Updates (Renamed)", "page": 1}
                    ],
                    "conflicts": [
                        {
                            "topic": "Exam grading percentage",
                            "claims": [
                                {"file": "Official Course Syllabus (Renamed)", "page": 1, "value": "40 percent"},
                                {"file": "Instructor Schedule Updates (Renamed)", "page": 1, "value": "50 percent"}
                            ]
                        }
                    ]
                }""",
                input_tokens=100,
                output_tokens=50,
                latency_seconds=0.1,
            )

    from answering.notebook_answer import answer_notebook_question
    # Get current user id from auth headers
    user_me = client.get("/auth/me", headers=auth_headers).json()
    ans = answer_notebook_question(
        question="What is the exam percentage?",
        conversation_id=conv_id,
        user_id=user_me["id"],
        subject_id=subj_id,
        selected_source_ids=[src_1_id, src_2_id],
        llm_client=MockConflictLLM(),
    )

    # Assertions
    assert ans["conflict_detected"] is True
    assert len(ans["conflicts"]) == 1
    conflict = ans["conflicts"][0]
    assert conflict["topic"] == "Exam grading percentage"
    assert len(conflict["claims"]) == 2

    claim_source_ids = {c["source_id"] for c in conflict["claims"]}
    assert src_1_id in claim_source_ids
    assert src_2_id in claim_source_ids

    # Assert citations preserved and tied to source_ids
    assert len(ans["citations"]) == 2
    cit_source_ids = {c["source_id"] for c in ans["citations"]}
    assert src_1_id in cit_source_ids
    assert src_2_id in cit_source_ids


def test_source_count_preserved_on_update_archive_restore(auth_headers):
    """NS-01: Renaming, archiving, or restoring a notebook must preserve and return accurate source_count."""
    # Create subject
    subj = client.post("/subjects", json={"name": "Source Count Test"}, headers=auth_headers).json()
    assert subj["source_count"] == 0

    # Add source
    pdf_bytes = make_pdf(["Syllabus content page 1."])
    src = client.post(
        f"/subjects/{subj['id']}/sources/upload",
        files={"file": ("syllabus.pdf", pdf_bytes, "application/pdf")},
        headers=auth_headers,
    ).json()
    assert src["status"] == "ready"

    # Verify initial source count is 1
    subj_get = client.get(f"/subjects", headers=auth_headers).json()
    subj_entry = next(s for s in subj_get if s["id"] == subj["id"])
    assert subj_entry["source_count"] == 1

    # Rename notebook -> source_count must still be 1
    renamed = client.put(
        f"/subjects/{subj['id']}",
        json={"name": "Source Count Test Renamed"},
        headers=auth_headers,
    ).json()
    assert renamed["source_count"] == 1

    # Archive notebook -> source_count must still be 1
    archived = client.post(
        f"/subjects/{subj['id']}/archive",
        headers=auth_headers,
    ).json()
    assert archived["source_count"] == 1

    # Restore notebook -> source_count must still be 1
    restored = client.post(
        f"/subjects/{subj['id']}/restore",
        headers=auth_headers,
    ).json()
    assert restored["source_count"] == 1

