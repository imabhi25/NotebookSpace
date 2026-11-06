#!/usr/bin/env python3
"""
NotebookSpace Comprehensive Retrieval Evaluation Harness.
Evaluates the search_scoped retrieval pipeline across benchmark datasets:
- Synthetic corpus (35 questions: baseline, paraphrased, multi-page, conflicts, duplicates, absent facts, distractors)
- Real textbook corpus (OpenStax Introduction to Python Programming, Chapters 1-4)

Reports:
- Hit@1, Hit@3, Hit@5 hit rates (Hybrid vs Pure Vector Cosine without keyword boost)
- Mean Reciprocal Rank (MRR)
- Absent questions abstention accuracy
- Raw cosine similarity separation distribution
- Detailed rank-1 misses and top ranked passages
"""

import json
import os
import sys
import io
import hashlib
import argparse
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from unittest.mock import patch

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
from ingestion.embedder import embed_batch, embed_text

SYNTHETIC_QUESTIONS_FILE = PROJECT_ROOT / "evals" / "questions.json"
REAL_QUESTIONS_FILE = PROJECT_ROOT / "evals" / "questions_real.json"
SYNTHETIC_DOCS_DIR = PROJECT_ROOT / "docs" / "sample_docs"
REAL_DOCS_DIR = PROJECT_ROOT / "evals" / "corpus_real"

SUPPORT_MIN_SCORE = float(os.getenv("SUPPORT_MIN_SCORE", "0.20"))
EVAL_USER_EMAIL = "eval_benchmark_runner@example.com"
EVAL_SYNTHETIC_SUBJECT_NAME = "Evaluation Benchmark Course"
EVAL_REAL_SUBJECT_NAME = "Evaluation Benchmark Course (Real Corpus)"


def check_database_host() -> str:
    """Print the database host (never password) and ensure it is local."""
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable is not set!")
    parsed = urlparse(db_url)
    host = parsed.hostname or "localhost"
    print(f"[Database] Target host: '{host}' (port: {parsed.port}, database: {parsed.path})")
    if host not in ("localhost", "127.0.0.1", "::1"):
        raise RuntimeError(f"STOP: DATABASE_URL points to non-local host '{host}'. Halting.")
    return host


def cleanup_eval_artifacts(user_id: str | None = None, email: str = EVAL_USER_EMAIL):
    """Delete eval user, cascading deletion to all subjects, sources, chunks, and sessions."""
    with get_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                if user_id:
                    cur.execute("DELETE FROM users WHERE id = %s RETURNING id", (str(user_id),))
                else:
                    cur.execute("DELETE FROM users WHERE email = %s RETURNING id", (email,))
                deleted = cur.fetchall()
                print(f"[Cleanup] Deleted {len(deleted)} eval user(s) and cascaded subjects/sources/chunks.")


