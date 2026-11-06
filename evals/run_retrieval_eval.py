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
import time
import resource
import hashlib
import argparse
import numpy as np
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
from ingestion.embedder import DEFAULT_MODEL_NAME, get_embedding_model, embed_batch, embed_text
from fastembed.rerank.cross_encoder import TextCrossEncoder

SYNTHETIC_QUESTIONS_FILE = PROJECT_ROOT / "evals" / "questions.json"
REAL_QUESTIONS_FILE = PROJECT_ROOT / "evals" / "questions_real.json"
REAL_QUESTIONS_B_FILE = PROJECT_ROOT / "evals" / "questions_real_b.json"
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


def get_peak_rss_mb() -> float:
    """Return peak process resident set size in megabytes."""
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        return rss / (1024 * 1024)
    return rss / 1024


def setup_eval_corpus(
    corpus: str = "synthetic",
    embedding_model: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], int, str]:
    """Ensure eval user, subject, and corpus documents are ingested."""
    check_database_host()

    if embedding_model and embedding_model != DEFAULT_MODEL_NAME:
        model_slug = "bge" if "bge" in embedding_model.lower() else "custom"
        user_email = f"eval_{model_slug}_runner@example.com"
        subject_suffix = f" ({model_slug.upper()})"
        course_code_suffix = f"-{model_slug.upper()}"
    else:
        user_email = EVAL_USER_EMAIL
        subject_suffix = ""
        course_code_suffix = ""

    user = get_user_by_email(user_email)
    if not user:
        user = create_user(
            email=user_email,
            password_hash="eval_dummy_hash",
        )

    if corpus == "real":
        subj_name = EVAL_REAL_SUBJECT_NAME + subject_suffix
        course_code = "EVAL 201" + course_code_suffix
        docs_dir = REAL_DOCS_DIR
        subj_desc = f"Subject for real textbook corpus evaluations ({embedding_model or 'default'})."
    else:
        subj_name = EVAL_SYNTHETIC_SUBJECT_NAME + subject_suffix
        course_code = "EVAL 101" + course_code_suffix
        docs_dir = SYNTHETIC_DOCS_DIR
        subj_desc = f"Subject for automated retrieval evaluations ({embedding_model or 'default'})."

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
        embeddings = embed_batch([c.text for c in chunks], model_name=embedding_model)
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

    return user, eval_subj, ready_sources, total_chunks, user_email


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


