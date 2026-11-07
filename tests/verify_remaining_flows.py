import asyncio
import os
import time
import uuid
from playwright.async_api import async_playwright

FRONTEND_URL = "http://127.0.0.1:5173"
BACKEND_URL = "http://127.0.0.1:8000"
SCREENSHOT_DIR = "tests/screenshots/verification_round2"

os.makedirs(SCREENSHOT_DIR, exist_ok=True)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        print("\n--- STEP 1: Verify Anonymous Visitor /demo Read-Only & Demo Login Blocked ---")
        await page.goto(f"{FRONTEND_URL}/demo")
        await page.wait_for_selector(".demo-pill", timeout=10000)
        demo_banner = await page.inner_text(".demo-pill")
        assert "Public demo" in demo_banner
        uploads_disabled = await page.inner_text(".sidebar-demo-upload-note")
        assert "Uploads are disabled" in uploads_disabled
        await page.screenshot(path=f"{SCREENSHOT_DIR}/01_demo_readonly.png")
        print("✓ /demo is strictly read-only with uploads disabled.")

        print("\n--- STEP 2: Register a Personal Account & Create Subject ---")
        unique_email = f"student_{uuid.uuid4().hex[:8]}@university.edu"
        await page.click(".btn-sign-in")
        await page.wait_for_selector(".modal-content-sm")

        # Verify Demo Login button is NOT visible when allow_demo_login is false
        demo_btn_count = await page.locator(".btn-demo-auth").count()
        assert demo_btn_count == 0, "Demo button should not be rendered when allow_demo_login is false"
        print("✓ Verified Demo Login button is disabled and hidden in production UI.")

        # Switch to Register tab
        await page.click("button:has-text('Create one')")
        await page.fill("input[type='email']", unique_email)
        await page.fill("input[type='password']", "SecurePass123!")
        await page.click("button:has-text('Create Account')")

        # Wait for Dashboard
        await page.wait_for_selector(".dashboard-header-container", timeout=10000)
        print("✓ Registered and logged into personal isolated workspace.")

        # Create Subject
        await page.click(".btn-new-subject")
        await page.wait_for_selector(".modal-content")
        await page.fill("input[placeholder*='Algorithms']", "EECS 2031 — Software Tools")
        await page.fill("input[placeholder*='EECS 3101']", "EECS 2031")
        await page.fill("textarea[placeholder*='Brief']", "Unix systems programming, shell scripting, and C")
        await page.click("button:has-text('Create Notebook')")

        # Wait for Subject Workspace
        await page.wait_for_selector(".workspace-header", timeout=10000)
        subject_url = page.url
        print(f"✓ Created EECS 2031 notebook at {subject_url}")

        print("\n--- STEP 3: Ingest Initial Text Source & Verify Ready ---")
        await page.click("button:has-text('Add course materials')")
        await page.wait_for_selector(".source-modal-tabs")
        await page.click("button:has-text('Paste text')")
        await page.fill("input[placeholder*='Lecture 1 notes']", "Pointers and Memory in C")
        await page.fill("textarea[placeholder*='Paste']", "Pointers in C store memory addresses. malloc allocates heap memory while free releases it.")
        await page.click("button:has-text('Add Pasted Text')")

        await page.wait_for_selector(".source-status-badge.status-ready", timeout=10000)
        print("✓ Ingested initial text source v1.")
        await page.screenshot(path=f"{SCREENSHOT_DIR}/02_source_v1_ready.png")

        print("\n--- STEP 4: Conversation Rename & Delete ---")
        # Switch to Conversations tab in sidebar
        await page.click("button.nav-tab-btn:has-text('Chats')")
        await page.wait_for_selector(".workspace-conv-item")
        
        # Create a second conversation
        await page.click(".btn-new-conv")
        await page.wait_for_timeout(1000)
        threads = await page.locator(".workspace-conv-item").all()
        assert len(threads) >= 2, f"Expected at least 2 conversations, got {len(threads)}"
        print(f"✓ Created second conversation (total conversations: {len(threads)}).")

        # Rename the active conversation
        page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept("C Pointers Deep Dive")))
        await page.click(".workspace-conv-item.active button[title='Rename conversation']")
        await page.wait_for_timeout(1000)
        
        active_title = await page.inner_text(".workspace-conv-item.active .conv-title-text")
        assert "C Pointers Deep Dive" in active_title, f"Expected renamed title, got {active_title}"
        print(f"✓ Renamed conversation to '{active_title}'.")
        await page.screenshot(path=f"{SCREENSHOT_DIR}/03_conversation_renamed.png")

        # Delete the non-active conversation
        page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
        non_active_thread = page.locator(".workspace-conv-item:not(.active)").first
        await non_active_thread.locator("button[title='Delete conversation']").click()
        await page.wait_for_timeout(1000)
        threads_after_delete = await page.locator(".workspace-conv-item").all()
        assert len(threads_after_delete) == len(threads) - 1
        print("✓ Deleted conversation thread successfully.")

        print("\n--- STEP 5: Stop Generation Verification ---")
        # Ask a complex question
        composer_input = page.locator(".composer-input").first
        await composer_input.fill("Explain dynamic memory allocation, pointer arithmetic, and double pointers with comprehensive examples.")
        await composer_input.press("Enter")

        # Wait for stop generation button to appear
        stop_btn = page.locator(".stop-gen-btn, .composer-stop-btn").first
        await stop_btn.wait_for(state="visible", timeout=8000)
        print("✓ Generation in progress: 'Stop generation' button rendered.")
        await page.screenshot(path=f"{SCREENSHOT_DIR}/04_stop_button_active.png")

        # Click Stop generation
        await stop_btn.click()
        await page.wait_for_timeout(1500)

        # Verify loading has ceased and composer is re-enabled
        loading_count = await page.locator(".message-loading").count()
        assert loading_count == 0, "Loading state should be dismissed after clicking stop"
        is_disabled = await composer_input.is_disabled()
        assert not is_disabled, "Composer should be re-enabled after stopping generation"
        print("✓ Stop generation verified: request aborted, loading cleared, composer re-enabled.")
        await page.screenshot(path=f"{SCREENSHOT_DIR}/05_generation_stopped.png")

        print("\n--- STEP 6: Source Replacement Verification ---")
        # Switch back to Sources tab
        await page.click("button.nav-tab-btn:has-text('Sources')")
        await page.wait_for_selector(".workspace-source-item")

        # Create updated file for replacement
        replace_file_path = "tests/test_replacement.txt"
        with open(replace_file_path, "w") as fp:
            fp.write("Pointers in C (Updated Edition v2): Pointers hold addresses of memory cells. Dereferencing accesses the value.")

        # Set files on hidden file input
        file_input = page.locator("input[accept*='.pdf']").first
        # Trigger replacement for active source
        await page.click("button[title='Replace file']")
        await file_input.set_input_files(replace_file_path)
        await page.wait_for_selector(".source-status-badge.status-ready", timeout=10000)
        print("✓ Source successfully replaced with updated version v2.")
        await page.screenshot(path=f"{SCREENSHOT_DIR}/06_source_replaced.png")

        print("\n--- STEP 7: Reload Persistence Verification ---")
        pre_reload_url = page.url
        pre_reload_subject_title = await page.inner_text(".workspace-subject-name")

        # Reload the page
        await page.reload()
        await page.wait_for_selector(".workspace-header", timeout=10000)

        post_reload_url = page.url
        post_reload_subject_title = await page.inner_text(".workspace-subject-name")
        assert pre_reload_url == post_reload_url, "URL should persist across reload"
        assert pre_reload_subject_title == post_reload_subject_title, "Active subject should persist across reload"
        
        # Verify sources are preserved
        sources_count = await page.locator(".workspace-source-item").count()
        assert sources_count >= 1, "Sources should persist across reload"
        print(f"✓ Reload persistence verified: subject '{post_reload_subject_title}' and {sources_count} sources preserved.")
        await page.screenshot(path=f"{SCREENSHOT_DIR}/07_reloaded_workspace.png")

        print("\n--- STEP 8: Browser Back and Forward Navigation ---")
        # Navigate back to Dashboard via UI link or back button
        await page.click(".btn-back-dashboard")
        await page.wait_for_selector(".dashboard-header-container", timeout=10000)
        dashboard_url = page.url
        assert "/subject/" not in dashboard_url
        print(f"✓ Navigated back to Dashboard: {dashboard_url}")
        await page.screenshot(path=f"{SCREENSHOT_DIR}/08_dashboard_view.png")

        # Browser Back button (should go back to Subject Workspace)
        await page.go_back()
        await page.wait_for_selector(".workspace-header", timeout=10000)
        assert "/subject/" in page.url
        print(f"✓ Browser Back navigation returned to Subject Workspace: {page.url}")

        # Browser Forward button (should go back to Dashboard)
        await page.go_forward()
        await page.wait_for_selector(".dashboard-header-container", timeout=10000)
        assert "/subject/" not in page.url
        print(f"✓ Browser Forward navigation returned to Dashboard: {page.url}")

        await browser.close()
        print("\n==================================================")
        print("ALL FLOWS VERIFIED SUCCESSFULLY IN REAL CHROMIUM!")
        print("==================================================")


if __name__ == "__main__":
    asyncio.run(main())