def setup_eval_corpus(corpus: str = "synthetic") -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], int]:
    """Ensure eval user, subject, and corpus documents are ingested."""
    check_database_host()

    user = get_user_by_email(EVAL_USER_EMAIL)
    if not user:
        user = create_user(
            email=EVAL_USER_EMAIL,
            password_hash="eval_dummy_hash",
        )

    if corpus == "real":
        subj_name = EVAL_REAL_SUBJECT_NAME
        course_code = "EVAL 201"
        docs_dir = REAL_DOCS_DIR
        subj_desc = "Subject for real textbook corpus evaluations."
    else:
        subj_name = EVAL_SYNTHETIC_SUBJECT_NAME
        course_code = "EVAL 101"
        docs_dir = SYNTHETIC_DOCS_DIR
        subj_desc = "Subject for automated retrieval evaluations."

    subjects = get_subjects_for_user(user_id=user["id"], include_archived=False)
    eval_subj = next((s for s in subjects if s["name"] == subj_name), None)
    if not eval_subj:
        eval_subj = create_subject(
            user_id=user["id"],
            name=subj_name,
            course_code=course_code,
            description=subj_desc,
        )

    existing_sources = get_sources_for_subject(user_id=user["id"], subject_id=eval_subj["id"])
    sources_by_file = {s["file_name"]: s for s in existing_sources if s["status"] == "ready"}

    pdf_files = sorted(docs_dir.glob("*.pdf")) if docs_dir.exists() else []
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

    # Count total chunks in this subject
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*)
                FROM chunks c
                JOIN sources s ON s.id = c.source_id
                WHERE s.subject_id = %s
            """, (eval_subj["id"],))
            total_chunks = cur.fetchone()[0]

    return user, eval_subj, ready_sources, total_chunks


def search_without_keyword_boost(
    question: str,
    user_id: str,
    subject_id: str,
    selected_source_ids: list[str],
    k: int = 5,
) -> list[dict[str, Any]]:
    """Run search_scoped with keyword extraction bypassed to evaluate pure vector cosine similarity."""
    with patch("db.notebook_store.extract_key_terms", return_value=[]):
        return search_scoped(
            question=question,
            user_id=user_id,
            subject_id=subject_id,
            selected_source_ids=selected_source_ids,
            k=k,
        )


def calculate_raw_cosine(question: str, chunk_id: str) -> float:
    """Calculate raw vector cosine similarity between query and chunk embedding."""
    q_emb = embed_text(question)
    q_vec_str = "[" + ",".join(f"{x:.6f}" for x in q_emb) + "]"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 1 - (embedding <=> %s::vector) AS cosine_sim
                FROM chunks
                WHERE id = %s
            """, (q_vec_str, chunk_id))
            row = cur.fetchone()
            return float(row[0]) if row else 0.0


def find_first_hit_rank(
    retrieved_chunks: list[dict[str, Any]],
    expected_targets: list[dict[str, Any]],
    max_k: int = 5,
) -> int | None:
    """Find 1-based rank of first retrieved chunk matching any expected target."""
    for rank_idx, chunk in enumerate(retrieved_chunks[:max_k], 1):
        for target in expected_targets:
            fn_match = chunk["file_name"] == target["file"]
            pg_match = chunk["page_number"] == target["page"]
            if fn_match and pg_match:
                return rank_idx
    return None


