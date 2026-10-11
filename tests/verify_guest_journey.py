"""
End-to-End Real Browser Verification for Guest Workspace Access & Isolation.
Runs against live FastAPI backend (http://127.0.0.1:8000) and Vite frontend (http://127.0.0.1:5173).
"""
import time
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

FRONTEND_URL = "http://127.0.0.1:5173"
BACKEND_URL = "http://127.0.0.1:8000"
SCREENSHOTS_DIR = Path("tests/screenshots")
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

test_results = {}


def log_step(name: str, passed: bool, detail: str = ""):
    test_results[name] = {"passed": passed, "detail": detail}
    sym = "✓" if passed else "✗"
    print(f"[{sym}] {name}: {detail}")


def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        print("\n=== STEP 1: INITIAL DIRECT LANDING (VISITOR A) ===")
        context_a = browser.new_context(viewport={"width": 1280, "height": 850})
        page_a = context_a.new_page()

        # Handle dialogs automatically
        page_a.on("dialog", lambda d: d.accept())

        page_a.on("console", lambda msg: print(f"[CONSOLE {msg.type}] {msg.text}"))
        page_a.on("pageerror", lambda err: print(f"[PAGE ERROR] {err}"))

        # Visit root URL directly
        page_a.goto(FRONTEND_URL, wait_until="networkidle")
        time.sleep(1.0)

        # 1.1 Verify no sign-in or register buttons or modal
        has_signin_modal = page_a.locator(".modal-backdrop").count() > 0
        has_signin_btn = page_a.locator(".btn-sign-in").count() > 0
        log_step("No Sign-In Modal on Load", not has_signin_modal, f"Modal count: {page_a.locator('.modal-backdrop').count()}")
        log_step("No Account/Sign-In Buttons", not has_signin_btn, f"Sign-in button count: {page_a.locator('.btn-sign-in').count()}")

        # 1.2 Verify direct landing on Subject Dashboard
        heading_text = page_a.locator(".dashboard-main-title").inner_text()
        log_step("Direct Landing on Dashboard", "Study Notebooks" in heading_text, f"Heading: '{heading_text}'")

        # 1.3 Verify Guest Workspace Notice Banner
        banner = page_a.locator('[data-testid="guest-workspace-banner"]')
        expect(banner).to_be_visible()
        banner_text = banner.inner_text()
        log_step("Private Browser Notice Banner", "Private Browser Workspace" in banner_text, f"Banner text: '{banner_text[:60]}...'")

        # 1.4 Verify Guest Workspace Badge in Top Nav
        badge = page_a.locator('[data-testid="guest-workspace-badge"]')
        expect(badge).to_be_visible()
        log_step("Guest Workspace Badge in Header", badge.is_visible(), f"Badge text: '{badge.inner_text()}'")

        page_a.screenshot(path=str(SCREENSHOTS_DIR / "guest_01_dashboard_landing.png"))

        print("\n=== STEP 2: CREATE SUBJECT (VISITOR A) ===")
        # Click Create Subject button
        page_a.locator('[data-testid="create-subject-btn"]').click()
        page_a.wait_for_selector(".modal-backdrop")
        page_a.locator("#create-subj-name").fill("EECS 3101 — Algorithms")
        page_a.locator("#create-subj-code").fill("EECS 3101")
        page_a.locator("#create-subj-desc").fill("Design and Analysis of Algorithms")
        page_a.locator('button[type="submit"]:has-text("Create Notebook")').click()
        time.sleep(1.0)
        err = page_a.locator(".form-error-banner")
        if err.count() > 0 and err.is_visible():
            print(f"[FORM ERROR BANNER]: {err.inner_text()}")

        # Creation navigates directly to the new subject workspace in the SPA
        page_a.wait_for_selector(".workspace-subject-name", timeout=10000)
        time.sleep(1.0)
        url_a = page_a.url
        subject_a_id = url_a.split("/subject/")[1].split("?")[0]
        log_step("Create Subject Succeeded & Opened Workspace", f"/subject/{subject_a_id}" in url_a, f"URL: {url_a}")

        page_a.screenshot(path=str(SCREENSHOTS_DIR / "guest_02_subject_created.png"))

        print("\n=== STEP 3: WORKSPACE & SOURCE INGESTION (VISITOR A) ===")

        # Add Source via Paste
        page_a.locator('button:has-text("Add sources")').click()
        page_a.wait_for_selector(".modal-backdrop")
        page_a.locator('.modal-tab-btn:has-text("Paste Text")').click()
        page_a.locator("#paste-source-title").fill("Algorithms Lecture 1: MergeSort")
        lecture_content = (
            "Divide and conquer algorithms solve a problem by dividing it into subproblems. "
            "MergeSort divides the input array of size n into two halves of size n/2 recursively, "
            "solves each half, and merges the two sorted halves in O(n) time. "
            "By the Master Theorem, T(n) = 2T(n/2) + O(n), which solves to total time complexity T(n) = O(n log n). "
            "MergeSort requires O(n) auxiliary memory space for merging."
        )
        page_a.locator("#paste-source-text").fill(lecture_content)
        page_a.locator('[data-testid="submit-add-source-btn"]').click()

        # Wait for source to appear and become ready
        time.sleep(2.0)
        src_item = page_a.locator('.workspace-source-item:has-text("Algorithms Lecture 1: MergeSort")')
        expect(src_item).to_be_visible()
        expect(src_item).to_contain_text("Ready")
        log_step("Source Ingestion & Ready State", True, "Status: Ready")

        # Verify source checkbox is selected
        selected_count_el = page_a.locator(".selection-badge")
        expect(selected_count_el).to_contain_text("1 of 1 selected")
        log_step("Source Auto-Selected", True, "1 of 1 selected")

        print("\n=== STEP 4: CHAT WITH CITATIONS & NOTES (VISITOR A) ===")
        # Ask question using the composer
        composer_input = page_a.locator("#question-input")
        composer_input.fill("What is the time complexity of MergeSort and why?")
        page_a.locator("button.composer-send-btn").click()

        # Wait for assistant response
        page_a.wait_for_selector('.thread-turn.turn-assistant .answer-text', timeout=30000)
        time.sleep(1.5)

        asst_msg = page_a.locator('.thread-turn.turn-assistant').last
        expect(asst_msg).to_be_visible()
        asst_text = asst_msg.locator('.answer-text').inner_text()
        log_step("Real Assistant Answer Generated", len(asst_text) > 20, f"Answer preview: '{asst_text[:60]}...'")

        # Verify citation chip
        citation_chip = asst_msg.locator('.chip, .inline-citation-chip').first
        expect(citation_chip).to_be_visible()
        cit_text = citation_chip.inner_text()
        log_step("Inline Citation Chip Rendered", citation_chip.is_visible(), f"Chip text: '{cit_text}'")

        # Click citation chip to inspect passage
        citation_chip.click()
        time.sleep(1.0)
        passage_content = page_a.locator('.passage-content')
        expect(passage_content).to_be_visible()
        log_step("Citation Inspector Displayed", passage_content.is_visible(), f"Passage snippet: '{passage_content.inner_text()[:60]}...'")

        # Save to Note
        save_note_btn = asst_msg.locator('button:has-text("Save to note")')
        expect(save_note_btn).to_be_visible()
        save_note_btn.click()
        time.sleep(1.0)

        # Switch to Notes tab to verify saved note
        page_a.locator('.nav-tab-btn:has-text("Notes")').click()
        time.sleep(0.5)
        saved_note_card = page_a.locator('.workspace-note-item').first
        expect(saved_note_card).to_be_visible()
        note_title_text = saved_note_card.locator('.note-title-text').inner_text()
        log_step("Answer Saved to Note", saved_note_card.is_visible(), f"Note title: '{note_title_text}'")

        page_a.screenshot(path=str(SCREENSHOTS_DIR / "guest_03_workspace_chat_notes.png"))

        print("\n=== STEP 5: RELOAD PERSISTENCE (VISITOR A) ===")
        # Reload the page
        page_a.reload(wait_until="networkidle")
        time.sleep(2.0)

        # Verify active subject still loaded
        subj_title = page_a.locator(".workspace-subject-name").inner_text()
        log_step("Reload: Subject Restored", "EECS 3101" in subj_title, f"Workspace title: '{subj_title}'")

        # Verify source still listed
        src_reloaded = page_a.locator('.workspace-source-item:has-text("Algorithms Lecture 1: MergeSort")')
        log_step("Reload: Source Preserved", src_reloaded.is_visible(), "Source still in sidebar")

        # Return to Dashboard
        page_a.locator('button.back-btn').click()
        page_a.wait_for_selector(".dashboard-root")
        time.sleep(1.0)
        card_reloaded = page_a.locator(".subject-card:has-text('EECS 3101 — Algorithms')")
        log_step("Reload: Dashboard Card Preserved", card_reloaded.is_visible(), "Card visible on dashboard")

        print("\n=== STEP 6: VISITOR ISOLATION (VISITOR B) ===")
        # Open completely separate context (Visitor B)
        context_b = browser.new_context(viewport={"width": 1280, "height": 850})
        page_b = context_b.new_page()
        page_b.on("dialog", lambda d: d.accept())

        # Visitor B visits root
        page_b.goto(FRONTEND_URL, wait_until="networkidle")
        time.sleep(1.5)

        # Visitor B must NOT see Visitor A's subject
        card_on_b = page_b.locator(".subject-card:has-text('EECS 3101 — Algorithms')").count()
        log_step("Visitor Isolation: Separate Guest Workspace", card_on_b == 0, f"Visitor A subject card count on Visitor B: {card_on_b}")

        # Visitor B sees empty dashboard prompt
        empty_state = page_b.locator(".dashboard-empty-state")
        log_step("Visitor B Sees Fresh Empty State", empty_state.is_visible(), f"Empty state rendered")

        # Visitor B attempts to navigate directly to Visitor A's subject URL
        page_b.goto(f"{FRONTEND_URL}/subject/{subject_a_id}", wait_until="networkidle")
        time.sleep(1.5)

        # Visitor B must be redirected back to dashboard because Visitor A's subject is 404 for Visitor B
        current_b_url = page_b.url
        log_step("Visitor Isolation: Unauthorized Direct URL Rejected", f"/subject/{subject_a_id}" not in current_b_url or page_b.locator(".dashboard-root").is_visible(), f"Visitor B URL settled at: {current_b_url}")

        page_b.screenshot(path=str(SCREENSHOTS_DIR / "guest_04_visitor_b_isolated.png"))

        print("\n=== STEP 7: RESET WORKSPACE (VISITOR A) ===")
        # In Context A, click Reset Workspace
        page_a.locator('.btn-new-workspace').click()
        time.sleep(2.0)

        # After reset, dashboard should have 0 subjects
        cards_after_reset = page_a.locator(".subject-card:has-text('EECS 3101 — Algorithms')").count()
        log_step("Reset Workspace Clears Session", cards_after_reset == 0, f"Subject card count after reset: {cards_after_reset}")

        page_a.screenshot(path=str(SCREENSHOTS_DIR / "guest_05_workspace_reset.png"))

        browser.close()

    print("\n=== TEST SUMMARY ===")
    all_passed = all(r["passed"] for r in test_results.values())
    for k, v in test_results.items():
        status = "PASSED" if v["passed"] else "FAILED"
        print(f"{k}: {status} - {v['detail']}")

    print(f"\nFinal Result: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
    return all_passed


if __name__ == "__main__":
    success = run_test()
    if not success:
        sys.exit(1)
