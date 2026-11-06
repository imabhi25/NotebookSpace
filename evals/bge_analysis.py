#!/usr/bin/env python3
"""
BGE detailed analysis: cosine separation with keyword boost on/off,
and query_embed prefix variant test.

Runs against the existing BGE-embedded chunks in the local database
(from prior eval runs with --keep).

Usage:
    .venv/bin/python evals/bge_analysis.py
"""

import json
import os
import sys
import time
import resource
import numpy as np
from pathlib import Path
from typing import Any
from unittest.mock import patch
from urllib.parse import urlparse

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from db.connection import get_connection
from db.notebook_store import (
    get_user_by_email,
    get_subjects_for_user,
    get_sources_for_subject,
    search_scoped,
    extract_key_terms,
)
from ingestion.embedder import get_embedding_model, embed_text, DEFAULT_MODEL_NAME

EVALS_DIR = PROJECT_ROOT / "evals"


def check_database_host():
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")
    parsed = urlparse(db_url)
    host = parsed.hostname or "localhost"
    print(f"[DB] Host: {host}")
    if host not in ("localhost", "127.0.0.1", "::1"):
        raise RuntimeError(f"Non-local host: {host}")


def load_questions(set_name: str) -> list[dict]:
    if set_name == "synthetic":
        path = EVALS_DIR / "questions.json"
    elif set_name == "real_a":
        path = EVALS_DIR / "questions_real.json"
    elif set_name == "real_b":
        path = EVALS_DIR / "questions_real_b.json"
    else:
        raise ValueError(f"Unknown set: {set_name}")
    return json.loads(path.read_text())


def get_eval_context(embedding_model: str):
    """Get user, subject, sources for a given embedding model's eval data."""
    if "bge" in embedding_model.lower():
        email = "eval_bge_runner@example.com"
        subj_suffix = " (BGE)"
    else:
        email = "eval_benchmark_runner@example.com"
        subj_suffix = ""

    user = get_user_by_email(email)
    if not user:
        raise RuntimeError(f"Eval user {email} not found. Run the eval with --keep first.")

    subjects = get_subjects_for_user(user_id=user["id"], include_archived=False)
    return user, subjects, email


def find_first_hit_rank(retrieved, expected_targets, max_k=5):
    for rank_idx, chunk in enumerate(retrieved[:max_k], 1):
        for target in expected_targets:
            if chunk["file_name"] == target["file"] and chunk["page_number"] == target["page"]:
                return rank_idx
    return None


def search_without_boost(question, user_id, subject_id, source_ids, k=5):
    with patch("db.notebook_store.extract_key_terms", return_value=[]):
        return search_scoped(
            question=question,
            user_id=user_id,
            subject_id=subject_id,
            selected_source_ids=source_ids,
            k=k,
        )


def calculate_raw_cosine(question: str, chunk_id: str) -> float:
    q_emb = embed_text(question)
    q_vec_str = "[" + ",".join(f"{x:.6f}" for x in q_emb) + "]"
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 - (embedding <=> %s::vector) AS cosine_sim FROM chunks WHERE id = %s",
                (q_vec_str, chunk_id),
            )
            row = cur.fetchone()
            return float(row[0]) if row else 0.0


