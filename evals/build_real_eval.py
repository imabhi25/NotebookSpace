#!/usr/bin/env python3
"""
Generate evaluation benchmark dataset for real textbook corpus.
Supports:
- Set A (seed 42, general prose chunks) -> evals/questions_real.json, evals/spot_check.md
- Set B (seed 43, strict structural exclusions, meta-language prohibition, corpus-unique gold answer)
  -> evals/questions_real_b.json, evals/spot_check_b.md

Rules for Set B:
(a) Skip chunks containing practice exercises, checkpoint questions, chapter outlines,
    tables of contents, or section headings only.
(b) Reject any generated question containing the words: exercise, section, outline, chapter,
    practice, "concepts in practice", or hint.
(c) The gold_answer must be at least 4 characters and appear (case-insensitive exact string)
    in exactly ONE chunk in the whole corpus; if in more than one, reject and regenerate.
(d) 5-consecutive-word copy prohibition as before.
(e) 30 answerable and 6 absent questions, with absent topics verified absent by string search.
Generate all questions before running any retrieval. Log how many candidates were rejected under each rule.
"""

import json
import os
import sys
import re
import time
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
OUTPUT_QUESTIONS_A = PROJECT_ROOT / "evals" / "questions_real.json"
SPOT_CHECK_A = PROJECT_ROOT / "evals" / "spot_check.md"
OUTPUT_QUESTIONS_B = PROJECT_ROOT / "evals" / "questions_real_b.json"
SPOT_CHECK_B = PROJECT_ROOT / "evals" / "spot_check_b.md"


def is_valid_prose_chunk_set_a(text: str) -> tuple[bool, str]:
    """Check if chunk has >= 60 words of prose and is not mostly code/exercises (Set A rules)."""
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


def is_valid_prose_chunk_set_b(text: str) -> tuple[bool, str]:
    """
    Set B Rule (a): Skip chunks containing practice exercises, checkpoint questions,
    chapter outlines, tables of contents, or section headings only.
    """
    words = text.split()
    if len(words) < 60:
        return False, f"section headings only / too short ({len(words)} words)"

    lower = text.lower()
    if "chapter outline" in lower:
        return False, "contains chapter outline"
    if "table of contents" in lower:
        return False, "contains table of contents"

    # Checkpoint questions (checkpoint followed by multiple choice / question items)
    if "checkpoint" in lower and re.search(r"checkpoint.*?[1-9]\s*\.\s*[A-Z]", text, re.DOTALL | re.IGNORECASE):
        return False, "contains checkpoint questions"

    # Practice exercises, programming practice, concepts in practice
    if re.search(r"\b(practice (exercise|program)s?|programming practice|concepts in practice)\b", lower):
        return False, "contains practice exercises"

    # Check code or headings dominance
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    code_or_heading_lines = 0
    prose_lines = 0
    prose_words = 0
    for l in lines:
        is_code = (
            l.startswith(">>>") or
            l.startswith("#") or
            re.match(r"^(def|class|if|elif|else|for|while|import|from|return|print)\b", l) or
            re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*", l) or
            re.match(r"^[0-9\.\s+\-*/()=]+$", l)
        )
        is_heading_only = bool(re.match(r"^(\d+\.\d+|[•\-\*]|\d+\s*\.)", l)) and len(l.split()) < 8
        if is_code or is_heading_only:
            code_or_heading_lines += 1
        else:
            prose_lines += 1
            prose_words += len(l.split())

    if code_or_heading_lines >= prose_lines:
        return False, f"mostly code or headings ({code_or_heading_lines} vs {prose_lines})"
    if prose_words < 60:
        return False, f"fewer than 60 words prose ({prose_words})"

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


def check_forbidden_meta_words(q_text: str) -> str | None:
    """
    Set B Rule (b): Reject any question containing words:
    exercise, section, outline, chapter, practice, 'concepts in practice', or hint.
    """
    forbidden = ["exercise", "section", "outline", "chapter", "practice", "concepts in practice", "hint"]
    lower = q_text.lower()
    for word in forbidden:
        if " " in word:
            if word in lower:
                return word
        else:
            if re.search(r"\b" + re.escape(word) + r"s?\b", lower):
                return word
    return None


