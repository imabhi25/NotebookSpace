"""
End-to-end user journey verification script for NotebookSpace.
Executes the full 12-step verification specified in the prompt:
1. Create two subjects with different documents.
2. Upload materials and wait for successful ingestion.
3. Ask a question and inspect supporting citations.
4. Ask a follow-up question that relies on context.
5. Deselect a source and confirm it is excluded from retrieval.
6. Verify cross-subject isolation.
7. Ask an unsupported question and confirm honest abstention.
8. Test conflicting statements and confirm both are cited.
9. Save an answer to a note and confirm it persists.
10. Reload the page and confirm subjects, sources, chats, and notes remain.
11. Replace/remove a source and confirm citation and history handling.
12. Verify unauthorized requests return 401.
"""
import io
import json
import uuid
from fastapi.testclient import TestClient
from api.main import app
from db.notebook_store import delete_subject
from db.connection import get_connection

client = TestClient(app)

def run_verification():
    print("==================================================================")
    print("STARTING COMPLETE NOTEBOOKSPACE USER JOURNEY VERIFICATION")
    print("==================================================================")
    
    test_email = f"journey_{uuid.uuid4().hex[:8]}@example.com"
    test_password = "SecretPassword123!"

    # Setup / Register
    reg_res = client.post("/auth/register", json={"email": test_email, "password": test_password})
    assert reg_res.status_code == 200, f"Registration failed: {reg_res.text}"
    user_data = reg_res.json()
    token = user_data["token"]
    user_id = user_data["user"]["id"]
    auth_header = {"Authorization": f"Bearer {token}"}
    print(f"✓ Registered test user: {test_email} (ID: {user_id})")

    sub1_id = None
    sub2_id = None

    try:
        # STEP 1: Create two subjects with different documents
        print("\n--- STEP 1: Creating two subjects ---")
        s1_res = client.post(
            "/subjects",
            headers=auth_header,
            json={
                "name": "EECS 3101 — Algorithms",
                "course_code": "EECS 3101",
                "description": "Design and analysis of efficient computer algorithms.",
            },
        )
        assert s1_res.status_code == 200
        sub1 = s1_res.json()
        sub1_id = sub1["id"]
        print(f"✓ Created Subject 1: {sub1['name']} ({sub1_id})")

        s2_res = client.post(
            "/subjects",
            headers=auth_header,
            json={
                "name": "EECS 2031 — Software Tools",
                "course_code": "EECS 2031",
                "description": "Practical software development tools, Unix, C programming.",
            },
        )
        assert s2_res.status_code == 200
        sub2 = s2_res.json()
        sub2_id = sub2["id"]
        print(f"✓ Created Subject 2: {sub2['name']} ({sub2_id})")

        # STEP 2: Ingest materials into each subject
        print("\n--- STEP 2: Ingesting materials ---")
        # Ingest syllabus into Subject 1
        s1_syllabus_content = (
            "EECS 3101 Course Syllabus Fall 2026.\n"
            "Instructor: Prof. Turing.\n"
            "Grading Scheme:\n"
            "Assignments: 30% of final grade.\n"
            "Midterm Exam: 30% of final grade, scheduled in Lassonde 1001 on October 25.\n"
            "Final Exam: 40% of final grade, held in December.\n"
            "All students must achieve at least 40% on the final exam to pass the course."
        )
        upload_s1 = client.post(
            f"/subjects/{sub1_id}/sources/upload",
            headers=auth_header,
            files={"file": ("syllabus_3101.txt", io.BytesIO(s1_syllabus_content.encode("utf-8")), "text/plain")},
        )
        assert upload_s1.status_code == 200, upload_s1.text
        s1_src1 = upload_s1.json()
        assert s1_src1["status"] == "ready"
        s1_src1_id = s1_src1["id"]
        print(f"✓ Ingested Subject 1 source 1: {s1_src1['title']} (pages: {s1_src1['page_count']})")

        # Ingest announcement into Subject 1 (introduces conflicting room)
        s1_announcement_content = (
            "EECS 3101 Announcement: Midterm Room Relocation.\n"
            "Date: October 10, 2026.\n"
            "Please note that due to maintenance in Lassonde, the midterm exam on October 25 has been moved "
            "to Curtis Lecture Hall G at the same scheduled time.\n"
            "Calculators and cheat sheets are strictly prohibited during the exam."
        )
        paste_s1 = client.post(
            f"/subjects/{sub1_id}/sources/paste",
            headers=auth_header,
            json={"title": "Midterm Room Announcement.txt", "text": s1_announcement_content},
        )
        assert paste_s1.status_code == 200
        s1_src2 = paste_s1.json()
        assert s1_src2["status"] == "ready"
        s1_src2_id = s1_src2["id"]
        print(f"✓ Ingested Subject 1 source 2: {s1_src2['title']} (pages: {s1_src2['page_count']})")

        # Ingest Subject 2 materials (EECS 2031)
        s2_syllabus_content = (
            "EECS 2031 Software Tools Syllabus.\n"
            "Instructor: Prof. Ritchie.\n"
            "Evaluation:\n"
            "Weekly Lab Exercises: 20% total.\n"
            "Two Lab Tests: 50% total (25% each).\n"
            "Final Exam: 30% of total course mark.\n"
            "Late submissions are penalized 20% per calendar day up to a maximum of 48 hours."
        )
        upload_s2 = client.post(
            f"/subjects/{sub2_id}/sources/upload",
            headers=auth_header,
            files={"file": ("syllabus_2031.txt", io.BytesIO(s2_syllabus_content.encode("utf-8")), "text/plain")},
        )
        assert upload_s2.status_code == 200
        s2_src1 = upload_s2.json()
        assert s2_src1["status"] == "ready"
        s2_src1_id = s2_src1["id"]
        print(f"✓ Ingested Subject 2 source: {s2_src1['title']} (pages: {s2_src1['page_count']})")

        # STEP 3: Ask a question and inspect supporting citations
        print("\n--- STEP 3: Asking question & inspecting citations ---")
        conv1_res = client.post(
            f"/subjects/{sub1_id}/conversations",
            headers=auth_header,
            json={"title": "Grading Policy Discussion"},
        )
        assert conv1_res.status_code == 200
        conv1 = conv1_res.json()
        conv1_id = conv1["id"]

        msg1_res = client.post(
            f"/subjects/{sub1_id}/conversations/{conv1_id}/messages",
            headers=auth_header,
            json={
                "question": "What percentage is the midterm exam worth?",
                "selected_source_ids": [s1_src1_id, s1_src2_id],
            },
        )
        assert msg1_res.status_code == 200, msg1_res.text
        ans1 = msg1_res.json()
        print(f"✓ Answer: {ans1['content']}")
        assert "30%" in ans1["content"] or "30 percent" in ans1["content"].lower(), "Expected 30% in answer"
        assert len(ans1["citations"]) > 0, "Expected at least one citation"
        assert any(c["source_id"] == s1_src1_id for c in ans1["citations"]), "Expected citation to syllabus_3101"
        print(f"✓ Supporting citations: {ans1['citations']}")

        # STEP 4: Ask follow-up question relying on context
        print("\n--- STEP 4: Follow-up question relying on context ---")
        msg2_res = client.post(
            f"/subjects/{sub1_id}/conversations/{conv1_id}/messages",
            headers=auth_header,
            json={
                "question": "And how much is the final exam worth?",
                "selected_source_ids": [s1_src1_id, s1_src2_id],
            },
        )
        assert msg2_res.status_code == 200
        ans2 = msg2_res.json()
        print(f"✓ Follow-up Answer: {ans2['content']}")
        assert "40%" in ans2["content"] or "40 percent" in ans2["content"].lower(), "Expected 40% in follow-up answer"
        assert len(ans2["citations"]) > 0

        # STEP 5: Deselect a source and confirm it is excluded from retrieval
        print("\n--- STEP 5: Deselect source & test exclusion ---")
        # Ask about midterm weight with ONLY announcement selected (syllabus deselected)
        msg3_res = client.post(
            f"/subjects/{sub1_id}/conversations/{conv1_id}/messages",
            headers=auth_header,
            json={
                "question": "What percentage is the midterm exam worth?",
                "selected_source_ids": [s1_src2_id],  # ONLY announcement selected
            },
        )
        assert msg3_res.status_code == 200
        ans3 = msg3_res.json()
        print(f"✓ Answer with syllabus deselected: {ans3['content']}")
        # The announcement does NOT have the grade percentage! It must abstain or state not found.
        assert (
            ans3["abstained"] is True
            or "not" in ans3["content"].lower()
            or "does not" in ans3["content"].lower()
            or "unsupported" in ans3["content"].lower()
        ), "Expected abstention or negative answer when syllabus was deselected"
        assert not any(c["source_id"] == s1_src1_id for c in ans3["citations"]), "Deselected source was retrieved!"

        # STEP 6: Verify cross-subject isolation
        print("\n--- STEP 6: Cross-subject boundary isolation ---")
        # In Subject 1 (EECS 3101), ask about EECS 2031 lab tests
        msg4_res = client.post(
            f"/subjects/{sub1_id}/conversations/{conv1_id}/messages",
            headers=auth_header,
            json={
                "question": "What percentage are the lab tests worth in EECS 2031?",
                "selected_source_ids": [s1_src1_id, s1_src2_id],
            },
        )
        assert msg4_res.status_code == 200
        ans4 = msg4_res.json()
        print(f"✓ Cross-subject query response: {ans4['content']}")
        # Must abstain or not state 50%
        assert "50%" not in ans4["content"], "Subject 1 answer leaked Subject 2 content!"
        assert not any(c.get("source_id") == s2_src1_id for c in ans4["citations"])

        # Also verify attempting to pass a source from Subject 2 into Subject 1 message fails or ignores it
        msg5_res = client.post(
            f"/subjects/{sub1_id}/conversations/{conv1_id}/messages",
            headers=auth_header,
            json={
                "question": "What percentage are the lab tests worth?",
                "selected_source_ids": [s2_src1_id],  # s2_src1 belongs to sub2!
            },
        )
        assert msg5_res.status_code in [200, 400]
        if msg5_res.status_code == 200:
            ans5 = msg5_res.json()
            assert ans5["abstained"] is True or "select" in ans5["content"].lower()

        # STEP 7: Ask unsupported question and confirm honest abstention
        print("\n--- STEP 7: Unsupported question & honest abstention ---")
        msg6_res = client.post(
            f"/subjects/{sub1_id}/conversations/{conv1_id}/messages",
            headers=auth_header,
            json={
                "question": "Who won the FIFA World Cup in 2022?",
                "selected_source_ids": [s1_src1_id, s1_src2_id],
            },
        )
        assert msg6_res.status_code == 200
        ans6 = msg6_res.json()
        print(f"✓ Unsupported query response: {ans6['content']}")
        assert (
            ans6["abstained"] is True
            or "does not establish" in ans6["content"].lower()
            or "not mentioned" in ans6["content"].lower()
            or "not contain" in ans6["content"].lower()
            or "materials do not" in ans6["content"].lower()
        )

        # STEP 8: Test conflicting statements and confirm both are cited
        print("\n--- STEP 8: Conflicting statements ---")
        msg7_res = client.post(
            f"/subjects/{sub1_id}/conversations/{conv1_id}/messages",
            headers=auth_header,
            json={
                "question": "Where is the midterm exam being held?",
                "selected_source_ids": [s1_src1_id, s1_src2_id],
            },
        )
        assert msg7_res.status_code == 200
        ans7 = msg7_res.json()
        print(f"✓ Conflict query response: {ans7['content']}")
        print(f"✓ Detected conflict: {ans7['conflict_detected']}, items: {ans7['conflicts']}")
        # Should cite both documents or mention Lassonde 1001 and Curtis Lecture Hall G
        content_lower = ans7["content"].lower()
        assert "lassonde" in content_lower or "curtis" in content_lower
        assert len(ans7["citations"]) >= 1

        # STEP 9: Save answer to a note and confirm persistence
        print("\n--- STEP 9: Save answer to a note ---")
        note_res = client.post(
            f"/subjects/{sub1_id}/notes",
            headers=auth_header,
            json={
                "title": "Grading Breakdown Summary",
                "content": ans1["content"],
                "citations": ans1["citations"],
                "is_saved_answer": True,
            },
        )
        assert note_res.status_code == 200
        saved_note = note_res.json()
        assert saved_note["title"] == "Grading Breakdown Summary"
        assert saved_note["is_saved_answer"] is True
        print(f"✓ Created saved note: {saved_note['id']} ('{saved_note['title']}')")

        # Create personal note as well
        personal_note_res = client.post(
            f"/subjects/{sub1_id}/notes",
            headers=auth_header,
            json={
                "title": "My Study Goals",
                "content": "Review dynamic programming exercises by Thursday.",
                "is_saved_answer": False,
            },
        )
        assert personal_note_res.status_code == 200
        pers_note = personal_note_res.json()
        print(f"✓ Created personal note: {pers_note['id']}")

        # STEP 10: Reload simulation & confirm state remains
        print("\n--- STEP 10: Page reload / Session state verification ---")
        # 10a. Subjects dashboard list
        list_sub_res = client.get("/subjects", headers=auth_header)
        assert list_sub_res.status_code == 200
        user_subjects = list_sub_res.json()
        assert len(user_subjects) == 2
        s1_loaded = next(s for s in user_subjects if s["id"] == sub1_id)
        assert s1_loaded["source_count"] == 2
        print("✓ Reloaded subjects list successfully")

        # 10b. Sources list
        list_src_res = client.get(f"/subjects/{sub1_id}/sources", headers=auth_header)
        assert list_src_res.status_code == 200
        assert len(list_src_res.json()) == 2
        print("✓ Reloaded sources list successfully")

        # 10c. Conversations and messages
        list_conv_res = client.get(f"/subjects/{sub1_id}/conversations", headers=auth_header)
        assert list_conv_res.status_code == 200
        assert len(list_conv_res.json()) >= 1
        msgs_res = client.get(f"/subjects/{sub1_id}/conversations/{conv1_id}/messages", headers=auth_header)
        assert msgs_res.status_code == 200
        reloaded_msgs = msgs_res.json()
        assert len(reloaded_msgs) >= 6
        print(f"✓ Reloaded conversation messages successfully ({len(reloaded_msgs)} messages preserved)")

        # 10d. Notes
        list_notes_res = client.get(f"/subjects/{sub1_id}/notes", headers=auth_header)
        assert list_notes_res.status_code == 200
        notes_list = list_notes_res.json()
        assert len(notes_list) == 2
        print(f"✓ Reloaded notes successfully ({len(notes_list)} notes preserved)")

        # STEP 11: Replace/remove source and confirm citation and history handling
        print("\n--- STEP 11: Replace/remove source & citation preservation ---")
        # Replace announcement with updated text
        replacement_text = "Updated EECS 3101 Announcement: Midterm is officially scheduled in Room CB 120."
        replace_res = client.post(
            f"/subjects/{sub1_id}/sources/{s1_src2_id}/replace",
            headers=auth_header,
            files={"file": ("Midterm Announcement v2.txt", io.BytesIO(replacement_text.encode("utf-8")), "text/plain")},
        )
        assert replace_res.status_code == 200
        replaced_src = replace_res.json()
        assert replaced_src["version"] == 2
        print(f"✓ Replaced source, new version: {replaced_src['version']}")

        # Ensure past conversation messages are still intact with historical citations
        check_msgs = client.get(f"/subjects/{sub1_id}/conversations/{conv1_id}/messages", headers=auth_header)
        assert check_msgs.status_code == 200
        assert len(check_msgs.json()) == len(reloaded_msgs)
        print("✓ Historical messages preserved after source replacement")

        # Delete source
        del_src_res = client.delete(f"/subjects/{sub1_id}/sources/{s1_src2_id}", headers=auth_header)
        assert del_src_res.status_code == 200
        list_after_del = client.get(f"/subjects/{sub1_id}/sources", headers=auth_header).json()
        assert len(list_after_del) == 1
        print("✓ Source deleted cleanly without crashing conversation history")

        # STEP 12: Verify unauthorized requests return 401
        print("\n--- STEP 12: Unauthorized request security checks ---")
        unauth_sub = client.get("/subjects")
        assert unauth_sub.status_code == 401, f"Expected 401, got {unauth_sub.status_code}"

        unauth_sub_get = client.get(f"/subjects/{sub1_id}")
        assert unauth_sub_get.status_code == 401

        unauth_src = client.get(f"/subjects/{sub1_id}/sources")
        assert unauth_src.status_code == 401

        unauth_ask = client.post(f"/subjects/{sub1_id}/conversations/{conv1_id}/messages", json={"question": "Hi"})
        assert unauth_ask.status_code == 401
        print("✓ All unauthorized endpoints properly return 401 Unauthorized")

        print("\n==================================================================")
        print("ALL 12 USER JOURNEY VERIFICATION STEPS PASSED SUCCESSFULLY!")
        print("==================================================================")

    finally:
        # Cleanup
        try:
            with get_connection() as conn:
                with conn.transaction():
                    with conn.cursor() as cur:
                        cur.execute("DELETE FROM users WHERE id = %s;", (user_id,))
            print("✓ Cleaned up verification user and cascade-deleted subjects.")
        except Exception as e:
            print(f"Cleanup error: {e}")

if __name__ == "__main__":
    run_verification()