def run_cosine_analysis(set_name: str, model_name: str, corpus_type: str):
    """Run cosine separation analysis for a given question set and embedding model.

    Returns dict with answerable/absent cosine stats and hit metrics for
    boost-on vs boost-off.
    """
    questions = load_questions(set_name)
    answerable = [q for q in questions if not q.get("is_absent") and q.get("category") != "absent_fact"]
    absent = [q for q in questions if q.get("is_absent") or q.get("category") == "absent_fact"]

    user, subjects, email = get_eval_context(model_name)

    if corpus_type == "synthetic":
        subj_name = "Evaluation Benchmark Course"
    else:
        subj_name = "Evaluation Benchmark Course (Real Corpus)"

    if "bge" in model_name.lower():
        subj_name += " (BGE)"

    subject = next((s for s in subjects if s["name"] == subj_name), None)
    if not subject:
        print(f"  Subject '{subj_name}' not found for {email}. Available: {[s['name'] for s in subjects]}")
        return None

    sources = get_sources_for_subject(user_id=user["id"], subject_id=subject["id"])
    sources = [s for s in sources if s["status"] == "ready"]
    source_ids = [s["id"] for s in sources]

    if not source_ids:
        print(f"  No ready sources for {subj_name}")
        return None

    # Set embedding model
    os.environ["EMBEDDING_MODEL_NAME"] = model_name
    get_embedding_model.cache_clear()

    try:
        ans_cosines = []
        abs_cosines = []

        # Metrics: boost ON
        boost_top1 = boost_top3 = boost_top5 = 0
        boost_rr_sum = 0.0
        # Metrics: boost OFF
        noboost_top1 = noboost_top3 = noboost_top5 = 0
        noboost_rr_sum = 0.0

        for q in answerable:
            targets = q.get("expected_targets", [])

            # Boost ON
            ret_boost = search_scoped(
                question=q["question"],
                user_id=user["id"],
                subject_id=subject["id"],
                selected_source_ids=source_ids,
                k=5,
            )

            # Boost OFF
            ret_noboost = search_without_boost(
                question=q["question"],
                user_id=user["id"],
                subject_id=subject["id"],
                source_ids=source_ids,
                k=5,
            )

            # Raw cosine of top-1 (boost on)
            if ret_boost:
                cos = calculate_raw_cosine(q["question"], ret_boost[0]["id"])
                ans_cosines.append(cos)

            # Hit metrics - boost on
            rank = find_first_hit_rank(ret_boost, targets)
            if rank == 1:
                boost_top1 += 1; boost_top3 += 1; boost_top5 += 1; boost_rr_sum += 1.0
            elif rank in (2, 3):
                boost_top3 += 1; boost_top5 += 1; boost_rr_sum += 1.0 / rank
            elif rank in (4, 5):
                boost_top5 += 1; boost_rr_sum += 1.0 / rank

            # Hit metrics - boost off
            rank_nb = find_first_hit_rank(ret_noboost, targets)
            if rank_nb == 1:
                noboost_top1 += 1; noboost_top3 += 1; noboost_top5 += 1; noboost_rr_sum += 1.0
            elif rank_nb in (2, 3):
                noboost_top3 += 1; noboost_top5 += 1; noboost_rr_sum += 1.0 / rank_nb
            elif rank_nb in (4, 5):
                noboost_top5 += 1; noboost_rr_sum += 1.0 / rank_nb

        for q in absent:
            ret = search_scoped(
                question=q["question"],
                user_id=user["id"],
                subject_id=subject["id"],
                selected_source_ids=source_ids,
                k=5,
            )
            if ret:
                cos = calculate_raw_cosine(q["question"], ret[0]["id"])
                abs_cosines.append(cos)

        n_ans = len(answerable)
        result = {
            "set": set_name,
            "model": model_name,
            "n_answerable": n_ans,
            "n_absent": len(absent),
            "cosine_answerable": {
                "min": round(min(ans_cosines), 4) if ans_cosines else 0,
                "mean": round(float(np.mean(ans_cosines)), 4) if ans_cosines else 0,
                "max": round(max(ans_cosines), 4) if ans_cosines else 0,
            },
            "cosine_absent": {
                "min": round(min(abs_cosines), 4) if abs_cosines else 0,
                "mean": round(float(np.mean(abs_cosines)), 4) if abs_cosines else 0,
                "max": round(max(abs_cosines), 4) if abs_cosines else 0,
            },
            "separation_gap": round(
                (float(np.mean(ans_cosines)) - float(np.mean(abs_cosines))), 4
            ) if ans_cosines and abs_cosines else 0,
            "boost_on": {
                "hit1": boost_top1, "hit3": boost_top3, "hit5": boost_top5,
                "hit1_pct": round(boost_top1 / n_ans * 100, 1),
                "hit3_pct": round(boost_top3 / n_ans * 100, 1),
                "hit5_pct": round(boost_top5 / n_ans * 100, 1),
                "mrr": round(boost_rr_sum / n_ans, 3),
            },
            "boost_off": {
                "hit1": noboost_top1, "hit3": noboost_top3, "hit5": noboost_top5,
                "hit1_pct": round(noboost_top1 / n_ans * 100, 1),
                "hit3_pct": round(noboost_top3 / n_ans * 100, 1),
                "hit5_pct": round(noboost_top5 / n_ans * 100, 1),
                "mrr": round(noboost_rr_sum / n_ans, 3),
            },
        }
        return result

    finally:
        os.environ.pop("EMBEDDING_MODEL_NAME", None)
        get_embedding_model.cache_clear()