def check_gold_answer_corpus_uniqueness(gold_ans: str, all_chunks: list[dict[str, Any]]) -> tuple[bool, str]:
    """
    Set B Rule (c): The gold_answer must be at least 4 characters and appear (case-insensitive
    exact string) in exactly ONE chunk in the whole corpus.
    """
    if len(gold_ans) < 4:
        return False, f"too short ({len(gold_ans)} chars < 4)"

    target = gold_ans.lower()
    matching_chunks = []
    for c in all_chunks:
        if target in c["text"].lower():
            matching_chunks.append(f"{c['file']} p.{c['page']}")

    if len(matching_chunks) == 0:
        return False, "gold_answer not found in any chunk"
    elif len(matching_chunks) > 1:
        return False, f"appears in {len(matching_chunks)} chunks ({', '.join(matching_chunks[:3])})"

    return True, "unique"


def find_candidate_unique_phrases(chunk_text: str, all_chunks: list[dict[str, Any]], count: int = 5) -> list[str]:
    """Find representative phrases in chunk_text that appear in exactly ONE chunk across the corpus."""
    words = chunk_text.split()
    unique = []
    seen = set()
    stop_words = {"the", "and", "of", "to", "in", "a", "is", "that", "for", "it", "as", "was", "with", "on", "at", "by", "an", "be", "this", "which", "or", "from", "but", "not"}
    for n in [2, 3, 4]:
        for i in range(len(words) - n + 1):
            phrase = " ".join(words[i : i + n])
            phrase_clean = re.sub(r"^[^\w]+|[^\w]+$", "", phrase)
            if len(phrase_clean) < 4 or len(phrase_clean) > 40:
                continue
            pw = phrase_clean.lower().split()
            if not pw or all(w in stop_words for w in pw):
                continue
            lower_phrase = phrase_clean.lower()
            if lower_phrase in seen:
                continue
            seen.add(lower_phrase)
            matches = 0
            for c in all_chunks:
                if lower_phrase in c["text"].lower():
                    matches += 1
                    if matches > 1:
                        break
            if matches == 1 and phrase_clean in chunk_text:
                unique.append(phrase_clean)
                if len(unique) >= count:
                    return unique
    return unique


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