def run_evaluation(corpus: str = "synthetic", keep: bool = False):
    print("=" * 95)
    print(f" NOTEBOOKSPACE COMPREHENSIVE RETRIEVAL BENCHMARK [{corpus.upper()} CORPUS]")
    print("=" * 95)

    check_database_host()

    questions_file = REAL_QUESTIONS_FILE if corpus == "real" else SYNTHETIC_QUESTIONS_FILE
    if not questions_file.exists():
        raise FileNotFoundError(f"Questions file not found: {questions_file}")

    with open(questions_file, "r", encoding="utf-8") as f:
        questions = json.load(f)

    print(f"Loaded {len(questions)} evaluation questions from {questions_file.name}")
    user, subject, sources, total_chunks = setup_eval_corpus(corpus=corpus)
    source_ids = [s["id"] for s in sources]
    eval_conv = create_conversation(user["id"], subject["id"], f"Full Eval Run ({corpus})")
    print(f"Corpus initialized: {len(sources)} documents indexed ({total_chunks} total chunks).")
    print("-" * 95 + "\n")

    k = 5
    # Metrics containers
    hybrid_top1_hits = 0
    hybrid_top3_hits = 0
    hybrid_top5_hits = 0
    hybrid_rr_sum = 0.0

    noboost_top1_hits = 0
    noboost_top3_hits = 0
    noboost_top5_hits = 0
    noboost_rr_sum = 0.0

    total_answerable = 0
    total_absent = 0
    absent_abstained = 0

    answerable_raw_cosines = []
    absent_raw_cosines = []

    table_rows = []
    rank1_misses = []

    try:
        for q in questions:
            q_id = q["id"]
            q_cat = q.get("category", "general")
            q_text = q["question"]
            is_abs = q.get("is_absent", False)
            targets = q.get("expected_targets", [])

            # Retrieve Hybrid
            ret_hybrid = search_scoped(
                question=q_text,
                user_id=user["id"],
                subject_id=subject["id"],
                selected_source_ids=source_ids,
                k=k,
            )

            # Retrieve No Boost
            ret_noboost = search_without_keyword_boost(
                question=q_text,
                user_id=user["id"],
                subject_id=subject["id"],
                selected_source_ids=source_ids,
                k=k,
            )

            top_chunk_id = ret_hybrid[0]["id"] if ret_hybrid else None
            top_raw_cosine = calculate_raw_cosine(q_text, top_chunk_id) if top_chunk_id else 0.0
            top_final_score = ret_hybrid[0]["score"] if ret_hybrid else 0.0

            if is_abs:
                total_absent += 1
                absent_raw_cosines.append(top_raw_cosine)

                # Test abstention in real pipeline
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
                    absent_abstained += 1
                    status = f"PASS (Abstained: {reason})"
                else:
                    status = f"FAIL (Answered: {ans.get('content', '')[:16]})"

                target_repr = "ABSENT"
                table_rows.append({
                    "id": q_id,
                    "cat": q_cat,
                    "question": q_text[:34] + "...",
                    "target": target_repr,
                    "hyb_rank": "-",
                    "no_rank": "-",
                    "raw_cos": f"{top_raw_cosine:.3f}",
                    "final_score": f"{top_final_score:.3f}",
                    "status": status,
                })
            else:
                total_answerable += 1
                answerable_raw_cosines.append(top_raw_cosine)

                # Rank in Hybrid
                hyb_rank = find_first_hit_rank(ret_hybrid, targets, max_k=5)
                if hyb_rank == 1:
                    hybrid_top1_hits += 1
                    hybrid_top3_hits += 1
                    hybrid_top5_hits += 1
                    hybrid_rr_sum += 1.0
                elif hyb_rank in (2, 3):
                    hybrid_top3_hits += 1
                    hybrid_top5_hits += 1
                    hybrid_rr_sum += 1.0 / hyb_rank
                elif hyb_rank in (4, 5):
                    hybrid_top5_hits += 1
                    hybrid_rr_sum += 1.0 / hyb_rank

                # Rank in No-Boost
                no_rank = find_first_hit_rank(ret_noboost, targets, max_k=5)
                if no_rank == 1:
                    noboost_top1_hits += 1
                    noboost_top3_hits += 1
                    noboost_top5_hits += 1
                    noboost_rr_sum += 1.0
                elif no_rank in (2, 3):
                    noboost_top3_hits += 1
                    noboost_top5_hits += 1
                    noboost_rr_sum += 1.0 / no_rank
                elif no_rank in (4, 5):
                    noboost_top5_hits += 1
                    noboost_rr_sum += 1.0 / no_rank

                # Track rank-1 misses
                if hyb_rank != 1:
                    rank1_misses.append({
                        "id": q_id,
                        "question": q_text,
                        "targets": targets,
                        "hyb_rank": hyb_rank,
                        "no_rank": no_rank,
                        "top_chunk": {
                            "file": ret_hybrid[0]["file_name"] if ret_hybrid else None,
                            "page": ret_hybrid[0]["page_number"] if ret_hybrid else None,
                            "raw_cos": top_raw_cosine,
                            "final_score": top_final_score,
                        }
                    })

                t_strs = [f"{Path(t['file']).stem} p.{t['page']}" for t in targets]
                target_repr = ", ".join(t_strs)
                if len(target_repr) > 22:
                    target_repr = target_repr[:20] + ".."

                status = "PASS" if hyb_rank else "FAIL"

                table_rows.append({
                    "id": q_id,
                    "cat": q_cat,
                    "question": q_text[:34] + "...",
                    "target": target_repr,
                    "hyb_rank": f"#{hyb_rank}" if hyb_rank else "MISS",
                    "no_rank": f"#{no_rank}" if no_rank else "MISS",
                    "raw_cos": f"{top_raw_cosine:.3f}",
                    "final_score": f"{top_final_score:.3f}",
                    "status": status,
                })

        # Print Detailed Results Table
        fmt = "{:<9} {:<15} {:<37} {:<23} {:<9} {:<9} {:<8} {:<8} {:<25}"
        print("-" * 148)
        print(fmt.format("ID", "Category", "Question", "Expected Target", "Hyb Rank", "No-B Rank", "Raw Cos", "Final", "Status"))
        print("-" * 148)
        for r in table_rows:
            print(fmt.format(
                r["id"],
                r["cat"],
                r["question"],
                r["target"],
                r["hyb_rank"],
                r["no_rank"],
                r["raw_cos"],
                r["final_score"],
                r["status"],
            ))
        print("-" * 148)

        # Compute Summary Stats
        hyb_top1_pct = (hybrid_top1_hits / total_answerable) * 100 if total_answerable > 0 else 0.0
        hyb_top3_pct = (hybrid_top3_hits / total_answerable) * 100 if total_answerable > 0 else 0.0
        hyb_top5_pct = (hybrid_top5_hits / total_answerable) * 100 if total_answerable > 0 else 0.0
        hyb_mrr = (hybrid_rr_sum / total_answerable) if total_answerable > 0 else 0.0

        no_top1_pct = (noboost_top1_hits / total_answerable) * 100 if total_answerable > 0 else 0.0
        no_top3_pct = (noboost_top3_hits / total_answerable) * 100 if total_answerable > 0 else 0.0
        no_top5_pct = (noboost_top5_hits / total_answerable) * 100 if total_answerable > 0 else 0.0
        no_mrr = (noboost_rr_sum / total_answerable) if total_answerable > 0 else 0.0

        abs_abstain_pct = (absent_abstained / total_absent) * 100 if total_absent > 0 else 0.0
        top5_coverage_pct = (min(5, total_chunks) / total_chunks * 100.0) if total_chunks > 0 else 0.0

        print("\n" + "=" * 80)
        print(f" RETRIEVAL BENCHMARK PERFORMANCE METRICS [{corpus.upper()} CORPUS]")
        print("=" * 80)
        print(f"Total Chunks in Corpus           : {total_chunks}")
        print(f"Top-5 Coverage of Corpus         : {min(5, total_chunks)}/{total_chunks} ({top5_coverage_pct:.1f}%)")
        print(f"Total Questions Evaluated       : {len(questions)}")
        print(f"Answerable Target Questions     : {total_answerable}")
        print(f"Absent-Fact (Abstain) Questions : {total_absent}")
        print("-" * 80)
        print(f"{'Metric':<32} | {'Hybrid (Vector + Boost)':<24} | {'No Keyword Boost':<20}")
        print("-" * 80)
        print(f"{'Top-1 Hit Rate':<32} | {hybrid_top1_hits:>2}/{total_answerable:<2} ({hyb_top1_pct:>5.1f}%)          | {noboost_top1_hits:>2}/{total_answerable:<2} ({no_top1_pct:>5.1f}%)")
        print(f"{'Top-3 Hit Rate':<32} | {hybrid_top3_hits:>2}/{total_answerable:<2} ({hyb_top3_pct:>5.1f}%)          | {noboost_top3_hits:>2}/{total_answerable:<2} ({no_top3_pct:>5.1f}%)")
        print(f"{'Top-5 Hit Rate':<32} | {hybrid_top5_hits:>2}/{total_answerable:<2} ({hyb_top5_pct:>5.1f}%)          | {noboost_top5_hits:>2}/{total_answerable:<2} ({no_top5_pct:>5.1f}%)")
        print(f"{'Mean Reciprocal Rank (MRR)':<32} | {hyb_mrr:>6.3f}                   | {no_mrr:>6.3f}")
        print("-" * 80)
        print(f"Absent Questions Abstain Rate   : {absent_abstained}/{total_absent} ({abs_abstain_pct:.1f}%)")
        print("=" * 80)

        # Print Rank 1 Misses
        print("\n" + "=" * 80)
        print(f" RANK-1 MISSES (Target Not at Rank #1: {len(rank1_misses)}/{total_answerable})")
        print("=" * 80)
        if not rank1_misses:
            print("None! All answerable questions ranked target at #1.")
        else:
            for m in rank1_misses:
                t_str = ", ".join(f"{t['file']} p.{t['page']}" for t in m['targets'])
                tc = m['top_chunk']
                top_str = f"{tc['file']} p.{tc['page']} (raw_cos: {tc['raw_cos']:.3f}, final: {tc['final_score']:.3f})"
                hyb_str = f"#{m['hyb_rank']}" if m['hyb_rank'] else "MISS"
                no_str = f"#{m['no_rank']}" if m['no_rank'] else "MISS"
                print(f"- Question {m['id']}: {m['question']}")
                print(f"  Expected Target : {t_str}")
                print(f"  Hybrid Rank     : {hyb_str}  |  No-Boost Rank: {no_str}")
                print(f"  Rank 1 Passage  : {top_str}\n")

        # Cosine Separation Analysis
        print("=" * 80)
        print(" RAW COSINE SIMILARITY SEPARATION ANALYSIS")
        print("=" * 80)
        ans_min = min(answerable_raw_cosines) if answerable_raw_cosines else 0.0
        ans_max = max(answerable_raw_cosines) if answerable_raw_cosines else 0.0
        ans_avg = sum(answerable_raw_cosines) / len(answerable_raw_cosines) if answerable_raw_cosines else 0.0
        abs_min = min(absent_raw_cosines) if absent_raw_cosines else 0.0
        abs_max = max(absent_raw_cosines) if absent_raw_cosines else 0.0
        abs_avg = sum(absent_raw_cosines) / len(absent_raw_cosines) if absent_raw_cosines else 0.0

        print(f"Answerable Questions (N={len(answerable_raw_cosines)}):")
        print(f"  Min: {ans_min:.4f}  |  Mean: {ans_avg:.4f}  |  Max: {ans_max:.4f}")
        print(f"Absent Questions (N={len(absent_raw_cosines)}):")
        print(f"  Min: {abs_min:.4f}  |  Mean: {abs_avg:.4f}  |  Max: {abs_max:.4f}")
        print("-" * 80)
        print("Empirical Observation:")
        print(f"  - Absent questions top chunk raw cosine spans [{abs_min:.3f}, {abs_max:.3f}] (mean {abs_avg:.3f})")
        print(f"  - Answerable questions top chunk raw cosine spans [{ans_min:.3f}, {ans_max:.3f}] (mean {ans_avg:.3f})")
        gap = ans_avg - abs_avg
        print(f"  - Separation Mean Gap: {gap:.4f}")
        print("=" * 80 + "\n")

    finally:
        if not keep:
            print("[Cleanup] Cleaning up eval database records...")
            cleanup_eval_artifacts(user["id"] if user else None)
        else:
            print("[Database] Keeping eval user, subject, and chunks in database (--keep).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NotebookSpace Retrieval Evaluation Benchmark Harness")
    parser.add_argument(
        "--corpus",
        choices=["synthetic", "real"],
        default="synthetic",
        help="Corpus to evaluate: 'synthetic' (default) or 'real' (evals/corpus_real)",
    )
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Keep eval user, subject, and chunks in the database for debugging (default: delete on completion)",
    )
    args = parser.parse_args()
    run_evaluation(corpus=args.corpus, keep=args.keep)