def run_query_prefix_test(set_name: str, corpus_type: str):
    """Test BGE query_embed prefix variant on a question set.

    FastEmbed's BAAI/bge-small-en-v1.5 exposes query_embed() which prepends
    'Represent this sentence for searching relevant passages: ' to queries.
    The stored passage embeddings used passage_embed() or plain embed() during
    ingestion.

    We re-embed queries with query_embed() and compute cosine against stored
    chunk embeddings directly (bypassing search_scoped to use our custom
    query vector).
    """
    questions = load_questions(set_name)
    answerable = [q for q in questions if not q.get("is_absent") and q.get("category") != "absent_fact"]
    absent = [q for q in questions if q.get("is_absent") or q.get("category") == "absent_fact"]

    model_name = "BAAI/bge-small-en-v1.5"
    user, subjects, email = get_eval_context(model_name)

    if corpus_type == "synthetic":
        subj_name = "Evaluation Benchmark Course (BGE)"
    else:
        subj_name = "Evaluation Benchmark Course (Real Corpus) (BGE)"

    subject = next((s for s in subjects if s["name"] == subj_name), None)
    if not subject:
        print(f"  Subject '{subj_name}' not found. Available: {[s['name'] for s in subjects]}")
        return None

    sources = get_sources_for_subject(user_id=user["id"], subject_id=subject["id"])
    sources = [s for s in sources if s["status"] == "ready"]
    source_ids = [s["id"] for s in sources]

    if not source_ids:
        return None

    # Load BGE model
    from fastembed import TextEmbedding
    model = TextEmbedding(model_name=model_name)

    def search_with_custom_vector(q_vector, user_id, subject_id, source_ids, k=5):
        """Search using a custom query vector (bypass embed_text)."""
        selected_ids_str = [str(sid) for sid in source_ids]
        q_vec_str = "[" + ",".join(f"{x:.6f}" for x in q_vector) + "]"
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        c.id, c.file_name, c.page_number, c.chunk_text,
                        1 - (c.embedding <=> %s::vector) AS similarity_score
                    FROM chunks c
                    JOIN sources s ON c.source_id = s.id
                    JOIN subjects sub ON s.subject_id = sub.id
                    WHERE sub.user_id = %s
                      AND s.subject_id = %s
                      AND s.id = ANY(%s::uuid[])
                      AND s.status = 'ready'
                    ORDER BY c.embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (q_vec_str, str(user_id), str(subject_id), selected_ids_str, q_vec_str, k),
                )
                results = []
                for row in cur.fetchall():
                    results.append({
                        "id": row[0],
                        "file_name": row[1],
                        "page_number": row[2],
                        "chunk_text": row[3],
                        "score": float(row[4]),
                    })
                return results

    # Run with plain embed (default - same as current eval)
    plain_top1 = plain_top3 = plain_top5 = 0
    plain_rr_sum = 0.0

    # Run with query_embed prefix (manual prefix string)
    prefix_str = "Represent this sentence for searching relevant passages: "
    prefix_top1 = prefix_top3 = prefix_top5 = 0
    prefix_rr_sum = 0.0

    plain_cosines = []
    prefix_cosines = []

    for q in answerable:
        targets = q.get("expected_targets", [])
        q_text = q["question"]

        # Plain embed
        plain_vec = next(iter(model.embed([q_text]))).tolist()
        plain_ret = search_with_custom_vector(plain_vec, user["id"], subject["id"], source_ids)

        # Query embed (with manual prefix)
        prefix_vec = next(iter(model.embed([prefix_str + q_text]))).tolist()
        prefix_ret = search_with_custom_vector(prefix_vec, user["id"], subject["id"], source_ids)

        if plain_ret:
            plain_cosines.append(plain_ret[0]["score"])
        if prefix_ret:
            prefix_cosines.append(prefix_ret[0]["score"])

        # Plain hit metrics
        rank_p = find_first_hit_rank(plain_ret, targets)
        if rank_p == 1:
            plain_top1 += 1; plain_top3 += 1; plain_top5 += 1; plain_rr_sum += 1.0
        elif rank_p in (2, 3):
            plain_top3 += 1; plain_top5 += 1; plain_rr_sum += 1.0 / rank_p
        elif rank_p in (4, 5):
            plain_top5 += 1; plain_rr_sum += 1.0 / rank_p

        # Prefix hit metrics
        rank_q = find_first_hit_rank(prefix_ret, targets)
        if rank_q == 1:
            prefix_top1 += 1; prefix_top3 += 1; prefix_top5 += 1; prefix_rr_sum += 1.0
        elif rank_q in (2, 3):
            prefix_top3 += 1; prefix_top5 += 1; prefix_rr_sum += 1.0 / rank_q
        elif rank_q in (4, 5):
            prefix_top5 += 1; prefix_rr_sum += 1.0 / rank_q

    n_ans = len(answerable)
    return {
        "set": set_name,
        "n_answerable": n_ans,
        "plain": {
            "hit1": plain_top1, "hit3": plain_top3, "hit5": plain_top5,
            "hit1_pct": round(plain_top1 / n_ans * 100, 1),
            "hit3_pct": round(plain_top3 / n_ans * 100, 1),
            "hit5_pct": round(plain_top5 / n_ans * 100, 1),
            "mrr": round(plain_rr_sum / n_ans, 3),
            "top1_cos_mean": round(float(np.mean(plain_cosines)), 4) if plain_cosines else 0,
        },
        "query_prefix": {
            "hit1": prefix_top1, "hit3": prefix_top3, "hit5": prefix_top5,
            "hit1_pct": round(prefix_top1 / n_ans * 100, 1),
            "hit3_pct": round(prefix_top3 / n_ans * 100, 1),
            "hit5_pct": round(prefix_top5 / n_ans * 100, 1),
            "mrr": round(prefix_rr_sum / n_ans, 3),
            "top1_cos_mean": round(float(np.mean(prefix_cosines)), 4) if prefix_cosines else 0,
        },
    }


