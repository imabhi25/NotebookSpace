#!/usr/bin/env python3
"""
Retrieval Evaluation Harness for NotebookSpace.
Evaluates the search_scoped retrieval pipeline across a curated test set:
- Top-k retrieval hit rate with hybrid ranking (vector similarity + keyword boost)
- Top-k retrieval hit rate with keyword boost disabled (pure vector similarity)
- Abstain accuracy on absent-fact questions (top_score < support_min_score -> NOT_FOUND)
"""

import json
import os
import sys
import io
import hashlib
from pathlib import Path
from typing import Any

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from db.connection import get_connection
from db.notebook_store import (
    create_user,
    get_user_by_email,
    create_subject,
    get_subjects_for_user,
    create_source,
    get_sources_for_subject,
    store_source_chunks,
    update_source_status,
    search_scoped,
    create_conversation,
)
from answering.notebook_answer import answer_notebook_question
from ingestion.parsers import parse_pdf_source
from ingestion.chunker import chunk_pages
from ingestion.embedder import embed_batch

QUESTIONS_FILE = PROJECT_ROOT / "evals" / "questions.json"
SAMPLE_DOCS_DIR = PROJECT_ROOT / "docs" / "sample_docs"

SUPPORT_MIN_SCORE = float(os.getenv("SUPPORT_MIN_SCORE", "0.20"))
EVAL_USER_EMAIL = "eval_benchmark_runner@example.com"
EVAL_SUBJECT_NAME = "Evaluation Benchmark Course"


def setup_eval_corpus() -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    """Ensure eval user, subject, and sample course documents are ingested."""
    user = get_user_by_email(EVAL_USER_EMAIL)
    if not user:
        user = create_user(
            email=EVAL_USER_EMAIL,
            password_hash="eval_dummy_hash",
        )

    subjects = get_subjects_for_user(user_id=user["id"], include_archived=False)
    eval_subj = next((s for s in subjects if s["name"] == EVAL_SUBJECT_NAME), None)
    if not eval_subj:
        eval_subj = create_subject(
            user_id=user["id"],
            name=EVAL_SUBJECT_NAME,
            course_code="EVAL 101",
            description="Subject for automated retrieval evaluations.",
        )

    # Ingest PDFs from sample_docs into this subject if not already ready
    existing_sources = get_sources_for_subject(user_id=user["id"], subject_id=eval_subj["id"])
    sources_by_file = {s["file_name"]: s for s in existing_sources if s["status"] == "ready"}

    pdf_files = sorted(SAMPLE_DOCS_DIR.glob("*.pdf"))
    for pdf_path in pdf_files:
        fn = pdf_path.name
        if fn in sources_by_file:
            continue

        content = pdf_path.read_bytes()
        file_hash = hashlib.sha256(content).hexdigest()
        stream = io.BytesIO(content)
        pages = parse_pdf_source(source=stream, file_name=fn)

        src = create_source(
            user_id=user["id"],
            subject_id=eval_subj["id"],
            title=fn,
            file_name=fn,
            source_type="pdf",
            file_hash=file_hash,
            status="processing",
        )

        chunks = chunk_pages(pages)
        embeddings = embed_batch([c.text for c in chunks])
        store_source_chunks(
            user_id=user["id"],
            subject_id=eval_subj["id"],
            source_id=src["id"],
            source_version=1,
            chunks=chunks,
            embeddings=embeddings,
        )
        total_words = sum(c.word_count for c in chunks)
        full_content = "\n\n".join(f"--- Page {p[1]} ---\n{p[2]}" for p in pages)
        update_source_status(
            source_id=src["id"],
            status="ready",
            page_count=len(pages),
            word_count=total_words,
            raw_content=full_content,
            version=1,
        )

    ready_sources = get_sources_for_subject(user_id=user["id"], subject_id=eval_subj["id"])
    ready_sources = [s for s in ready_sources if s["status"] == "ready"]
    return user, eval_subj, ready_sources


def search_without_keyword_boost(
    question: str,
    user_id: str,
    subject_id: str,
    selected_source_ids: list[str],
    k: int = 5,
) -> list[dict[str, Any]]:
    """Run search_scoped but evaluate ranking using raw similarity_score without keyword boost."""
    # We can retrieve candidates and rank purely by unboosted similarity_score
    from unittest.mock import patch

    # Mock extract_key_terms to return [] so no keyword search or boost is performed
    with patch("db.notebook_store.extract_key_terms", return_value=[]):
        return search_scoped(
            question=question,
            user_id=user_id,
            subject_id=subject_id,
            selected_source_ids=selected_source_ids,
            k=k,
        )