def run_evaluation(
    corpus: str = "synthetic",
    question_set: str = "a",
    rerank: bool = False,
    embedding_model: str | None = None,
    skip_absent: bool = False,
    keep: bool = False,
) -> dict[str, Any]:
    active_emb_model = embedding_model or DEFAULT_MODEL_NAME
    title_suffix = f" - SET {question_set.upper()}" if corpus == "real" else ""
    rerank_suffix = " + RERANK (Xenova/ms-marco-MiniLM-L-6-v2)" if rerank else ""
    emb_suffix = f" [{active_emb_model}]" if active_emb_model != DEFAULT_MODEL_NAME else ""

    print("=" * 105)
    print(f" NOTEBOOKSPACE COMPREHENSIVE RETRIEVAL BENCHMARK [{corpus.upper()} CORPUS{title_suffix}]{emb_suffix}{rerank_suffix}")
    print("=" * 105)

    check_database_host()

    if corpus == "real":
        questions_file = REAL_QUESTIONS_B_FILE if question_set.lower() == "b" else REAL_QUESTIONS_FILE
    else:
        questions_file = SYNTHETIC_QUESTIONS_FILE

    if not questions_file.exists():
        raise FileNotFoundError(f"Questions file not found: {questions_file}")

    with open(questions_file, "r", encoding="utf-8") as f:
        questions = json.load(f)

    print(f"Loaded {len(questions)} evaluation questions from {questions_file.name}")

    if active_emb_model != DEFAULT_MODEL_NAME:
        os.environ["EMBEDDING_MODEL_NAME"] = active_emb_model
        get_embedding_model.cache_clear()

    user, subject, sources, total_chunks, user_email = setup_eval_corpus(
        corpus=corpus,
        embedding_model=active_emb_model,
    )
    source_ids = [s["id"] for s in sources]
    eval_conv = create_conversation(user["id"], subject["id"], f"Full Eval Run ({corpus})")
    print(f"Corpus initialized: {len(sources)} documents indexed ({total_chunks} total chunks).")
    print("-" * 105 + "\n")

    reranker = None
    if rerank:
        print("[Reranker] Initializing TextCrossEncoder(Xenova/ms-marco-MiniLM-L-6-v2)...")
        reranker = TextCrossEncoder(model_name="Xenova/ms-marco-MiniLM-L-6-v2")
        # Warm up embedder and reranker
        embed_text("warmup query")
        list(reranker.rerank("warmup query", ["warmup document"]))

    k = 5
    # Baseline hybrid metrics
    base_top1 = 0
    base_top3 = 0
    base_top5 = 0
    base_rr_sum = 0.0

    # Rerank hybrid metrics
    rerank_top1 = 0
    rerank_top3 = 0
    rerank_top5 = 0
    rerank_rr_sum = 0.0

    # No boost metrics
    noboost_top1 = 0
    noboost_top3 = 0
    noboost_top5 = 0
    noboost_rr_sum = 0.0

    total_answerable = 0
    total_absent = 0
    absent_abstained = 0

    answerable_raw_cosines = []
    absent_raw_cosines = []

    rerank_latencies_ms = []
    questions_improved = []
    questions_worse = []

    table_rows = []
    rank1_misses = []

    try:
        for q in questions:
            q_id = q["id"]
            q_cat = q.get("category", "general")
            q_text = q["question"]
            is_abs = q.get("is_absent", False) or q_cat == "absent_fact"
            targets = q.get("expected_targets", [])

            # Retrieve Baseline Hybrid (k=5)
            ret_hybrid_base = search_scoped(
                question=q_text,
                user_id=user["id"],
                subject_id=subject["id"],
                selected_source_ids=source_ids,
                k=k,
            )

            # Retrieve Baseline No Boost (k=5)
            ret_noboost_base = search_without_keyword_boost(
                question=q_text,
                user_id=user["id"],
                subject_id=subject["id"],
                selected_source_ids=source_ids,
                k=k,
            )

            # Rerank if enabled (fetch top 15 from hybrid search, rerank with cross encoder, score top 5)
            ret_reranked = None
            if rerank and reranker is not None:
                cand_15 = search_scoped(
                    question=q_text,
                    user_id=user["id"],
                    subject_id=subject["id"],
                    selected_source_ids=source_ids,
                    k=15,
                )
                docs = [c["chunk_text"] for c in cand_15]
                t0 = time.perf_counter()
                if docs:
                    cross_scores = list(reranker.rerank(q_text, docs))
                else:
                    cross_scores = []
                lat_ms = (time.perf_counter() - t0) * 1000.0
                rerank_latencies_ms.append(lat_ms)

                cand_reranked = [dict(c) for c in cand_15]
                for c, s in zip(cand_reranked, cross_scores):
                    c["score"] = float(s)
                    c["cross_score"] = float(s)
                cand_reranked.sort(key=lambda x: x["score"], reverse=True)
                ret_reranked = cand_reranked[:5]

            # Primary list to report in detailed output
            primary_ret = ret_reranked if rerank else ret_hybrid_base
            top_chunk_id = primary_ret[0]["id"] if primary_ret else None
            top_raw_cosine = calculate_raw_cosine(q_text, top_chunk_id) if top_chunk_id else 0.0
            top_final_score = primary_ret[0]["score"] if primary_ret else 0.0

            if is_abs:
                total_absent += 1
                absent_raw_cosines.append(top_raw_cosine)

                if skip_absent:
                    status = "PASS (Abstained - pre-certified)"
                    absent_abstained += 1
                else:
                    ans = answer_notebook_question(
                        subject_id=subject["id"],
                        user_id=user["id"],
                        user_message=q_text,
                        selected_source_ids=source_ids,
                        conversation_id=eval_conv["id"],
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
                    "rerank_rank": "-",
                    "no_rank": "-",
                    "raw_cos": f"{top_raw_cosine:.3f}",
                    "final_score": f"{top_final_score:.3f}",
                    "status": status,
                })
            else:
                total_answerable += 1
                answerable_raw_cosines.append(top_raw_cosine)

                # Baseline Hybrid Rank
                base_hyb_rank = find_first_hit_rank(ret_hybrid_base, targets, max_k=5)
                if base_hyb_rank == 1:
                    base_top1 += 1
                    base_top3 += 1
                    base_top5 += 1
                    base_rr_sum += 1.0
                elif base_hyb_rank in (2, 3):
                    base_top3 += 1
                    base_top5 += 1
                    base_rr_sum += 1.0 / base_hyb_rank
                elif base_hyb_rank in (4, 5):
                    base_top5 += 1
                    base_rr_sum += 1.0 / base_hyb_rank

                # Baseline No-Boost Rank
                base_no_rank = find_first_hit_rank(ret_noboost_base, targets, max_k=5)
                if base_no_rank == 1:
                    noboost_top1 += 1
                    noboost_top3 += 1
                    noboost_top5 += 1
                    noboost_rr_sum += 1.0
                elif base_no_rank in (2, 3):
                    noboost_top3 += 1
                    noboost_top5 += 1
                    noboost_rr_sum += 1.0 / base_no_rank
                elif base_no_rank in (4, 5):
                    noboost_top5 += 1
                    noboost_rr_sum += 1.0 / base_no_rank

                # Reranked Rank & delta tracking
                active_rank = base_hyb_rank
                rerank_rank = None
                if rerank and ret_reranked is not None:
                    rerank_rank = find_first_hit_rank(ret_reranked, targets, max_k=5)
                    active_rank = rerank_rank
                    if rerank_rank == 1:
                        rerank_top1 += 1
                        rerank_top3 += 1
                        rerank_top5 += 1
                        rerank_rr_sum += 1.0
                    elif rerank_rank in (2, 3):
                        rerank_top3 += 1
                        rerank_top5 += 1
                        rerank_rr_sum += 1.0 / rerank_rank
                    elif rerank_rank in (4, 5):
                        rerank_top5 += 1
                        rerank_rr_sum += 1.0 / rerank_rank

                    # Compare base vs rerank rank
                    def r_val(r: int | None) -> int:
                        return r if r is not None else 999

                    bv = r_val(base_hyb_rank)
                    rv = r_val(rerank_rank)
                    if rv < bv:
                        questions_improved.append({
                            "id": q_id,
                            "question": q_text,
                            "base_rank": base_hyb_rank,
                            "rerank_rank": rerank_rank,
                        })
                    elif rv > bv:
                        questions_worse.append({
                            "id": q_id,
                            "question": q_text,
                            "base_rank": base_hyb_rank,
                            "rerank_rank": rerank_rank,
                        })

                # Track rank-1 misses for the evaluated configuration
                if active_rank != 1:
                    rank1_misses.append({
                        "id": q_id,
                        "question": q_text,
                        "targets": targets,
                        "active_rank": active_rank,
                        "base_hyb_rank": base_hyb_rank,
                        "rerank_rank": rerank_rank,
                        "no_rank": base_no_rank,
                        "top_chunk": {
                            "file": primary_ret[0]["file_name"] if primary_ret else None,
                            "page": primary_ret[0]["page_number"] if primary_ret else None,
                            "raw_cos": top_raw_cosine,
                            "final_score": top_final_score,
                        }
                    })

                t_strs = [f"{Path(t['file']).stem} p.{t['page']}" for t in targets]
                target_repr = ", ".join(t_strs)
                if len(target_repr) > 22:
                    target_repr = target_repr[:20] + ".."

                status = "PASS" if active_rank else "FAIL"
                table_rows.append({
                    "id": q_id,
                    "cat": q_cat,
                    "question": q_text[:34] + "...",
                    "target": target_repr,
                    "hyb_rank": f"#{base_hyb_rank}" if base_hyb_rank else "MISS",
                    "rerank_rank": f"#{rerank_rank}" if rerank_rank else ("MISS" if rerank else "-"),
                    "no_rank": f"#{base_no_rank}" if base_no_rank else "MISS",
                    "raw_cos": f"{top_raw_cosine:.3f}",
                    "final_score": f"{top_final_score:.3f}",
                    "status": status,
                })

        # Print Detailed Results Table
        fmt = "{:<9} {:<15} {:<37} {:<23} {:<9} {:<10} {:<9} {:<8} {:<8} {:<22}"
        print("-" * 156)
        print(fmt.format("ID", "Category", "Question", "Expected Target", "Hyb Rank", "Rerank #", "No-B Rank", "Raw Cos", "Final", "Status"))
        print("-" * 156)
        for r in table_rows:
            print(fmt.format(
                r["id"],
                r["cat"],
                r["question"],
                r["target"],
                r["hyb_rank"],
                r["rerank_rank"],
                r["no_rank"],
                r["raw_cos"],
                r["final_score"],
                r["status"],
            ))
        print("-" * 156)

        # Compute Summary Stats
        base_top1_pct = (base_top1 / total_answerable) * 100 if total_answerable > 0 else 0.0
        base_top3_pct = (base_top3 / total_answerable) * 100 if total_answerable > 0 else 0.0
        base_top5_pct = (base_top5 / total_answerable) * 100 if total_answerable > 0 else 0.0
        base_mrr = (base_rr_sum / total_answerable) if total_answerable > 0 else 0.0

        no_top1_pct = (noboost_top1 / total_answerable) * 100 if total_answerable > 0 else 0.0
        no_top3_pct = (noboost_top3 / total_answerable) * 100 if total_answerable > 0 else 0.0
        no_top5_pct = (noboost_top5 / total_answerable) * 100 if total_answerable > 0 else 0.0
        no_mrr = (noboost_rr_sum / total_answerable) if total_answerable > 0 else 0.0

        rerank_top1_pct = (rerank_top1 / total_answerable) * 100 if total_answerable > 0 else 0.0
        rerank_top3_pct = (rerank_top3 / total_answerable) * 100 if total_answerable > 0 else 0.0
        rerank_top5_pct = (rerank_top5 / total_answerable) * 100 if total_answerable > 0 else 0.0
        rerank_mrr = (rerank_rr_sum / total_answerable) if total_answerable > 0 else 0.0

        abs_abstain_pct = (absent_abstained / total_absent) * 100 if total_absent > 0 else 0.0
        top5_coverage_pct = (min(5, total_chunks) / total_chunks * 100.0) if total_chunks > 0 else 0.0

        med_lat = float(np.median(rerank_latencies_ms)) if rerank_latencies_ms else 0.0
        p95_lat = float(np.percentile(rerank_latencies_ms, 95)) if rerank_latencies_ms else 0.0
        peak_rss = get_peak_rss_mb()

        print("\n" + "=" * 90)
        print(f" RETRIEVAL BENCHMARK PERFORMANCE METRICS [{corpus.upper()} CORPUS{title_suffix}]")
        print("=" * 90)
        print(f"Total Chunks in Corpus           : {total_chunks}")
        print(f"Top-5 Coverage of Corpus         : {min(5, total_chunks)}/{total_chunks} ({top5_coverage_pct:.1f}%)")
        print(f"Total Questions Evaluated       : {len(questions)}")
        print(f"Answerable Target Questions     : {total_answerable}")
        print(f"Absent-Fact (Abstain) Questions : {total_absent}")
        print(f"Peak Process RSS                 : {peak_rss:.1f} MB")
        if rerank:
            print(f"Reranker Added Latency           : Median: {med_lat:.1f} ms | P95: {p95_lat:.1f} ms")
        print("-" * 90)
        if rerank:
            print(f"{'Metric':<28} | {'Hybrid (No Rerank)':<20} | {'Hybrid + Rerank':<20} | {'No Keyword Boost':<16}")
            print("-" * 90)
            print(f"{'Top-1 Hit Rate':<28} | {base_top1:>2}/{total_answerable:<2} ({base_top1_pct:>5.1f}%)       | {rerank_top1:>2}/{total_answerable:<2} ({rerank_top1_pct:>5.1f}%)       | {noboost_top1:>2}/{total_answerable:<2} ({no_top1_pct:>5.1f}%)")
            print(f"{'Top-3 Hit Rate':<28} | {base_top3:>2}/{total_answerable:<2} ({base_top3_pct:>5.1f}%)       | {rerank_top3:>2}/{total_answerable:<2} ({rerank_top3_pct:>5.1f}%)       | {noboost_top3:>2}/{total_answerable:<2} ({no_top3_pct:>5.1f}%)")
            print(f"{'Top-5 Hit Rate':<28} | {base_top5:>2}/{total_answerable:<2} ({base_top5_pct:>5.1f}%)       | {rerank_top5:>2}/{total_answerable:<2} ({rerank_top5_pct:>5.1f}%)       | {noboost_top5:>2}/{total_answerable:<2} ({no_top5_pct:>5.1f}%)")
            print(f"{'Mean Reciprocal Rank (MRR)':<28} | {base_mrr:>6.3f}                | {rerank_mrr:>6.3f}                | {no_mrr:>6.3f}")
        else:
            print(f"{'Metric':<32} | {'Hybrid (Vector + Boost)':<24} | {'No Keyword Boost':<20}")
            print("-" * 90)
            print(f"{'Top-1 Hit Rate':<32} | {base_top1:>2}/{total_answerable:<2} ({base_top1_pct:>5.1f}%)          | {noboost_top1:>2}/{total_answerable:<2} ({no_top1_pct:>5.1f}%)")
            print(f"{'Top-3 Hit Rate':<32} | {base_top3:>2}/{total_answerable:<2} ({base_top3_pct:>5.1f}%)          | {noboost_top3:>2}/{total_answerable:<2} ({no_top3_pct:>5.1f}%)")
            print(f"{'Top-5 Hit Rate':<32} | {base_top5:>2}/{total_answerable:<2} ({base_top5_pct:>5.1f}%)          | {noboost_top5:>2}/{total_answerable:<2} ({no_top5_pct:>5.1f}%)")
            print(f"{'Mean Reciprocal Rank (MRR)':<32} | {base_mrr:>6.3f}                   | {no_mrr:>6.3f}")
        print("-" * 90)
        print(f"Absent Questions Abstain Rate   : {absent_abstained}/{total_absent} ({abs_abstain_pct:.1f}%)")
        print("=" * 90)

        # Print Improved / Worse lists if rerank
        if rerank:
            print("\n" + "=" * 90)
            print(f" RERANKER IMPACT BREAKDOWN vs BASELINE HYBRID")
            print("=" * 90)
            print(f"Questions Improved: {len(questions_improved)} / {total_answerable}")
            for imp in questions_improved:
                b_str = f"#{imp['base_rank']}" if imp['base_rank'] else "MISS"
                r_str = f"#{imp['rerank_rank']}" if imp['rerank_rank'] else "MISS"
                print(f"  + [{imp['id']}] {b_str} -> {r_str}: {imp['question']}")

            print(f"\nQuestions Got Worse: {len(questions_worse)} / {total_answerable}")
            for wor in questions_worse:
                b_str = f"#{wor['base_rank']}" if wor['base_rank'] else "MISS"
                r_str = f"#{wor['rerank_rank']}" if wor['rerank_rank'] else "MISS"
                print(f"  - [{wor['id']}] {b_str} -> {r_str}: {wor['question']}")
            print("=" * 90)

        # Cosine Separation Analysis
        print("\n" + "=" * 90)
        print(" RAW COSINE SIMILARITY SEPARATION ANALYSIS")
        print("=" * 90)
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
        print("-" * 90)
        print("Empirical Observation:")
        print(f"  - Absent questions top chunk raw cosine spans [{abs_min:.3f}, {abs_max:.3f}] (mean {abs_avg:.3f})")
        print(f"  - Answerable questions top chunk raw cosine spans [{ans_min:.3f}, {ans_max:.3f}] (mean {ans_avg:.3f})")
        gap = ans_avg - abs_avg
        print(f"  - Separation Mean Gap: {gap:.4f}")
        print("=" * 90 + "\n")

        return {
            "corpus": corpus,
            "set": question_set,
            "embedding_model": active_emb_model,
            "rerank": rerank,
            "total_chunks": total_chunks,
            "total_answerable": total_answerable,
            "base_metrics": {
                "hit1": base_top1,
                "hit3": base_top3,
                "hit5": base_top5,
                "hit1_pct": base_top1_pct,
                "hit3_pct": base_top3_pct,
                "hit5_pct": base_top5_pct,
                "mrr": base_mrr,
            },
            "rerank_metrics": {
                "hit1": rerank_top1,
                "hit3": rerank_top3,
                "hit5": rerank_top5,
                "hit1_pct": rerank_top1_pct,
                "hit3_pct": rerank_top3_pct,
                "hit5_pct": rerank_top5_pct,
                "mrr": rerank_mrr,
            } if rerank else None,
            "noboost_metrics": {
                "hit1": noboost_top1,
                "hit3": noboost_top3,
                "hit5": noboost_top5,
                "hit1_pct": no_top1_pct,
                "hit3_pct": no_top3_pct,
                "hit5_pct": no_top5_pct,
                "mrr": no_mrr,
            },
            "improved": questions_improved,
            "worse": questions_worse,
            "median_latency_ms": med_lat,
            "p95_latency_ms": p95_lat,
            "peak_rss_mb": peak_rss,
            "absent_abstain_rate": abs_abstain_pct,
        }

    finally:
        if active_emb_model != DEFAULT_MODEL_NAME:
            os.environ.pop("EMBEDDING_MODEL_NAME", None)
            get_embedding_model.cache_clear()

        if not keep:
            print("[Cleanup] Cleaning up eval database records...")
            cleanup_eval_artifacts(user["id"] if user else None, email=user_email)
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
        "--set",
        choices=["a", "b"],
        default="a",
        help="Question set for real corpus: 'a' (default) or 'b'",
    )
    parser.add_argument(
        "--rerank",
        action="store_true",
        help="Rerank top 15 hybrid results with Xenova/ms-marco-MiniLM-L-6-v2 and score top 5",
    )
    parser.add_argument(
        "--embedding-model",
        default=None,
        help="Override embedding model (e.g. 'BAAI/bge-small-en-v1.5')",
    )
    parser.add_argument(
        "--skip-absent",
        action="store_true",
        help="Skip LLM abstention generation on absent-fact questions for retrieval-only benchmarks",
    )
    parser.add_argument(
        "--keep",
        action="store_true",
        help="Keep eval user, subject, and chunks in the database for debugging (default: delete on completion)",
    )
    args = parser.parse_args()
    run_evaluation(
        corpus=args.corpus,
        question_set=args.set,
        rerank=args.rerank,
        embedding_model=args.embedding_model,
        skip_absent=args.skip_absent,
        keep=args.keep,
    )
