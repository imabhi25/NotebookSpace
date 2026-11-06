#!/usr/bin/env python3
"""
Generate evaluation benchmark dataset for real textbook corpus.
Rules:
- 30 answerable questions sampled from chunks with random.seed(42).
- Skip chunks that are mostly code listings, exercises, or fewer than 60 words of prose.
- One question per chunk, paraphrased without verbatim copying of phrases.
- Reject any question copying 5 or more consecutive words from its chunk; ask model to regenerate.
- expected_targets = that chunk's file and page.
- gold_answer = exact string copied from chunk text (assert this; drop and log on failure).
- Generate all questions before running any retrieval against them.
- 6 absent questions on topics not covered in these 4 chapters (verified against corpus text).
- 15 randomly chosen generated questions saved to evals/spot_check.md.
"""

import json
import os
import sys
import re
import random
import argparse
from pathlib import Path
from urllib.parse import urlparse
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from db.connection import get_connection
from evals.run_retrieval_eval import setup_eval_corpus, cleanup_eval_artifacts, check_database_host
from answering.llm import get_llm_client

REAL_DOCS_DIR = PROJECT_ROOT / "evals" / "corpus_real"
OUTPUT_QUESTIONS_FILE = PROJECT_ROOT / "evals" / "questions_real.json"
SPOT_CHECK_FILE = PROJECT_ROOT / "evals" / "spot_check.md"


def is_valid_prose_chunk(text: str) -> tuple[bool, str]:
    """Check if chunk has >= 60 words of prose and is not mostly code/exercises."""
    words = text.split()
    if len(words) < 60:
        return False, f"fewer than 60 total words ({len(words)})"

    lines = [l.strip() for l in text.split("\n") if l.strip()]
    code_or_exercise_lines = 0
    prose_lines = 0
    prose_words = 0

    in_exercise = False
    for l in lines:
        if re.search(r"^(practice (program|exercise)s?|concepts in practice|exercises\b|check your understanding)", l, re.I):
            in_exercise = True
        elif re.search(r"^(1\.\d|2\.\d|3\.\d|4\.\d|chapter summary|learning objectives)\b", l, re.I):
            in_exercise = False

        is_code = (
            l.startswith(">>>") or
            l.startswith("#") or
            re.match(r"^(def|class|if|elif|else|for|while|import|from|return|print)\b", l) or
            re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*", l) or
            re.match(r"^[0-9\.\s+\-*/()=]+$", l)
        )
        is_mcq = bool(re.match(r"^([0-9]+\s*\.|\b[a-d]\s*\.)", l))

        if is_code or in_exercise or is_mcq:
            code_or_exercise_lines += 1
        else:
            prose_lines += 1
            prose_words += len(l.split())

    if code_or_exercise_lines >= prose_lines:
        return False, f"mostly code/exercises ({code_or_exercise_lines} code/exercise lines vs {prose_lines} prose lines)"
    if prose_words < 60:
        return False, f"fewer than 60 words of prose ({prose_words} prose words)"

    return True, "ok"


def extract_words(text: str) -> list[str]:
    """Lowercase and extract alphanumeric words."""
    return re.findall(r"\b[a-z0-9]+\b", text.lower())


def find_consecutive_overlap(q_text: str, chunk_text: str, n: int = 5) -> str | None:
    """Find any n consecutive words in q_text that appear contiguously in chunk_text."""
    q_words = extract_words(q_text)
    c_words = extract_words(chunk_text)
    if len(q_words) < n or len(c_words) < n:
        return None

    chunk_ngrams = set()
    for i in range(len(c_words) - n + 1):
        chunk_ngrams.add(tuple(c_words[i : i + n]))

    for i in range(len(q_words) - n + 1):
        ngram = tuple(q_words[i : i + n])
        if ngram in chunk_ngrams:
            return " ".join(ngram)
    return None


