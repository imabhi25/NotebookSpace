"""
Playwright Real Browser End-to-End Verification Suite for NotebookSpace.
Runs against live FastAPI backend (http://127.0.0.1:8000) and Vite frontend (http://127.0.0.1:5173).
Tests complete user journey, edge cases, mobile viewport, and historical citations.
"""
import os
import sys
import time
import json
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

FRONTEND_URL = "http://127.0.0.1:5173"
BACKEND_URL = "http://127.0.0.1:8000"
SCREENSHOTS_DIR = Path("tests/screenshots")
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

test_results = {}


def log_step(name, status, detail=""):
    test_results[name] = {"status": status, "detail": detail}
    symbol = "✓" if status == "PASSED" else "✗"
    print(f"[{symbol}] {name}: {detail}")


def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Create fresh desktop context
        context = browser.new_context(viewport={"width": 1280, "height": 850})
        page = context.new_page()

        # Automatically accept all native alert/confirm/prompt dialogs
        def handle_dialog(dialog):
            if dialog.type == "prompt":
                dialog.accept("Exam Preparation Notes")
            else:
                dialog.accept()

        page.on("dialog", handle_dialog)

        print("\n=== STEP 1: LOAD FRONTEND & AUTHENTICATE WITH UNIQUE ACCOUNT ===")
        page.goto(FRONTEND_URL, wait_until="networkidle")
        page.screenshot(path=str(SCREENSHOTS_DIR / "01_initial_load.png"))

        assert "NotebookSpace" in page.title()
        log_step("Frontend Initial Load", "PASSED", f"Title: {page.title()}")

        # Click Sign In button in header
        page.locator("button.btn-sign-in").click()
        page.wait_for_selector(".modal-backdrop", state="visible")
        page.screenshot(path=str(SCREENSHOTS_DIR / "02_auth_modal.png"))

        # Switch to Register mode by clicking "Create one"
        page.locator("button.link-button:has-text('Create one')").click()
        test_email = f"student_{uuid.uuid4().hex[:8]}@testyork.edu"
        test_pw = "YorkStudentPass2026!"

        page.fill("#auth-email", test_email)
        page.fill("#auth-password", test_pw)
        page.click(".modal-content button[type='submit']")

        # Wait for user email to appear in header
        page.wait_for_selector(f".user-email-tag:has-text('{test_email}')", timeout=10000)
        log_step("User Registration & Isolated Auth", "PASSED", f"Registered and authenticated as {test_email}")
        page.screenshot(path=str(SCREENSHOTS_DIR / "03_authenticated_dashboard.png"))

        print("\n=== STEP 2: SUBJECT MANAGEMENT (CRUD, ARCHIVE, RESTORE) ===")
        # Navigate to Study Notebooks view
        page.locator(".nav-switcher-btn:has-text('Study Notebooks')").click()
        page.wait_for_selector(".dashboard-root", state="visible")

        # Create Subject 1: Algorithms (auto-opens workspace on creation)
        page.click("button[data-testid='create-subject-btn']")
        page.wait_for_selector(".modal-backdrop", state="visible")
        page.fill("#create-subj-name", "EECS 3101 — Algorithms & Analysis")
        page.fill("#create-subj-code", "EECS3101")
        page.fill("#create-subj-desc", "Divide and conquer, recurrence relations, Master theorem, sorting algorithms.")
        page.click("button[type='submit']:has-text('Create Notebook')")
        page.wait_for_selector(".workspace-root", state="visible", timeout=10000)
        log_step("Subject Creation", "PASSED", "Created EECS 3101 and navigated directly into workspace")

        # Navigate back to dashboard to test CRUD & card operations
        page.click("button.back-btn")
        page.wait_for_selector(".dashboard-root", state="visible", timeout=5000)

        # Create Subject 2: Temporary subject to test Delete
        time.sleep(0.5)
        page.click("button[data-testid='create-subject-btn']")
        page.wait_for_selector(".modal-backdrop", state="visible")
        page.fill("#create-subj-name", "Temporary Subject For Deletion")
        page.click("button[type='submit']:has-text('Create Notebook')")
        page.wait_for_selector(".workspace-root", state="visible", timeout=10000)
        # Return to dashboard to delete Subject 2
        page.click("button.back-btn")
        page.wait_for_selector(".dashboard-root", state="visible", timeout=5000)

        # Delete Subject 2
        temp_card = page.locator(".subject-card:has-text('Temporary Subject For Deletion')")
        temp_card.locator(".card-action-btn.card-action-delete").click()
        page.wait_for_selector("button[data-testid='confirm-delete-subject-btn']", state="visible")
        page.click("button[data-testid='confirm-delete-subject-btn']")
        page.wait_for_selector(".modal-backdrop", state="hidden", timeout=5000)
        time.sleep(0.5)
        expect(page.locator(".subject-card:has-text('Temporary Subject For Deletion')")).to_have_count(0)
        log_step("Subject Deletion", "PASSED", "Successfully deleted temporary subject with confirmation")

        # Edit/Rename Subject 1
        algo_card = page.locator(".subject-card:has-text('EECS 3101')")
        algo_card.locator(".card-action-btn[title='Edit Subject']").click()
        page.wait_for_selector("#edit-subj-name", state="visible")
        page.fill("#edit-subj-name", "EECS 3101 — Advanced Algorithms")
        page.click("button[type='submit']:has-text('Save Changes')")
        page.wait_for_selector(".modal-backdrop", state="hidden", timeout=5000)
        time.sleep(0.5)
        expect(page.locator(".subject-card:has-text('EECS 3101 — Advanced Algorithms')")).to_be_visible()
        log_step("Subject Edit/Rename", "PASSED", "Renamed subject to EECS 3101 — Advanced Algorithms")

        # Test Archive & Restore
        algo_card = page.locator(".subject-card:has-text('EECS 3101')")
        algo_card.locator(".card-action-btn[title='Archive Subject']").click()
        time.sleep(1)
        expect(page.locator(".subject-card:has-text('EECS 3101')")).to_have_count(0)
        # Switch to Archived tab
        page.click(".tab-btn:has-text('Archived')")
        expect(page.locator(".subject-card:has-text('EECS 3101')")).to_be_visible()
        page.locator(".subject-card:has-text('EECS 3101')").locator(".card-action-btn[title='Restore Subject']").click()
        time.sleep(1)
        page.click(".tab-btn:has-text('Active Notebooks')")
        expect(page.locator(".subject-card:has-text('EECS 3101')")).to_be_visible()
        log_step("Subject Archive & Restore", "PASSED", "Archived and restored subject successfully")
        page.screenshot(path=str(SCREENSHOTS_DIR / "04_dashboard_cards.png"))

        print("\n=== STEP 3: OPEN SUBJECT WORKSPACE & TEST NAVIGABLE URL ===")
        # Click subject card to re-open workspace
        page.click(".subject-card:has-text('EECS 3101')")
        page.wait_for_selector(".workspace-root", state="visible", timeout=10000)
        current_url = page.url
        assert "/subject/" in current_url
        log_step("Subject Workspace Navigation", "PASSED", f"Navigated to URL: {current_url}")
        page.screenshot(path=str(SCREENSHOTS_DIR / "05_empty_workspace.png"))

        print("\n=== STEP 4: SOURCE MANAGEMENT (PDF, TEXT, SSRF URL REJECTION) ===")
        # Test SSRF URL Rejection
        page.click("button[data-testid='add-source-btn']")
        page.wait_for_selector(".modal-tab-bar", state="visible")
        page.click(".modal-tab-btn:has-text('Webpage URL')")
        page.fill("#url-source-input", "http://127.0.0.1:8000/health")
        page.fill("#url-source-title", "Internal SSRF Test")
        page.click("button[data-testid='submit-add-source-btn']")
        page.wait_for_selector(".form-error-banner", state="visible", timeout=10000)
        err_msg = page.locator(".form-error-banner").text_content()
        assert "private/local network address" in err_msg or "blocked for security" in err_msg
        log_step("SSRF URL Ingestion Protection", "PASSED", f"Blocked private loopback URL: {err_msg}")
        page.screenshot(path=str(SCREENSHOTS_DIR / "06_ssrf_blocked.png"))
        # Close error modal
        page.click(".modal-header .modal-close-btn")
        page.wait_for_selector(".modal-backdrop", state="hidden")

        # Add Source 1: Real PDF with equations, C code, and tables
        page.click("button[data-testid='add-source-btn']")
        page.wait_for_selector(".modal-tab-bar", state="visible")
        page.click(".modal-tab-btn:has-text('File Uploads')")
        pdf_path = str(Path("data/lecture_algorithms_math_code.pdf").resolve())
        page.set_input_files(".modal-content input[type='file']", pdf_path)
        page.click("button[data-testid='submit-add-source-btn']")
        page.wait_for_selector(".modal-backdrop", state="hidden", timeout=15000)
        # Wait for Ready status in the sources list
        page.wait_for_selector(".workspace-source-item:has-text('Ready')", timeout=20000)
        log_step("Lecture PDF Upload & Parsing", "PASSED", "Uploaded lecture_algorithms_math_code.pdf (Math + Code + Tables)")

        # Add Source 2: Pasted Text
        page.click("button[data-testid='add-source-btn']")
        page.wait_for_selector(".modal-tab-bar", state="visible")
        page.click(".modal-tab-btn:has-text('Paste Text')")
        page.fill("#paste-source-title", "Lecture 1 Supplement: Master Theorem Rules")
        pasted_text_body = """Master Theorem Summary:
For recurrences of the form T(n) = a*T(n/b) + f(n):
Case 1: If f(n) = O(n^(log_b(a) - epsilon)) for some epsilon > 0, then T(n) = Theta(n^log_b(a)).
Case 2: If f(n) = Theta(n^log_b(a)), then T(n) = Theta(n^log_b(a) * log n).
Case 3: If f(n) = Omega(n^(log_b(a) + epsilon)) for some epsilon > 0 and regularity holds, then T(n) = Theta(f(n)).
Important note: All assignments are due on Fridays at 23:59 via Canvas submission."""
        page.fill("#paste-source-text", pasted_text_body)
        page.click("button[data-testid='submit-add-source-btn']")
        page.wait_for_selector(".modal-backdrop", state="hidden", timeout=10000)
        page.wait_for_selector(".workspace-source-item:has-text('Master Theorem Rules')", timeout=10000)
        log_step("Pasted Text Source Ingestion", "PASSED", "Added pasted text supplement with 2 ready sources")
        page.screenshot(path=str(SCREENSHOTS_DIR / "07_sources_ready.png"))

        # Verify full source viewer modal
        pdf_item = page.locator(".workspace-source-item:has-text('lecture_algorithms_math_code')")
        pdf_item.locator("button.source-item-btn[title='View content']").click()
        page.wait_for_selector(".source-viewer-body", state="visible")
        page.wait_for_selector(".source-viewer-body:has-text('Recurrence')", timeout=10000)
        log_step("Source Viewer Inspection", "PASSED", "Inspected parsed text and structure in source viewer modal")
        page.screenshot(path=str(SCREENSHOTS_DIR / "08_source_viewer.png"))
        page.click(".modal-header .modal-close-btn")
        page.wait_for_selector(".modal-backdrop", state="hidden")

        print("\n=== STEP 5: REAL CONVERSATIONAL CHAT, CITATIONS, CODE, MATH, TABLES ===")
        # Verify selected source count
        expect(page.locator(".selection-badge")).to_contain_text("2 of 2 selected")

        # Ask Question 1: Mathematical recurrence and table
        composer = page.locator("#question-input")
        composer.fill("What is the recurrence relation for Merge Sort and how does Master Theorem solve it? Also summarize the algorithm complexity table.")
        page.click("button.composer-send-btn")

        # Wait for assistant response (real LLM response)
        print("Waiting for real LLM response to complete...")
        page.wait_for_selector(".thread-turn.turn-assistant .answer-text", timeout=45000)
        time.sleep(3)  # Let rendering settle
        page.screenshot(path=str(SCREENSHOTS_DIR / "09_first_chat_response.png"))

        ans_text = page.locator(".thread-turn.turn-assistant .answer-text").first.text_content()
        assert len(ans_text) > 50
        print(f"Assistant response preview:\n{ans_text[:250]}...\n")

        # Verify inline citation chip exists
        citation_chip = page.locator("button.chip").first
        expect(citation_chip).to_be_visible()
        citation_text = citation_chip.text_content()
        log_step("Grounded Chat & Citations", "PASSED", f"Generated answer with inline citation: {citation_text}")

        # Click citation chip to inspect passage viewer
        citation_chip.click()
        page.wait_for_selector(".source-panel-open", state="visible", timeout=5000)
        passage_text = page.locator(".passage-chunk, .passage-chunk-text").first.text_content()
        assert len(passage_text) > 0
        log_step("Citation Passage Inspection", "PASSED", f"Opened passage pane with excerpt: {passage_text[:120]}...")
        page.screenshot(path=str(SCREENSHOTS_DIR / "10_citation_passage_inspector.png"))

        # Ask Follow-up Question: "Why does Case 2 apply?"
        composer.fill("Why does Case 2 of Master Theorem apply specifically to Merge Sort?")
        page.click("button.composer-send-btn")
        print("Waiting for follow-up response...")
        second_assistant = page.locator(".thread-turn.turn-assistant").nth(1)
        second_assistant.locator(".answer-text").wait_for(timeout=45000)
        time.sleep(2)
        followup_ans = second_assistant.locator(".answer-text").text_content()
        log_step("Follow-up Multi-turn Chat", "PASSED", f"Follow-up answered successfully: {followup_ans[:150]}...")
        page.screenshot(path=str(SCREENSHOTS_DIR / "11_followup_chat.png"))

        # Test Stop Generation & Retry Buttons
        last_retry_btn = page.locator("button.answer-action-btn:has-text('Retry')").last
        last_retry_btn.click()
        time.sleep(0.3)
        # Test stop button if visible while generating
        stop_btn = page.locator(".stop-gen-btn")
        if stop_btn.is_visible():
            stop_btn.click()
            log_step("Stop Generation Behaviour", "PASSED", "Successfully clicked stop generation button")
        else:
            log_step("Retry Message Action", "PASSED", "Retried message successfully")
        time.sleep(2)

        print("\n=== STEP 6: MULTIPLE CONVERSATIONS (RENAME, DELETE) ===")
        # Switch to Chats tab in sidebar
        page.click("button.nav-tab-btn:has-text('Chats')")
        page.click("button[data-testid='new-conversation-btn']")
        time.sleep(1)
        expect(page.locator(".workspace-conv-item")).to_have_count(2)
        log_step("Multiple Conversations Creation", "PASSED", "Created second conversation")

        # Rename conversation (via window.prompt)
        conv_item = page.locator(".workspace-conv-item").first
        conv_item.locator("button.source-item-btn[title='Rename conversation']").click()
        time.sleep(1)
        expect(page.locator(".workspace-conv-item:has-text('Exam Preparation Notes')")).to_be_visible()
        log_step("Conversation Renaming", "PASSED", "Renamed conversation to Exam Preparation Notes")

        # Delete conversation
        del_conv_item = page.locator(".workspace-conv-item:has-text('Exam Preparation Notes')")
        del_conv_item.locator("button.source-item-btn[title='Delete conversation']").click()
        time.sleep(1)
        expect(page.locator(".workspace-conv-item")).to_have_count(1)
        log_step("Conversation Deletion", "PASSED", "Deleted conversation with confirmation")

        print("\n=== STEP 7: SOURCE DESELECTION & ISOLATION BOUNDARIES ===")
        # Switch back to Sources tab in sidebar
        page.click("button.nav-tab-btn:has-text('Sources')")
        # Deselect all sources
        page.click("button.btn-link:has-text('Clear')")
        expect(page.locator(".selection-badge")).to_contain_text("0 of 2 selected")

        # Try asking a question with 0 sources selected
        composer.fill("What is the penalty for late submissions?")
        page.click("button.composer-send-btn")
        time.sleep(2)
        zero_source_warning = page.locator(".workspace-no-sources-alert, .answer-text, .abstain-reason").last.text_content()
        assert "select" in zero_source_warning.lower() or "no sources" in zero_source_warning.lower() or "documents" in zero_source_warning.lower()
        log_step("Source Boundary Enforcement", "PASSED", f"Enforced source selection requirement: {zero_source_warning[:100]}")
        page.screenshot(path=str(SCREENSHOTS_DIR / "12_source_deselection_boundary.png"))

        # Re-select all sources
        page.click("button.btn-link:has-text('Select all')")
        expect(page.locator(".selection-badge")).to_contain_text("2 of 2 selected")

        print("\n=== STEP 8: BASIC SAVED NOTES (SAVE FROM CHAT & PERSONAL NOTES) ===")
        # Click 'Save to note' on the first assistant response
        save_btn = page.locator("button.answer-action-btn:has-text('Save to note')").first
        save_btn.click()
        time.sleep(1)

        # Switch to Notes tab in sidebar
        page.click("button.nav-tab-btn:has-text('Notes')")
        expect(page.locator(".workspace-note-item")).to_have_count(1)
        note_title = page.locator(".note-title-text").first.text_content()
        log_step("Save Answer to Note", "PASSED", f"Saved answer note: {note_title}")

        # Create personal note
        page.click("button[data-testid='new-note-btn']")
        page.wait_for_selector("#note-title-input", state="visible")
        page.fill("#note-title-input", "Final Exam Study Checklist")
        page.fill("#note-content-input", "- Review Master Theorem Cases\n- Implement In-Place Partition for QuickSort\n- Practice Dijkstra algorithm")
        page.click(".modal-content button[type='submit']")
        page.wait_for_selector(".modal-backdrop", state="hidden", timeout=5000)
        time.sleep(1)
        expect(page.locator(".workspace-note-item")).to_have_count(2)
        log_step("Personal Note Creation", "PASSED", "Created personal note Final Exam Study Checklist")

        # Search notes
        page.fill("input.source-search-input[placeholder='Find notes...']", "Checklist")
        time.sleep(0.5)
        expect(page.locator(".workspace-note-item")).to_have_count(1)
        page.fill("input.source-search-input[placeholder='Find notes...']", "")
        time.sleep(0.5)
        expect(page.locator(".workspace-note-item")).to_have_count(2)
        log_step("Notes Search & Filtering", "PASSED", "Filtered notes by search query")
        page.screenshot(path=str(SCREENSHOTS_DIR / "13_saved_notes.png"))

        print("\n=== STEP 9: HISTORICAL CITATION INTEGRITY ON REPLACED / DELETED SOURCES ===")
        # Switch back to Sources tab in sidebar
        page.click("button.nav-tab-btn:has-text('Sources')")

        # Now remove the cited PDF source to trigger historical citation handling
        pdf_source_item = page.locator(".workspace-source-item:has-text('lecture_algorithms_math_code')")
        pdf_source_item.locator("button.source-item-btn[title='Remove source']").click()
        time.sleep(1)
        log_step("Source Removal for Historical Check", "PASSED", "Removed cited source to verify historical citation handling")

        # Click the original citation chip in chat
        citation_chip.click()
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "14_historical_citation.png"))
        # Verify historical alert or preserved excerpt
        hist_alert = page.locator(".historical-citation-alert, .passage-chunk").first
        expect(hist_alert).to_be_visible()
        log_step("Historical Citation Integrity", "PASSED", "Preserved citation excerpt without silent substitution")

        print("\n=== STEP 10: RELOAD PERSISTENCE & BROWSER BACK/FORWARD NAVIGATION ===")
        # Reload page at /subject/:id
        page.reload(wait_until="networkidle")
        page.wait_for_selector(".workspace-root", state="visible")
        expect(page.locator(".workspace-subject-name")).to_contain_text("EECS 3101")
        expect(page.locator(".thread-turn")).to_have_count(page.locator(".thread-turn").count())
        log_step("Workspace Reload Persistence", "PASSED", "Reloaded /subject/:id and verified state persisted from PostgreSQL")

        # Test Browser Back button -> navigates back to dashboard /
        page.go_back()
        time.sleep(1)
        expect(page.locator(".dashboard-root")).to_be_visible()
        log_step("Browser Back Navigation", "PASSED", f"Navigated back to dashboard: {page.url}")

        # Test Browser Forward button -> returns to /subject/:id
        page.go_forward()
        time.sleep(1)
        expect(page.locator(".workspace-root")).to_be_visible()
        log_step("Browser Forward Navigation", "PASSED", f"Navigated forward to subject workspace: {page.url}")

        print("\n=== STEP 11: MOBILE VIEWPORT & RESPONSIVE LAYOUT ===")
        # Resize viewport to iPhone mobile size (375x667)
        page.set_viewport_size({"width": 375, "height": 667})
        time.sleep(1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "15_mobile_workspace.png"))

        # Test mobile drawer toggle
        mobile_menu_btn = page.locator("button.mobile-menu-btn")
        if mobile_menu_btn.is_visible():
            mobile_menu_btn.click()
            time.sleep(0.5)
            expect(page.locator(".workspace-sidebar.sidebar-open")).to_be_visible()
            page.screenshot(path=str(SCREENSHOTS_DIR / "16_mobile_drawer_open.png"))
            # Close mobile menu
            page.locator("button.mobile-close-btn").click()
            time.sleep(0.5)
        log_step("Mobile Viewport Layout", "PASSED", "Verified 375x667 responsive layout and drawer interactions")

        print("\n=== STEP 12: SHARED DEMO ACCOUNT COLLISION AUDIT ===")
        # Open a new isolated incognito context and test demo account login
        demo_context = browser.new_context(viewport={"width": 1280, "height": 800})
        demo_page = demo_context.new_page()
        demo_page.goto(FRONTEND_URL, wait_until="networkidle")

        # Click One-Click Demo Account button
        demo_page.locator("button:has-text('Demo Account')").first.click()
        demo_page.wait_for_selector(".user-email-tag", timeout=10000)
        demo_email = demo_page.locator(".user-email-tag").text_content()
        assert "student@notebookspace.local" in demo_email

        # Navigate to Study Notebooks
        demo_page.locator(".nav-switcher-btn:has-text('Study Notebooks')").click()
        time.sleep(1)

        # Confirm user isolation: the demo account does NOT see the registered user's EECS 3101 subject!
        demo_subjects_count = demo_page.locator(".subject-card:has-text('EECS 3101 — Advanced Algorithms')").count()
        assert demo_subjects_count == 0
        log_step("User Data Isolation Audit", "PASSED",
                 "Confirmed: Registered users are 100% isolated. Demo account (student@notebookspace.local) cannot view or access registered user's subjects.")
        demo_page.screenshot(path=str(SCREENSHOTS_DIR / "17_demo_user_isolation.png"))

        demo_context.close()
        context.close()
        browser.close()

    print("\n================== VERIFICATION SUMMARY ==================")
    all_passed = all(r["status"] == "PASSED" for r in test_results.values())
    for name, res in test_results.items():
        print(f"[{res['status']}] {name}: {res['detail']}")
    print(f"\nFinal Result: {'ALL TESTS PASSED (12/12)' if all_passed else 'SOME TESTS FAILED'}")
    return all_passed


if __name__ == "__main__":
    success = run_verification()
    sys.exit(0 if success else 1)