def build_real_eval_dataset(target_set: str = "b", keep: bool = True):
    check_database_host()

    pdf_files = sorted(REAL_DOCS_DIR.glob("*.pdf")) if REAL_DOCS_DIR.exists() else []
    if not pdf_files:
        print(f"No PDFs found in {REAL_DOCS_DIR}!")
        print("Please split textbook chapters into evals/corpus_real/.")
        sys.exit(1)

    output_file = OUTPUT_QUESTIONS_B if target_set == "b" else OUTPUT_QUESTIONS_A
    spot_check_file = SPOT_CHECK_B if target_set == "b" else SPOT_CHECK_A
    seed = 43 if target_set == "b" else 42

    print(f"\n================================================================================")
    print(f" BUILDING REAL TEXTBOOK EVALUATION DATASET [SET {target_set.upper()}] (SEED {seed})")
    print(f"================================================================================")

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

    # Rule (a) Chunk filtering
    valid_chunks = []
    chunk_filter_rejections: dict[str, int] = {}
    for chunk in all_chunks:
        if target_set == "b":
            ok, reason = is_valid_prose_chunk_set_b(chunk["text"])
        else:
            ok, reason = is_valid_prose_chunk_set_a(chunk["text"])

        if ok:
            valid_chunks.append(chunk)
        else:
            chunk_filter_rejections[reason] = chunk_filter_rejections.get(reason, 0) + 1

    print(f"Filtered chunks: {len(valid_chunks)} valid prose chunks (rejected {len(all_chunks) - len(valid_chunks)} chunks).")
    print("Rule (a) Chunk Rejection Breakdown:")
    for reason, count in sorted(chunk_filter_rejections.items()):
        print(f"  - {reason}: {count}")

    if len(valid_chunks) < 30:
        raise RuntimeError(f"Only {len(valid_chunks)} chunks passed prose filter; need at least 30.")

    # Seed-based shuffling
    rng = random.Random(seed)
    candidate_pool = list(valid_chunks)
    rng.shuffle(candidate_pool)

    llm = get_llm_client()
    # Disable cache to ensure regenerations produce fresh model outputs
    llm.read_cache = False

    answerable_questions = []

    # Audit logging counters
    count_rejected_meta_words = 0
    count_rejected_gold_length = 0
    count_rejected_gold_nonunique = 0
    count_rejected_5word_overlap = 0
    count_dropped_chunks = 0

    print(f"\nGenerating 30 answerable questions from sampled prose chunks (seed={seed})...")
    pool_idx = 0
    while len(answerable_questions) < 30 and pool_idx < len(candidate_pool):
        chunk = candidate_pool[pool_idx]
        pool_idx += 1
        q_num = len(answerable_questions) + 1

        success = False
        max_attempts = 10
        rejected_answers = []
        feedback = ""

        # Pre-scan for corpus-unique phrases in this chunk to guide model
        unique_hints = find_candidate_unique_phrases(chunk["text"], all_chunks, count=5) if target_set == "b" else []

        for attempt in range(1, max_attempts + 1):
            if target_set == "b":
                system_prompt = (
                    "You are an expert educational assessment author designing benchmark evaluation questions for a retrieval system.\n"
                    "You will be given a single chunk of text from a textbook chapter.\n"
                    "Your task is to:\n"
                    "1. Identify an unambiguous, specific factual concept, entity, or term described in the chunk.\n"
                    "2. Select a concise exact substring from the chunk text as `gold_answer`.\n"
                    "   CRITICAL RULES FOR `gold_answer`:\n"
                    "   - MUST be at least 4 characters long.\n"
                    "   - MUST be an exact verbatim substring from the chunk text.\n"
                    "   - MUST be distinctive and specific to this passage (e.g. a specific named library, function name, technical term, or proper noun). "
                    "Do NOT choose generic ubiquitous words like 'Python', 'code', 'function', 'True', 'False', or 'variable'.\n"
                    "3. Formulate a clear, direct question whose answer is that `gold_answer`.\n"
                    "   CRITICAL RULES FOR `question`:\n"
                    "   - Paraphrase naturally! Do NOT copy 5 or more consecutive words from the chunk.\n"
                    "   - NEVER use meta-language: do NOT use the words 'exercise', 'section', 'outline', 'chapter', 'practice', 'concepts in practice', or 'hint'.\n"
                    "Output JSON with keys: \"question\", \"gold_answer\"."
                )
            else:
                system_prompt = (
                    "You are an expert educational assessment author designing benchmark evaluation questions for a retrieval system.\n"
                    "You will be given a single chunk of text from a textbook chapter.\n"
                    "Your task is to:\n"
                    "1. Identify an unambiguous, specific factual concept or statement in the chunk.\n"
                    "2. Select a concise exact substring from the chunk text as the `gold_answer`.\n"
                    "   CRITICAL: The `gold_answer` MUST appear verbatim in the chunk text.\n"
                    "3. Formulate a clear, direct question whose answer is that `gold_answer`.\n"
                    "   CRITICAL: Paraphrase the question naturally! You MUST NOT copy 5 or more consecutive words from the chunk into your question.\n"
                    "Output JSON with keys: \"question\", \"gold_answer\"."
                )

            user_prompt = f"Source Document: {chunk['file']}, Page {chunk['page']}\nChunk Text:\n\"\"\"\n{chunk['text']}\n\"\"\""
            if unique_hints and target_set == "b":
                user_prompt += f"\n\nDistinctive phrases in this chunk that appear nowhere else in the corpus (recommended for gold_answer):\n{unique_hints}\n"
            if feedback:
                user_prompt += f"\n\n[ATTEMPT {attempt} of {max_attempts} - PREVIOUS ATTEMPT FAILED]\n{feedback}\n"
                if rejected_answers:
                    user_prompt += f"Forbidden previous gold answers (do NOT choose these): {rejected_answers}\n"
                user_prompt += "Select a completely DIFFERENT distinctive phrase or term that appears ONLY on this page."

            # Rate-limit safety: 3s sleep prevents exceeding Free Tier 15 RPM
            time.sleep(3.2)

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

            # Set B Rule (b): Check forbidden meta-language words
            if target_set == "b":
                meta_word = check_forbidden_meta_words(q_text)
                if meta_word:
                    count_rejected_meta_words += 1
                    feedback = f"Rule (b) violation: Question contained forbidden meta-word '{meta_word}'."
                    print(f"    [REJECTED Rule b - attempt {attempt}] Meta-word: '{meta_word}' in '{q_text}'")
                    continue

            # Rule (d): Check consecutive word overlap (reject >= 5 words)
            overlap = find_consecutive_overlap(q_text, chunk["text"], n=5)
            if overlap:
                count_rejected_5word_overlap += 1
                feedback = f"Rule (d) violation: Question copied 5 or more consecutive words from the chunk: '{overlap}'."
                print(f"    [REJECTED Rule d - attempt {attempt}] Copied phrase: '{overlap}'")
                continue

            # Set B Rule (c): Gold answer length >= 4 and exact corpus uniqueness
            if target_set == "b":
                unique_ok, unique_reason = check_gold_answer_corpus_uniqueness(gold_ans, all_chunks)
                if not unique_ok:
                    if "too short" in unique_reason:
                        count_rejected_gold_length += 1
                    else:
                        count_rejected_gold_nonunique += 1
                    rejected_answers.append(gold_ans)
                    feedback = f"Rule (c) violation for gold_answer '{gold_ans}': {unique_reason}."
                    print(f"    [REJECTED Rule c - attempt {attempt}] '{gold_ans}': {unique_reason}")
                    continue
            else:
                try:
                    assert gold_ans in chunk["text"], f"Gold answer '{gold_ans}' is not an exact substring of chunk text!"
                    assert len(gold_ans.strip()) > 0, "Gold answer cannot be empty!"
                except AssertionError as err:
                    feedback = f"Gold answer validation failed: {err}"
                    print(f"    [REJECTED gold_answer - attempt {attempt}] {err}")
                    continue

            # Passed all checks!
            qid = f"rq_b_{q_num:02d}" if target_set == "b" else f"rq{q_num:02d}"
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
            count_dropped_chunks += 1
            print(f"  [DROPPED CHUNK] Chunk {chunk['file']} p.{chunk['page']} dropped after {max_attempts} failed attempts.")

    # If any chunks were dropped and we are short of 30, cycle back through valid chunks to complete 30
    if len(answerable_questions) < 30:
        print(f"\nPool exhausted with {len(answerable_questions)} questions. Cycling back through valid chunks to reach 30...")
        cycle_idx = 0
        while len(answerable_questions) < 30 and cycle_idx < len(candidate_pool):
            chunk = candidate_pool[cycle_idx]
            cycle_idx += 1
            q_num = len(answerable_questions) + 1
            rejected_answers = [q[0]["gold_answer"] for q in answerable_questions if q[1]["id"] == chunk["id"]]
            feedback = ""
            unique_hints = find_candidate_unique_phrases(chunk["text"], all_chunks, count=5) if target_set == "b" else []

            for attempt in range(1, max_attempts + 1):
                system_prompt = (
                    "You are an expert educational assessment author designing benchmark evaluation questions for a retrieval system.\n"
                    "You will be given a single chunk of text from a textbook chapter.\n"
                    "Your task is to:\n"
                    "1. Identify an unambiguous, specific factual concept, entity, or term described in the chunk.\n"
                    "2. Select a concise exact substring from the chunk text as `gold_answer`.\n"
                    "   CRITICAL RULES FOR `gold_answer`:\n"
                    "   - MUST be at least 4 characters long.\n"
                    "   - MUST be an exact verbatim substring from the chunk text.\n"
                    "   - MUST be distinctive and specific to this passage.\n"
                    "3. Formulate a clear, direct question whose answer is that `gold_answer`.\n"
                    "   CRITICAL RULES FOR `question`:\n"
                    "   - Paraphrase naturally! Do NOT copy 5 or more consecutive words from the chunk.\n"
                    "   - NEVER use meta-language: do NOT use the words 'exercise', 'section', 'outline', 'chapter', 'practice', 'concepts in practice', or 'hint'.\n"
                    "Output JSON with keys: \"question\", \"gold_answer\"."
                )
                user_prompt = f"Source Document: {chunk['file']}, Page {chunk['page']}\nChunk Text:\n\"\"\"\n{chunk['text']}\n\"\"\""
                if unique_hints:
                    user_prompt += f"\n\nDistinctive phrases in this chunk that appear nowhere else:\n{unique_hints}\n"
                if feedback or rejected_answers:
                    user_prompt += f"\n\n[PREVIOUS ATTEMPT FAILED]\n{feedback}\nForbidden gold answers: {rejected_answers}\nSelect a different unique term."

                time.sleep(3.2)
                resp = llm.generate(system=system_prompt, user=user_prompt)
                raw_text = resp.text.strip()
                if raw_text.startswith("```"):
                    raw_text = raw_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

                try:
                    data = json.loads(raw_text)
                    q_text = data.get("question", "").strip()
                    gold_ans = data.get("gold_answer", "").strip()
                except Exception:
                    feedback = "Failed to parse JSON."
                    continue

                meta_word = check_forbidden_meta_words(q_text)
                if meta_word:
                    count_rejected_meta_words += 1
                    feedback = f"Forbidden meta-word '{meta_word}'."
                    continue

                overlap = find_consecutive_overlap(q_text, chunk["text"], n=5)
                if overlap:
                    count_rejected_5word_overlap += 1
                    feedback = f"Copied 5+ consecutive words: '{overlap}'."
                    continue

                unique_ok, unique_reason = check_gold_answer_corpus_uniqueness(gold_ans, all_chunks)
                if not unique_ok:
                    if "too short" in unique_reason:
                        count_rejected_gold_length += 1
                    else:
                        count_rejected_gold_nonunique += 1
                    rejected_answers.append(gold_ans)
                    feedback = unique_reason
                    continue

                qid = f"rq_b_{q_num:02d}"
                q_obj = {
                    "id": qid,
                    "category": "factual_paraphrased",
                    "question": q_text,
                    "expected_targets": [{"file": chunk["file"], "page": chunk["page"]}],
                    "gold_answer": gold_ans,
                    "is_absent": False,
                }
                answerable_questions.append((q_obj, chunk))
                print(f"  [{q_num:02d}/30] {qid} ({chunk['file']} p.{chunk['page']}): {q_text} -> [Answer: '{gold_ans}']")
                break

    print(f"\n================================================================================")
    print(f" QUESTION GENERATION AUDIT LOG [SET {target_set.upper()}]")
    print(f"================================================================================")
    print(f"Successfully generated answerable questions: {len(answerable_questions)} / 30")
    print(f"Candidates rejected under Rule (b) [Forbidden meta-words]      : {count_rejected_meta_words}")
    print(f"Candidates rejected under Rule (c) [Gold answer < 4 chars]       : {count_rejected_gold_length}")
    print(f"Candidates rejected under Rule (c) [Gold answer not corpus-unique]: {count_rejected_gold_nonunique}")
    print(f"Candidates rejected under Rule (d) [5+ consecutive words copied]  : {count_rejected_5word_overlap}")
    print(f"Chunks dropped after {max_attempts} failed attempts                          : {count_dropped_chunks}")
    print(f"================================================================================\n")

    if len(answerable_questions) < 30:
        raise RuntimeError(f"Could only generate {len(answerable_questions)} answerable questions; required 30.")

    # 6 Absent Questions on topics not in the 4 chapters
    print("Preparing and verifying 6 absent questions...")
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
    prefix = "rq_b_abs_" if target_set == "b" else "rq_abs_"
    for idx, spec in enumerate(verified_absent[:6], 1):
        abs_obj = {
            "id": f"{prefix}{idx:02d}",
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
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_eval_questions, f, indent=2)
    print(f"\nSaved {len(all_eval_questions)} questions to {output_file}")

    # Spot check: 15 randomly chosen generated questions with source chunk text
    spot_rng = random.Random(seed)
    spot_sample = spot_rng.sample(answerable_questions, min(15, len(answerable_questions)))
    spot_lines = [
        f"# Spot Check: 15 Sampled Retrieval Evaluation Questions [Set {target_set.upper()}]",
        "",
        f"These 15 questions were randomly sampled from `{output_file.name}` (OpenStax *Introduction to Python Programming*, Chapters 1-4, seed={seed}) to verify:",
        "1. Rule (a): No practice exercises, checkpoint questions, chapter outlines, or section headings only.",
        "2. Rule (b): Zero meta-language words (no 'exercise', 'section', 'outline', 'chapter', 'practice', 'concepts in practice', or 'hint').",
        "3. Rule (c): `gold_answer` is >= 4 chars and appears in exactly ONE chunk across the entire corpus.",
        "4. Rule (d): Fully paraphrased (zero copies of 5 or more consecutive words from source chunk).",
        "5. Rule (e): Expected target citation matches source file and page.",
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

    with open(spot_check_file, "w", encoding="utf-8") as f:
        f.write("\n".join(spot_lines))
    print(f"Saved 15 spot-check questions to {spot_check_file}")

    if not keep:
        print("[Cleanup] Cleaning up eval artifacts as requested (--no-keep)...")
        cleanup_eval_artifacts(user["id"])
    else:
        print("[Database] Chunks retained in database for retrieval evaluation (--keep is active).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build real textbook evaluation benchmark dataset")
    parser.add_argument("--set", choices=["a", "b"], default="b", help="Question set to build: 'a' or 'b' (default: 'b')")
    parser.add_argument("--keep", action="store_true", default=True, help="Keep eval user, subject, and chunks in the database (default: True)")
    parser.add_argument("--no-keep", dest="keep", action="store_false", help="Clean up database after building")
    args = parser.parse_args()
    build_real_eval_dataset(target_set=args.set, keep=args.keep)