def verify_absent_topics(all_text: str, absent_specs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Verify that absent topic terms do NOT appear anywhere in the corpus text."""
    verified = []
    for spec in absent_specs:
        found_terms = []
        for term in spec["search_terms"]:
            pattern = r"\b" + re.escape(term) + r"\b"
            matches = re.findall(pattern, all_text, re.IGNORECASE)
            if matches:
                found_terms.append((term, len(matches)))
        if found_terms:
            print(f"  [DROPPED ABSENT TOPIC] '{spec['topic']}' found in corpus: {found_terms}. Dropping topic.")
        else:
            verified.append(spec)
    return verified


def build_real_eval_dataset(keep: bool = True):
    check_database_host()

    pdf_files = sorted(REAL_DOCS_DIR.glob("*.pdf")) if REAL_DOCS_DIR.exists() else []
    if not pdf_files:
        print(f"No PDFs found in {REAL_DOCS_DIR}!")
        print("Please split textbook chapters into evals/corpus_real/.")
        sys.exit(1)

    print(f"Found {len(pdf_files)} PDF files in {REAL_DOCS_DIR}: {[p.name for p in pdf_files]}")
    user, subject, sources, total_chunks = setup_eval_corpus(corpus="real")
    print(f"Ingested {len(sources)} sources into '{subject['name']}' (ID: {subject['id']}). Total chunks: {total_chunks}")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT c.id, s.file_name, c.page_number, c.chunk_text
                FROM chunks c
                JOIN sources s ON s.id = c.source_id
                WHERE s.subject_id = %s
                ORDER BY s.file_name, c.page_number, c.id
            """, (subject["id"],))
            all_chunks = [
                {"id": r[0], "file": r[1], "page": r[2], "text": r[3]}
                for r in cur.fetchall()
            ]

    print(f"Retrieved {len(all_chunks)} chunks from database.")

    # Filter chunks: skip code listings, exercises, or < 60 words prose
    valid_chunks = []
    skipped_count = 0
    for chunk in all_chunks:
        ok, reason = is_valid_prose_chunk(chunk["text"])
        if ok:
            valid_chunks.append(chunk)
        else:
            skipped_count += 1

    print(f"Filtered chunks: {len(valid_chunks)} valid prose chunks (skipped {skipped_count} code/exercise/short chunks).")
    if len(valid_chunks) < 30:
        raise RuntimeError(f"Only {len(valid_chunks)} chunks passed prose filter; need at least 30.")

    # Sample 30 chunks with seed 42
    rng = random.Random(42)
    # Shuffle all valid chunks with seed 42 to draw from
    candidate_pool = list(valid_chunks)
    rng.shuffle(candidate_pool)

    llm = get_llm_client()
    answerable_questions = []
    rejected_and_regenerated_count = 0
    dropped_count = 0

    print("\nGenerating 30 answerable questions from sampled prose chunks (seed=42)...")
    pool_idx = 0
    while len(answerable_questions) < 30 and pool_idx < len(candidate_pool):
        chunk = candidate_pool[pool_idx]
        pool_idx += 1
        q_num = len(answerable_questions) + 1

        success = False
        max_attempts = 5
        feedback = ""

        for attempt in range(1, max_attempts + 1):
            system_prompt = (
                "You are an expert educational assessment author designing benchmark evaluation questions for a retrieval system.\n"
                "You will be given a single chunk of text from a textbook chapter.\n"
                "Your task is to:\n"
                "1. Identify an unambiguous, specific factual concept or statement in the chunk.\n"
                "2. Select a concise exact substring from the chunk text as the `gold_answer` (e.g. a key term, definition, or short phrase).\n"
                "   CRITICAL: The `gold_answer` MUST appear verbatim in the chunk text.\n"
                "3. Formulate a clear, direct question whose answer is that `gold_answer`.\n"
                "   CRITICAL: Paraphrase the question naturally! You MUST NOT copy 5 or more consecutive words from the chunk into your question.\n"
                "Output JSON with keys: \"question\", \"gold_answer\"."
            )
            user_prompt = f"Source Document: {chunk['file']}, Page {chunk['page']}\nChunk Text:\n\"\"\"\n{chunk['text']}\n\"\"\""
            if feedback:
                user_prompt += f"\n\nPREVIOUS ATTEMPT FAILED: {feedback}\nPlease generate a fresh question that does not copy phrases."

            resp = llm.generate(system=system_prompt, user=user_prompt)
            raw_text = resp.text.strip()
            if raw_text.startswith("```"):
                raw_text = raw_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

            try:
                data = json.loads(raw_text)
                q_text = data.get("question", "").strip()
                gold_ans = data.get("gold_answer", "").strip()
            except Exception:
                feedback = "Failed to parse JSON response."
                continue

            # Check consecutive word overlap (reject >= 5 words)
            overlap = find_consecutive_overlap(q_text, chunk["text"], n=5)
            if overlap:
                rejected_and_regenerated_count += 1
                feedback = f"Question copied 5 or more consecutive words from the chunk: '{overlap}'."
                print(f"    [REJECTED & REGENERATING attempt {attempt}] Copied phrase: '{overlap}'")
                continue

            # Check gold answer substring
            try:
                assert gold_ans in chunk["text"], f"Gold answer '{gold_ans}' is not an exact substring of chunk text!"
                assert len(gold_ans.strip()) > 0, "Gold answer cannot be empty!"
            except AssertionError as err:
                feedback = f"Gold answer validation failed: {err}"
                print(f"    [REJECTED gold_answer attempt {attempt}] {err}")
                continue

            # Passed all checks!
            qid = f"rq{q_num:02d}"
            q_obj = {
                "id": qid,
                "category": "factual_paraphrased",
                "question": q_text,
                "expected_targets": [
                    {
                        "file": chunk["file"],
                        "page": chunk["page"],
                    }
                ],
                "gold_answer": gold_ans,
                "is_absent": False,
            }
            answerable_questions.append((q_obj, chunk))
            print(f"  [{q_num:02d}/30] {qid} ({chunk['file']} p.{chunk['page']}): {q_text} -> [Answer: '{gold_ans}']")
            success = True
            break

        if not success:
            dropped_count += 1
            print(f"  [DROPPED CHUNK] Chunk {chunk['file']} p.{chunk['page']} dropped after {max_attempts} failed attempts.")

    print(f"\nCompleted question generation:")
    print(f"  - Successfully generated: {len(answerable_questions)} questions")
    print(f"  - Rejected and regenerated questions (>= 5 consecutive words): {rejected_and_regenerated_count}")
    print(f"  - Dropped chunks: {dropped_count}")

    if len(answerable_questions) < 30:
        raise RuntimeError(f"Could only generate {len(answerable_questions)} answerable questions; required 30.")

    # 6 Absent Questions on topics not in the 4 chapters
    print("\nPreparing and verifying 6 absent questions...")
    corpus_all_text = " ".join(c["text"] for c in all_chunks)

    candidate_absent = [
        {
            "topic": "Decorators",
            "question": "How do Python decorators with @functools.wraps preserve function metadata such as docstrings and names?",
            "search_terms": ["decorator", "decorators", "functools", "wraps"],
        },
        {
            "topic": "C Extensions & Ctypes",
            "question": "How can Python programs call C shared library functions and allocate foreign structures using the ctypes library?",
            "search_terms": ["ctypes", "cffi", "foreign structures", "shared library"],
        },
        {
            "topic": "Packaging & PyPI",
            "question": "What configuration tables are required in pyproject.toml to build wheel distributions for publishing packages to PyPI with Twine?",
            "search_terms": ["pyproject", "wheel distributions", "pypi", "twine"],
        },
        {
            "topic": "Multiprocessing & GIL",
            "question": "How does the Global Interpreter Lock (GIL) in CPython constrain CPU-bound multi-threading compared to multiprocessing?",
            "search_terms": ["interpreter lock", "gil", "multiprocessing", "multi-threading"],
        },
        {
            "topic": "Dataclasses",
            "question": "How does the @dataclass decorator automatically synthesize __init__, __repr__, and __eq__ methods using type annotations?",
            "search_terms": ["dataclass", "dataclasses", "__repr__", "__eq__", "synthesize"],
        },
        {
            "topic": "Asyncio & Coroutines",
            "question": "How does asyncio.run() create and manage the asynchronous event loop when scheduling coroutines and TaskGroups?",
            "search_terms": ["asyncio", "event loop", "coroutine", "coroutines", "taskgroup", "taskgroups"],
        },
    ]

    verified_absent = verify_absent_topics(corpus_all_text, candidate_absent)
    if len(verified_absent) < 6:
        raise RuntimeError(f"Only {len(verified_absent)} absent topics verified (required 6).")

    absent_questions = []
    for idx, spec in enumerate(verified_absent[:6], 1):
        abs_obj = {
            "id": f"rq_abs_{idx:02d}",
            "category": "absent_fact",
            "question": spec["question"],
            "expected_targets": [],
            "gold_answer": "",
            "is_absent": True,
            "abstain_target": "not_found",
        }
        absent_questions.append(abs_obj)
        print(f"  [Absent {idx}/6] ({spec['topic']}): {spec['question']}")

    all_eval_questions = [item[0] for item in answerable_questions] + absent_questions
    with open(OUTPUT_QUESTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(all_eval_questions, f, indent=2)
    print(f"\nSaved {len(all_eval_questions)} questions to {OUTPUT_QUESTIONS_FILE}")

    # Spot check: 15 randomly chosen generated questions with source chunk text
    spot_rng = random.Random(42)
    spot_sample = spot_rng.sample(answerable_questions, min(15, len(answerable_questions)))
    spot_lines = [
        "# Spot Check: 15 Sampled Retrieval Evaluation Questions",
        "",
        "These 15 questions were randomly sampled from `evals/questions_real.json` (OpenStax *Introduction to Python Programming*, Chapters 1-4) to verify:",
        "1. Paraphrasing quality (no copying of 5 or more consecutive words from the source chunk).",
        "2. Ground truth alignment (`gold_answer` is an exact substring from the source chunk).",
        "3. Expected target citation accuracy (`expected_targets` matches source file and page).",
        "",
        "---",
        "",
    ]

    for i, (q, chunk) in enumerate(spot_sample, 1):
        spot_lines.append(f"## {i}. Question `{q['id']}`")
        spot_lines.append(f"**Question**: {q['question']}")
        spot_lines.append(f"**Target Document**: `{chunk['file']}`, Page {chunk['page']} (Chunk ID: {chunk['id']})")
        spot_lines.append(f"**Gold Answer**: `{q['gold_answer']}`")
        spot_lines.append("")
        spot_lines.append("**Source Chunk Text**:")
        spot_lines.append("> " + chunk['text'].replace("\n", "\n> "))
        spot_lines.append("")
        spot_lines.append("---")
        spot_lines.append("")

    with open(SPOT_CHECK_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(spot_lines))
    print(f"Saved 15 spot-check questions to {SPOT_CHECK_FILE}")

    if not keep:
        print("[Cleanup] Cleaning up eval artifacts as requested (--no-keep)...")
        cleanup_eval_artifacts(user["id"])
    else:
        print("[Database] Chunks retained in database for retrieval evaluation (--keep is active).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build real textbook evaluation benchmark dataset")
    parser.add_argument("--keep", action="store_true", default=True, help="Keep eval user, subject, and chunks in the database (default: True)")
    parser.add_argument("--no-keep", dest="keep", action="store_false", help="Clean up database after building")
    args = parser.parse_args()
    build_real_eval_dataset(keep=args.keep)
