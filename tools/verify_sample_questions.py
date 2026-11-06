#!/usr/bin/env python3
"""
Verification script for starter questions in the one-click sample notebook.
Creates the sample notebook locally, executes the 4 starter questions through
the real pipeline using the configured Gemini API key, and prints:
- Question
- Abstained status
- Generated answer text
- Citations

Enforces:
- At most 12 provider requests in total (4 questions x 1 attempt = 4 requests).
- Stops immediately on HTTP 429 / 402 rate limit or quota errors.
- Never prints secrets or API keys.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))
load_dotenv(project_root / ".env")

# Verify environment setup without printing secrets
api_key = os.getenv("LLM_API_KEY", "")
if not api_key:
    print("Error: LLM_API_KEY is not set in .env", file=sys.stderr)
    sys.exit(1)

from fastapi.testclient import TestClient
from api.main import app

def run_verification():
    client = TestClient(app)

    # 1. Establish guest session
    auth_res = client.post("/auth/guest-session")
    if auth_res.status_code != 200:
        print(f"Failed to create guest session: {auth_res.status_code} {auth_res.text}", file=sys.stderr)
        sys.exit(1)
    
    token = auth_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    me_res = client.get("/auth/me", headers=headers)
    user_id = me_res.json()["id"]

    # 2. Create sample notebook via one-click endpoint
    sample_res = client.post("/subjects/sample", headers=headers)
    if sample_res.status_code != 200:
        print(f"Failed to create sample notebook: {sample_res.status_code} {sample_res.text}", file=sys.stderr)
        sys.exit(1)
    
    subj = sample_res.json()
    subj_id = subj["id"]
    print(f"Created sample notebook: '{subj['name']}' (ID: {subj_id})")

    # 3. Retrieve sources and verify cs401_course_overview.pdf
    sources_res = client.get(f"/subjects/{subj_id}/sources", headers=headers)
    sources = sources_res.json()
    if not sources or sources[0]["file_name"] != "cs401_course_overview.pdf":
        print(f"Error: expected source 'cs401_course_overview.pdf', found: {sources}", file=sys.stderr)
        sys.exit(1)
    
    src_id = sources[0]["id"]
    print(f"Source ready: {sources[0]['file_name']} (ID: {src_id})")

    # 4. Fetch starter questions
    sq_res = client.get(f"/subjects/{subj_id}/starter-questions", headers=headers)
    starter_questions = sq_res.json()
    print(f"\nFetched {len(starter_questions)} starter questions:")
    for i, q in enumerate(starter_questions, 1):
        print(f"  {i}. {q}")
    
    if len(starter_questions) != 4:
        print(f"Error: expected 4 starter questions, got {len(starter_questions)}", file=sys.stderr)
        sys.exit(1)

    # Verify coverage of key syllabus topics
    sq_text = " ".join(starter_questions).lower()
    assert "late" in sq_text, "Missing late policy starter question"
    assert "grading" in sq_text or "breakdown" in sq_text, "Missing grading breakdown starter question"
    assert "topic" in sq_text or "week" in sq_text, "Missing course topics starter question"
    assert "midterm" in sq_text or "exam" in sq_text, "Missing midterm starter question"

    print("\n--- Asking 4 Starter Questions via Real Pipeline ---")

    all_passed = True
    for idx, question in enumerate(starter_questions, 1):
        print(f"\n[{idx}/4] Question: {question}")
        
        # Create a fresh conversation for this question
        conv_res = client.post(
            f"/subjects/{subj_id}/conversations",
            json={"title": question[:40]},
            headers=headers,
        )
        if conv_res.status_code != 200:
            print(f"Failed to create conversation: {conv_res.status_code} {conv_res.text}", file=sys.stderr)
            sys.exit(1)
        conv_id = conv_res.json()["id"]

        # Send question through real answering pipeline
        msg_payload = {
            "question": question,
            "selected_source_ids": [src_id],
        }
        res = client.post(
            f"/subjects/{subj_id}/conversations/{conv_id}/messages",
            json=msg_payload,
            headers=headers,
        )

        # Check for provider rate limit / quota exhaustion
        if res.status_code in (402, 429):
            print(f"STOPPING: Provider rate limit or billing limit encountered (HTTP {res.status_code}).")
            sys.exit(2)

        data = res.json()
        content = data.get("content", "")
        abstained = data.get("abstained", False)
        abstain_reason = data.get("abstain_reason")
        citations = data.get("citations", [])

        # Check for quota exhaustion reported in content or reason
        if "quota" in content.lower() or "billing limit" in content.lower() or abstain_reason == "generation_failed":
            if "billing limit" in content.lower() or "usage" in content.lower():
                print(f"STOPPING: Provider quota exhausted (429/402): {content}")
                sys.exit(2)

        print(f"  Abstained: {abstained} (reason: {abstain_reason})")
        print(f"  Answer: {content}")
        print(f"  Citations ({len(citations)}):")
        for c in citations:
            print(f"    - [{c.get('file')} p.{c.get('page')}]: \"{c.get('excerpt', '')[:100]}...\"")

        if abstained or len(citations) == 0:
            print(f"  FAILED: Question did not answer with citations! (abstained={abstained}, citations={len(citations)})")
            all_passed = False
        else:
            print("  PASSED: Answered with citations.")

    if not all_passed:
        print("\nVerification FAILED: One or more questions did not answer with citations.", file=sys.stderr)
        sys.exit(1)
    
    print("\nSUCCESS: All 4 starter questions answered with verified citations!")

if __name__ == "__main__":
    run_verification()
