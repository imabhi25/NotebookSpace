import json
import uuid
import pytest
from unittest.mock import MagicMock

from answering.notebook_answer import answer_notebook_question
from answering.llm import LLMResponse
from db.connection import get_connection
from db.notebook_store import (
    create_subject,
    create_source,
    create_conversation,
    get_messages_for_conversation,
)


@pytest.fixture
def test_setup():
    test_user_id = uuid.uuid4()
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (id, email, password_hash)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (id) DO NOTHING;
                    """,
                    (str(test_user_id), f"test_{test_user_id.hex[:8]}@example.com", "hash"),
                )

    subj = create_subject(user_id=test_user_id, name="Algorithms Course")
    conv = create_conversation(user_id=test_user_id, subject_id=subj["id"], title="Proof Check Chat")
    src = create_source(
        user_id=test_user_id,
        subject_id=subj["id"],
        title="Lecture Algorithms",
        file_name="lecture_algorithms.pdf",
        source_type="pdf",
        page_count=5,
    )
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE sources SET status = 'ready' WHERE id = %s;",
                    (str(src["id"]),),
                )
                # Insert chunk for retrieval
                cur.execute(
                    """
                    INSERT INTO chunks (source_id, file_name, chunk_index, page_number, chunk_text, embedding)
                    VALUES (%s, %s, %s, %s, %s, %s);
                    """,
                    (
                        str(src["id"]),
                        "lecture_algorithms.pdf",
                        1,
                        1,
                        "Loop Invariant: At start of each iteration, temp[0..k-1] contains the smallest elements in sorted order.",
                        [1.0] + [0.0] * 383,
                    ),
                )

    return {
        "user_id": test_user_id,
        "subject_id": subj["id"],
        "conversation_id": conv["id"],
        "source_id": src["id"],
    }


def test_migration_004_applied():
    """Verify that migration 004 added the proof_check JSONB column to messages."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'messages' AND column_name = 'proof_check';
                """
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "proof_check"
            assert row[1] == "jsonb"


def test_bad_verdict_dropped(test_setup):
    """Verify that sections with an unknown or invalid verdict are dropped."""
    client = MagicMock()
    model_output = {
        "supported": True,
        "overall": "Assessment of loop invariant.",
        "sections": [
            {
                "part": "initialization",
                "verdict": "super_good",  # INVALID VERDICT
                "feedback": "Initialization holds.",
                "hint": "Check base index.",
                "citations": [{"file": "lecture_algorithms.pdf", "page": 1}],
            },
            {
                "part": "maintenance",
                "verdict": "correct",
                "feedback": "Maintenance preserves order.",
                "hint": "None needed.",
                "citations": [{"file": "lecture_algorithms.pdf", "page": 1}],
            },
        ],
    }
    client.generate.return_value = LLMResponse(
        text=json.dumps(model_output),
        input_tokens=100,
        output_tokens=50,
        latency_seconds=0.5,
    )
    client.model = "mock-llm"

    res = answer_notebook_question(
        question="Check my proof",
        conversation_id=test_setup["conversation_id"],
        user_id=test_setup["user_id"],
        subject_id=test_setup["subject_id"],
        selected_source_ids=[test_setup["source_id"]],
        mode="proof",
        proof_submission={
            "statement": "Merge sort merges correctly",
            "format": "loop_invariant",
            "initialization": "Prior to loop, k=0.",
            "maintenance": "Each step preserves order.",
            "termination": "Loop finishes.",
        },
        llm_client=client,
    )

    proof_check = res.get("proof_check")
    assert proof_check is not None
    assert proof_check["supported"] is True
    # "initialization" section with verdict "super_good" should be dropped
    assert len(proof_check["sections"]) == 1
    assert proof_check["sections"][0]["part"] == "maintenance"
    assert proof_check["sections"][0]["verdict"] == "correct"


def test_unknown_part_dropped(test_setup):
    """Verify that sections with an unknown part are dropped."""
    client = MagicMock()
    model_output = {
        "supported": True,
        "overall": "Assessment of proof.",
        "sections": [
            {
                "part": "conclusion_epilogue",  # INVALID PART
                "verdict": "correct",
                "feedback": "Invalid part feedback.",
                "hint": "Check part.",
                "citations": [{"file": "lecture_algorithms.pdf", "page": 1}],
            },
            {
                "part": "termination",
                "verdict": "correct",
                "feedback": "Termination finishes.",
                "hint": "None.",
                "citations": [{"file": "lecture_algorithms.pdf", "page": 1}],
            },
        ],
    }
    client.generate.return_value = LLMResponse(
        text=json.dumps(model_output),
        input_tokens=100,
        output_tokens=50,
        latency_seconds=0.5,
    )
    client.model = "mock-llm"

    res = answer_notebook_question(
        question="Check my proof",
        conversation_id=test_setup["conversation_id"],
        user_id=test_setup["user_id"],
        subject_id=test_setup["subject_id"],
        selected_source_ids=[test_setup["source_id"]],
        mode="proof",
        proof_submission={
            "statement": "Merge sort loop invariant",
            "format": "loop_invariant",
            "initialization": "k=0",
            "maintenance": "holds",
            "termination": "terminates",
        },
        llm_client=client,
    )

    proof_check = res.get("proof_check")
    assert proof_check is not None
    assert len(proof_check["sections"]) == 1
    assert proof_check["sections"][0]["part"] == "termination"


def test_invalid_citation_dropped(test_setup):
    """Verify that citations to files or pages not in retrieved passages are dropped."""
    client = MagicMock()
    model_output = {
        "supported": True,
        "overall": "Assessment of proof.",
        "sections": [
            {
                "part": "initialization",
                "verdict": "correct",
                "feedback": "Base case holds.",
                "hint": "Good.",
                "citations": [
                    {"file": "lecture_algorithms.pdf", "page": 1},  # Valid
                    {"file": "nonexistent_file.pdf", "page": 99},   # Invalid, unretrieved
                ],
            }
        ],
    }
    client.generate.return_value = LLMResponse(
        text=json.dumps(model_output),
        input_tokens=100,
        output_tokens=50,
        latency_seconds=0.5,
    )
    client.model = "mock-llm"

    res = answer_notebook_question(
        question="Check my proof",
        conversation_id=test_setup["conversation_id"],
        user_id=test_setup["user_id"],
        subject_id=test_setup["subject_id"],
        selected_source_ids=[test_setup["source_id"]],
        mode="proof",
        proof_submission={
            "statement": "Merge invariant",
            "format": "loop_invariant",
            "initialization": "k=0",
            "maintenance": "preserves",
            "termination": "ends",
        },
        llm_client=client,
    )

    proof_check = res.get("proof_check")
    assert proof_check is not None
    sec = proof_check["sections"][0]
    assert len(sec["citations"]) == 1
    assert sec["citations"][0]["file"] == "Lecture Algorithms"
    assert sec["citations"][0]["page"] == 1


def test_supported_false_path(test_setup):
    """Verify supported: false path when passages do not support grading or model reports unsupported."""
    client = MagicMock()
    model_output = {
        "supported": False,
        "overall": "No course material covers this algorithm.",
        "sections": [],
    }
    client.generate.return_value = LLMResponse(
        text=json.dumps(model_output),
        input_tokens=100,
        output_tokens=30,
        latency_seconds=0.5,
    )
    client.model = "mock-llm"

    res = answer_notebook_question(
        question="Check my proof",
        conversation_id=test_setup["conversation_id"],
        user_id=test_setup["user_id"],
        subject_id=test_setup["subject_id"],
        selected_source_ids=[test_setup["source_id"]],
        mode="proof",
        proof_submission={
            "statement": "Quantum sorting algorithm",
            "format": "free_form",
            "body": "Quantum superposition sorts in O(1).",
        },
        llm_client=client,
    )

    assert res.get("abstained") is True
    assert res.get("abstain_reason") == "not_found"
    proof_check = res.get("proof_check")
    assert proof_check is not None
    assert proof_check["supported"] is False
    assert "No course material covers this" in proof_check["overall"]


def test_readable_content_and_persistence(test_setup):
    """Verify that readable plain-text content is stored on both user and assistant messages."""
    client = MagicMock()
    model_output = {
        "supported": True,
        "overall": "The proof is logically sound and follows lecture principles.",
        "sections": [
            {
                "part": "initialization",
                "verdict": "correct",
                "feedback": "Trivially sorted before first iteration.",
                "hint": "Good work.",
                "citations": [{"file": "lecture_algorithms.pdf", "page": 1}],
            },
            {
                "part": "maintenance",
                "verdict": "correct",
                "feedback": "Smallest element is copied at each step.",
                "hint": "Good work.",
                "citations": [{"file": "lecture_algorithms.pdf", "page": 1}],
            },
        ],
    }
    client.generate.return_value = LLMResponse(
        text=json.dumps(model_output),
        input_tokens=100,
        output_tokens=60,
        latency_seconds=0.5,
    )
    client.model = "mock-llm"

    res = answer_notebook_question(
        question="Check my proof",
        conversation_id=test_setup["conversation_id"],
        user_id=test_setup["user_id"],
        subject_id=test_setup["subject_id"],
        selected_source_ids=[test_setup["source_id"]],
        mode="proof",
        proof_submission={
            "statement": "Merge sort while-loop invariant",
            "format": "loop_invariant",
            "initialization": "k=0, temp is empty.",
            "maintenance": "Copy smallest element.",
            "termination": "All elements copied.",
        },
        llm_client=client,
    )

    # Check assistant message content
    assert "The proof is logically sound" in res["content"]
    assert "- **Initialization** (Correct):" in res["content"]
    assert "- **Maintenance** (Correct):" in res["content"]

    # Check messages in conversation history from DB
    messages = get_messages_for_conversation(
        user_id=test_setup["user_id"],
        conversation_id=test_setup["conversation_id"],
    )
    user_msgs = [m for m in messages if m["role"] == "user"]
    asst_msgs = [m for m in messages if m["role"] == "assistant"]

    assert len(user_msgs) >= 1
    u = user_msgs[-1]
    assert "What are you proving: Merge sort while-loop invariant" in u["content"]
    assert "**Initialization:**" in u["content"]
    assert u.get("proof_check") is not None
    assert u["proof_check"]["type"] == "submission"
    assert u["proof_check"]["statement"] == "Merge sort while-loop invariant"

    assert len(asst_msgs) >= 1
    a = asst_msgs[-1]
    assert a.get("proof_check") is not None
    assert a["proof_check"]["supported"] is True
    assert len(a["proof_check"]["sections"]) == 2


def test_api_empty_proof_submission_rejected(test_setup):
    """Verify that empty proof submission or statement > 500 chars returns 422."""
    from fastapi.testclient import TestClient
    from api.main import app
    from api.auth import create_user_session

    client = TestClient(app)
    token = create_user_session(test_setup["user_id"])
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Empty loop invariant textareas
    resp1 = client.post(
        f"/subjects/{test_setup['subject_id']}/conversations/{test_setup['conversation_id']}/messages",
        headers=headers,
        json={
            "mode": "proof",
            "proof_submission": {
                "statement": "Valid statement",
                "format": "loop_invariant",
                "initialization": "   ",
                "maintenance": "",
                "termination": None,
            },
            "selected_source_ids": [str(test_setup["source_id"])],
        },
    )
    assert resp1.status_code == 422

    # 2. Empty free_form body
    resp2 = client.post(
        f"/subjects/{test_setup['subject_id']}/conversations/{test_setup['conversation_id']}/messages",
        headers=headers,
        json={
            "mode": "proof",
            "proof_submission": {
                "statement": "Valid statement",
                "format": "free_form",
                "body": "   ",
            },
            "selected_source_ids": [str(test_setup["source_id"])],
        },
    )
    assert resp2.status_code == 422

    # 3. Missing statement
    resp3 = client.post(
        f"/subjects/{test_setup['subject_id']}/conversations/{test_setup['conversation_id']}/messages",
        headers=headers,
        json={
            "mode": "proof",
            "proof_submission": {
                "statement": "  ",
                "format": "free_form",
                "body": "Some body",
            },
            "selected_source_ids": [str(test_setup["source_id"])],
        },
    )
    assert resp3.status_code == 422

