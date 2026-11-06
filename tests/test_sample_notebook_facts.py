import re
from pathlib import Path
import pypdf
import pytest
from fastapi.testclient import TestClient

from api.main import app

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SAMPLE_PDF = PROJECT_ROOT / "docs" / "sample_notebook" / "cs401_course_overview.pdf"


def test_sample_notebook_document_facts():
    """Verify that cs401_course_overview.pdf exists and contains all required course details."""
    if not SAMPLE_PDF.is_file():
        from tools.make_sample_notebook_doc import build_sample_notebook_doc
        build_sample_notebook_doc(SAMPLE_PDF)

    assert SAMPLE_PDF.is_file(), f"Missing sample PDF at {SAMPLE_PDF}"
    
    reader = pypdf.PdfReader(str(SAMPLE_PDF))
    assert len(reader.pages) in (3, 4), f"Expected 3-4 pages, got {len(reader.pages)}"
    
    full_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    
    # 1. Office hours and prerequisites
    assert "office hours" in full_text.lower()
    assert "prerequisites" in full_text.lower()
    assert "cs 201" in full_text.lower()
    
    # 2. Late policy
    assert "late policy" in full_text.lower() or "late submission" in full_text.lower()
    assert "10 percent" in full_text.lower()
    
    # 3. Midterm date and weight
    assert "midterm" in full_text.lower()
    assert "november 5" in full_text.lower()
    
    # 4. Weekly course schedule and topics
    assert "course topics by week" in full_text.lower() or "topics by week" in full_text.lower()
    assert "week 1" in full_text.lower()
    assert "week 14" in full_text.lower()
    
    # 5. Full grading breakdown whose percentages sum to 100
    page_2_text = reader.pages[1].extract_text() or ""
    # Find all percentages mentioned in grading breakdown lines
    # Projects: 40%, Midterm: 25%, Final: 25%, Homework/Quizzes: 10%
    matches = re.findall(r'(\d+)\s+percent', page_2_text, re.IGNORECASE)
    assert matches, "No percentages found in grading breakdown"
    
    # Specific components on page 2: 40 (projects), 25 (midterm), 25 (final), 10 (homework)
    weights = [40, 25, 25, 10]
    for w in weights:
        assert str(w) in matches, f"Expected weight {w}% not found in grading breakdown percentages: {matches}"
    
    assert sum(weights) == 100, f"Grading breakdown weights must sum to 100, got {sum(weights)}"


def test_sample_notebook_creation_and_starter_questions():
    """Verify that sample notebook endpoint creates cs401_course_overview.pdf and 4 starter questions (no network)."""
    client = TestClient(app)
    
    # 1. Guest session
    auth_res = client.post("/auth/guest-session")
    assert auth_res.status_code == 200
    token = auth_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Create sample notebook
    sample_res = client.post("/subjects/sample", headers=headers)
    assert sample_res.status_code == 200
    subj = sample_res.json()
    assert "Sample" in subj["name"]
    assert subj["source_count"] == 1
    subj_id = subj["id"]
    
    # 3. Verify source
    sources_res = client.get(f"/subjects/{subj_id}/sources", headers=headers)
    assert sources_res.status_code == 200
    sources = sources_res.json()
    assert len(sources) == 1
    src = sources[0]
    assert src["file_name"] == "cs401_course_overview.pdf"
    assert src["status"] == "ready"
    
    # 4. Verify pre-written sample conversation
    convs_res = client.get(f"/subjects/{subj_id}/conversations", headers=headers)
    assert convs_res.status_code == 200
    convs = convs_res.json()
    assert len(convs) == 1
    conv_id = convs[0]["id"]
    
    msgs_res = client.get(f"/subjects/{subj_id}/conversations/{conv_id}/messages", headers=headers)
    assert msgs_res.status_code == 200
    msgs = msgs_res.json()
    assert len(msgs) == 2
    user_msg = msgs[0]
    asst_msg = msgs[1]
    assert user_msg["role"] == "user"
    assert "late" in user_msg["content"].lower()
    assert asst_msg["role"] == "assistant"
    assert asst_msg["model"] == "Sample"
    assert "Sample Answer" in asst_msg["content"]
    assert len(asst_msg["citations"]) > 0
    assert asst_msg["citations"][0]["file"] == "cs401_course_overview.pdf"
    assert asst_msg["citations"][0]["page"] == 2
    
    # 5. Verify 4 starter questions
    sq_res = client.get(f"/subjects/{subj_id}/starter-questions", headers=headers)
    assert sq_res.status_code == 200
    starter_questions = sq_res.json()
    assert len(starter_questions) == 4
    
    joined_sq = " ".join(starter_questions).lower()
    assert "late" in joined_sq, "Missing late policy starter question"
    assert "grading" in joined_sq or "breakdown" in joined_sq, "Missing grading breakdown starter question"
    assert "topic" in joined_sq or "week" in joined_sq, "Missing course topics starter question"
    assert "midterm" in joined_sq, "Missing midterm starter question"