def main():
    check_database_host()

    print("=" * 80)
    print(" BGE DETAILED ANALYSIS")
    print("=" * 80)

    # ---- Part 1: Cosine separation with boost on/off ----
    print("\n--- Part 1: BGE Cosine Separation & Keyword Boost Effect ---\n")
    bge_model = "BAAI/bge-small-en-v1.5"

    sets = [
        ("synthetic", "synthetic"),
        ("real_a", "real"),
        ("real_b", "real"),
    ]

    cosine_results = []
    for set_name, corpus_type in sets:
        print(f"\n  [{set_name.upper()}] Running BGE boost on/off analysis...")
        result = run_cosine_analysis(set_name, bge_model, corpus_type)
        if result:
            cosine_results.append(result)
            ca = result["cosine_answerable"]
            cb = result["cosine_absent"]
            print(f"    Answerable cosine: min={ca['min']}, mean={ca['mean']}, max={ca['max']}")
            print(f"    Absent cosine:     min={cb['min']}, mean={cb['mean']}, max={cb['max']}")
            print(f"    Separation gap:    {result['separation_gap']}")
            print(f"    Boost ON:  Hit@1={result['boost_on']['hit1_pct']}%, MRR={result['boost_on']['mrr']}")
            print(f"    Boost OFF: Hit@1={result['boost_off']['hit1_pct']}%, MRR={result['boost_off']['mrr']}")

    # Also run MiniLM for comparison
    print("\n--- MiniLM cosine separation for comparison ---")
    minilm_model = DEFAULT_MODEL_NAME
    minilm_results = []
    for set_name, corpus_type in sets:
        print(f"\n  [{set_name.upper()}] Running MiniLM cosine analysis...")
        result = run_cosine_analysis(set_name, minilm_model, corpus_type)
        if result:
            minilm_results.append(result)
            ca = result["cosine_answerable"]
            cb = result["cosine_absent"]
            print(f"    Answerable cosine: min={ca['min']}, mean={ca['mean']}, max={ca['max']}")
            print(f"    Absent cosine:     min={cb['min']}, mean={cb['mean']}, max={cb['max']}")
            print(f"    Separation gap:    {result['separation_gap']}")

    # ---- Part 2: BGE query prefix variant ----
    print("\n\n--- Part 2: BGE Query Prefix Variant (query_embed vs plain embed) ---\n")

    prefix_results = []
    for set_name, corpus_type in sets:
        print(f"\n  [{set_name.upper()}] Testing query prefix variant...")
        result = run_query_prefix_test(set_name, corpus_type)
        if result:
            prefix_results.append(result)
            print(f"    Plain:  Hit@1={result['plain']['hit1_pct']}%, Hit@5={result['plain']['hit5_pct']}%, MRR={result['plain']['mrr']}, top1 cos mean={result['plain']['top1_cos_mean']}")
            print(f"    Prefix: Hit@1={result['query_prefix']['hit1_pct']}%, Hit@5={result['query_prefix']['hit5_pct']}%, MRR={result['query_prefix']['mrr']}, top1 cos mean={result['query_prefix']['top1_cos_mean']}")

    # ---- Summary ----
    print("\n\n" + "=" * 90)
    print(" SUMMARY: BGE COSINE SEPARATION ANALYSIS")
    print("=" * 90)
    print(f"{'Set':<12} | {'Model':<12} | {'Ans Min':>8} | {'Ans Mean':>9} | {'Ans Max':>8} | {'Abs Min':>8} | {'Abs Mean':>9} | {'Abs Max':>8} | {'Gap':>6}")
    print("-" * 90)
    for r in cosine_results:
        ca, cb = r["cosine_answerable"], r["cosine_absent"]
        print(f"{r['set']:<12} | {'BGE':<12} | {ca['min']:>8.4f} | {ca['mean']:>9.4f} | {ca['max']:>8.4f} | {cb['min']:>8.4f} | {cb['mean']:>9.4f} | {cb['max']:>8.4f} | {r['separation_gap']:>6.4f}")
    for r in minilm_results:
        ca, cb = r["cosine_answerable"], r["cosine_absent"]
        print(f"{r['set']:<12} | {'MiniLM':<12} | {ca['min']:>8.4f} | {ca['mean']:>9.4f} | {ca['max']:>8.4f} | {cb['min']:>8.4f} | {cb['mean']:>9.4f} | {cb['max']:>8.4f} | {r['separation_gap']:>6.4f}")

    print("\n" + "=" * 90)
    print(" SUMMARY: BGE KEYWORD BOOST EFFECT")
    print("=" * 90)
    print(f"{'Set':<12} | {'Boost':>6} | {'Hit@1':>8} | {'Hit@3':>8} | {'Hit@5':>8} | {'MRR':>6}")
    print("-" * 60)
    for r in cosine_results:
        print(f"{r['set']:<12} | {'ON':>6} | {r['boost_on']['hit1_pct']:>7.1f}% | {r['boost_on']['hit3_pct']:>7.1f}% | {r['boost_on']['hit5_pct']:>7.1f}% | {r['boost_on']['mrr']:>6.3f}")
        print(f"{r['set']:<12} | {'OFF':>6} | {r['boost_off']['hit1_pct']:>7.1f}% | {r['boost_off']['hit3_pct']:>7.1f}% | {r['boost_off']['hit5_pct']:>7.1f}% | {r['boost_off']['mrr']:>6.3f}")

    print("\n" + "=" * 90)
    print(" SUMMARY: BGE QUERY PREFIX VARIANT")
    print("=" * 90)
    print(f"{'Set':<12} | {'Variant':<14} | {'Hit@1':>8} | {'Hit@3':>8} | {'Hit@5':>8} | {'MRR':>6} | {'Top1 Cos Mean':>14}")
    print("-" * 80)
    for r in prefix_results:
        print(f"{r['set']:<12} | {'Plain embed':<14} | {r['plain']['hit1_pct']:>7.1f}% | {r['plain']['hit3_pct']:>7.1f}% | {r['plain']['hit5_pct']:>7.1f}% | {r['plain']['mrr']:>6.3f} | {r['plain']['top1_cos_mean']:>14.4f}")
        print(f"{r['set']:<12} | {'Query prefix':<14} | {r['query_prefix']['hit1_pct']:>7.1f}% | {r['query_prefix']['hit3_pct']:>7.1f}% | {r['query_prefix']['hit5_pct']:>7.1f}% | {r['query_prefix']['mrr']:>6.3f} | {r['query_prefix']['top1_cos_mean']:>14.4f}")

    # ---- Proposed parameter values ----
    print("\n\n" + "=" * 90)
    print(" PROPOSED PARAMETER VALUES (BGE)")
    print("=" * 90)
    # Collect all BGE answerable means and absent means
    bge_ans_means = [r["cosine_answerable"]["mean"] for r in cosine_results]
    bge_abs_means = [r["cosine_absent"]["mean"] for r in cosine_results]
    bge_abs_maxs = [r["cosine_absent"]["max"] for r in cosine_results]

    if bge_ans_means and bge_abs_means:
        avg_ans = np.mean(bge_ans_means)
        avg_abs = np.mean(bge_abs_means)
        max_abs = max(bge_abs_maxs)
        print(f"  BGE answerable cosine mean (avg across sets): {avg_ans:.4f}")
        print(f"  BGE absent cosine mean (avg across sets):     {avg_abs:.4f}")
        print(f"  BGE absent cosine max (worst case):           {max_abs:.4f}")
        print()
        # MiniLM comparison
        if minilm_results:
            ml_ans = np.mean([r["cosine_answerable"]["mean"] for r in minilm_results])
            ml_abs = np.mean([r["cosine_absent"]["mean"] for r in minilm_results])
            print(f"  MiniLM answerable cosine mean: {ml_ans:.4f}")
            print(f"  MiniLM absent cosine mean:     {ml_abs:.4f}")
            print()

        print("  Current production values (MiniLM):")
        print("    SUPPORT_MIN_SCORE = 0.20")
        print("    keyword_boost     = +0.30")
        print()
        print("  Proposed BGE values (DO NOT APPLY — recommendation only):")
        print(f"    SUPPORT_MIN_SCORE = 0.50  (rationale: BGE absent max={max_abs:.3f}; set floor above noise)")
        print(f"    low_similarity_cutoff = 0.45  (below this, retrieval is likely irrelevant)")
        print(f"    keyword_boost     = +0.15  (halved: BGE's narrower gap ({avg_ans-avg_abs:.3f}) means +0.30 dominates scoring)")

    # Save all results
    all_results = {
        "cosine_bge": cosine_results,
        "cosine_minilm": minilm_results,
        "prefix_test": prefix_results,
    }
    out_path = EVALS_DIR / ".bench_scratch" / "bge_analysis_results.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(all_results, indent=2))
    print(f"\nAll results saved to {out_path}")


if __name__ == "__main__":
    main()