def run_evaluation():
    print("=" * 80)
    print(" NOTEBOOKSPACE RETRIEVAL EVALUATION HARNESS")
    print("=" * 80)

    if not QUESTIONS_FILE.is_file():
        print(f"Error: Questions file not found at {QUESTIONS_FILE}", file=sys.stderr)
        sys.exit(1)

    with open(QUESTIONS_FILE, "r", encoding="utf-8") as f:
        questions = json.load(f)

    print(f"Loaded {len(questions)} evaluation questions from {QUESTIONS_FILE.name}")
    print("Setting up evaluation course corpus...")
    user, subject, sources = setup_eval_corpus()
    source_ids = [s["id"] for s in sources]
    print(f"Evaluation corpus ready: {len(sources)} sources indexed.\n")

    eval_conv = create_conversation(user["id"], subject["id"], "Retrieval Eval Session")
    k = 5
    hybrid_hits = 0
    no_boost_hits = 0
    total_factual = 0

    abstain_correct = 0
    total_absent = 0

    results_table = []

    for q in questions:
        q_id = q["id"]
        q_text = q["question"]
        is_absent = q.get("is_absent", False)
        exp_source = q.get("expected_source")
        exp_page = q.get("expected_page")

        # 1. Hybrid search (vector + keyword boost)
        retrieved_hybrid = search_scoped(
            question=q_text,
            user_id=user["id"],
            subject_id=subject["id"],
            selected_source_ids=source_ids,
            k=k,
        )

        # 2. Vector-only search (keyword boost disabled)
        retrieved_no_boost = search_without_keyword_boost(
            question=q_text,
            user_id=user["id"],
            subject_id=subject["id"],
            selected_source_ids=source_ids,
            k=k,
        )

        top_score_hybrid = (
            max((r["score"] for r in retrieved_hybrid), default=0.0)
            if retrieved_hybrid
            else 0.0
        )

        if is_absent:
            total_absent += 1
            # Run through real answering pipeline to verify proper abstention
            ans = answer_notebook_question(
                question=q_text,
                conversation_id=eval_conv["id"],
                user_id=user["id"],
                subject_id=subject["id"],
                selected_source_ids=source_ids,
            )
            abstained = bool(ans.get("abstained", False))
            reason = ans.get("abstain_reason") or "not_found"
            if abstained:
                abstain_correct += 1
                status = f"PASS (Abstained: {reason})"
            else:
                status = f"FAIL (Answered: {ans.get('content', '')[:18]})"

            results_table.append({
                "id": q_id,
                "question": q_text[:38] + "...",
                "expected": "ABSENT (Abstain)",
                "hybrid_hit": "N/A",
                "no_boost_hit": "N/A",
                "top_score": f"{top_score_hybrid:.3f}",
                "status": status,
            })
        else:
            total_factual += 1

            # Check hit in hybrid
            hybrid_hit = any(
                r.get("file_name") == exp_source and r.get("page_number") == exp_page
                for r in retrieved_hybrid
            )
            if hybrid_hit:
                hybrid_hits += 1

            # Check hit in no_boost
            no_boost_hit = any(
                r.get("file_name") == exp_source and r.get("page_number") == exp_page
                for r in retrieved_no_boost
            )
            if no_boost_hit:
                no_boost_hits += 1

            status = "PASS" if hybrid_hit else "FAIL"

            results_table.append({
                "id": q_id,
                "question": q_text[:38] + "...",
                "expected": f"{exp_source} p.{exp_page}",
                "hybrid_hit": "YES" if hybrid_hit else "NO",
                "no_boost_hit": "YES" if no_boost_hit else "NO",
                "top_score": f"{top_score_hybrid:.3f}",
                "status": status,
            })

    # Print Results Table
    header_fmt = "{:<5} {:<42} {:<24} {:<10} {:<12} {:<10} {:<28}"
    row_fmt = "{:<5} {:<42} {:<24} {:<10} {:<12} {:<10} {:<28}"

    print("-" * 135)
    print(header_fmt.format("ID", "Question", "Expected Target", "Hybrid Hit", "No-Boost Hit", "Top Score", "Status"))
    print("-" * 135)
    for r in results_table:
        print(row_fmt.format(
            r["id"],
            r["question"],
            r["expected"],
            r["hybrid_hit"],
            r["no_boost_hit"],
            r["top_score"],
            r["status"],
        ))
    print("-" * 135)

    # Print Summary Metrics
    hybrid_rate = (hybrid_hits / total_factual) * 100 if total_factual else 0.0
    no_boost_rate = (no_boost_hits / total_factual) * 100 if total_factual else 0.0
    abstain_rate = (abstain_correct / total_absent) * 100 if total_absent else 0.0

    print("\n" + "=" * 80)
    print(" EVALUATION SUMMARY RESULTS")
    print("=" * 80)
    print(f"Total Questions Evaluated       : {len(questions)}")
    print(f"Factual Target Questions        : {total_factual}")
    print(f"Absent-Fact (Abstain) Questions : {total_absent}")
    print("-" * 80)
    print(f"Top-{k} Hit Rate (Hybrid Ranking)        : {hybrid_hits}/{total_factual} ({hybrid_rate:.1f}%)")
    print(f"Top-{k} Hit Rate (Keyword Boost Disabled): {no_boost_hits}/{total_factual} ({no_boost_rate:.1f}%)")
    print(f"Absent-Fact Abstain Accuracy             : {abstain_correct}/{total_absent} ({abstain_rate:.1f}%)")
    print("=" * 80)

    # Check passing thresholds
    assert hybrid_rate >= 80.0, f"Hybrid hit rate {hybrid_rate:.1f}% below 80% threshold"
    assert abstain_rate >= 75.0, f"Abstain accuracy {abstain_rate:.1f}% below 75% threshold"
    print("\nRetrieval Evaluation: ALL CHECKS PASSED SUCCESSFULLY.")


if __name__ == "__main__":
    run_evaluation()
