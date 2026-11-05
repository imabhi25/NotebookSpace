#!/usr/bin/env python3
"""
Generate evaluation benchmark dataset for real textbook corpus.
Rules:
- 30 answerable questions sampled from chunks with random.seed(42).
- One question per chunk, paraphrased without verbatim copying of phrases.
- expected_targets = that chunk's file and page.
- gold_answer = exact string copied from chunk text.
- 6 absent questions on plausible topics not covered in the corpus.
- 15 randomly chosen generated questions saved to evals/spot_check.md.
"""

import json
import os
import sys
import random
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from db.connection import get_connection
from evals.run_retrieval_eval import setup_eval_corpus
from answering.llm import get_llm_client

REAL_DOCS_DIR = PROJECT_ROOT / "evals" / "corpus_real"
OUTPUT_QUESTIONS_FILE = PROJECT_ROOT / "evals" / "questions_real.json"
SPOT_CHECK_FILE = PROJECT_ROOT / "evals" / "spot_check.md"


def build_real_eval_dataset():
    pdf_files = sorted(REAL_DOCS_DIR.glob("*.pdf")) if REAL_DOCS_DIR.exists() else []
    if not pdf_files:
        print(f"No PDFs found in {REAL_DOCS_DIR}!")
        print("Please place 3-4 textbook chapter PDFs into evals/corpus_real/.")
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
    if len(all_chunks) < 30:
        print(f"Warning: Only {len(all_chunks)} chunks available; sampling {len(all_chunks)} chunks.")
        num_sample = len(all_chunks)
    else:
        num_sample = 30

    rng = random.Random(42)
    sampled_chunks = rng.sample(all_chunks, num_sample)

    llm = get_llm_client()
    answerable_questions = []

    print("\nGenerating 30 answerable questions from sampled chunks...")
    for idx, chunk in enumerate(sampled_chunks, 1):
        system_prompt = (
            "You are an expert educational assessment author designing benchmark evaluation questions for a retrieval system.\n"
            "You will be given a single chunk of text from a textbook.\n"
            "Your task is to:\n"
            "1. Identify an unambiguous, specific factual statement or concept in the chunk.\n"
            "2. Select a concise exact substring from the chunk text as the `gold_answer` (e.g. a key term, number, short phrase, or definition).\n"
            "   CRITICAL: The `gold_answer` MUST appear verbatim in the chunk text.\n"
            "3. Formulate a clear, direct question whose answer is that `gold_answer`.\n"
            "   CRITICAL: Paraphrase the question naturally! Do NOT copy verbatim phrases or keywords from the chunk in the question prompt.\n"
            "Output JSON with keys: \"question\", \"gold_answer\"."
        )
        user_prompt = f"Source Document: {chunk['file']}, Page {chunk['page']}\nChunk Text:\n\"\"\"\n{chunk['text']}\n\"\"\""

        resp = llm.generate(system=system_prompt, user=user_prompt)
        raw_text = resp.text.strip()
        # Clean json backticks if any
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        try:
            data = json.loads(raw_text)
            q_text = data.get("question", "").strip()
            gold_ans = data.get("gold_answer", "").strip()
        except Exception:
            # Fallback simple parsing
            lines = raw_text.splitlines()
            q_text = lines[0] if lines else "What concept is discussed?"
            gold_ans = chunk["text"][:30]

        # Verify gold_answer appears in chunk text
        if gold_ans not in chunk["text"]:
            # Pick first salient 3-5 word phrase
            words = chunk["text"].split()
            gold_ans = " ".join(words[5:10]) if len(words) >= 10 else chunk["text"][:30]

        qid = f"rq{idx:02d}"
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
        print(f"  [{idx:02d}/30] {qid}: {q_text[:60]}... (Answer: '{gold_ans}')")

    # Generate 6 absent questions
    print("\nGenerating 6 absent questions (plausible out-of-scope topics)...")
    sources_summary = ", ".join(sorted({c["file"] for c in all_chunks}))
    system_absent = (
        "You are an assessment author creating negative / absent evaluation questions for a textbook retrieval benchmark.\n"
        f"The corpus consists of chapters from: {sources_summary}.\n"
        "Generate 6 plausible questions that sound like they belong in computer science / systems textbooks, "
        "but ask about topics, technologies, or algorithms that are NOT present in these specific chapters.\n"
        "Output a JSON array of 6 question strings."
    )
    resp_absent = llm.generate(system=system_absent, user="Generate 6 absent questions as a JSON array of strings.")
    raw_abs = resp_absent.text.strip()
    if raw_abs.startswith("```"):
        raw_abs = raw_abs.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        absent_list = json.loads(raw_abs)
    except Exception:
        absent_list = [
            "How does the Paxos consensus algorithm elect a distinguished proposer during network partitions?",
            "What is the mathematical formulation of backpropagation through time in recurrent neural networks?",
            "How does quantum error correction protect topological qubits against thermal decoherence?",
            "What cryptographic hash function is used by the Bitcoin blockchain for proof-of-work mining?",
            "How does the Raft log compaction mechanism handle multi-version concurrency control in RocksDB?",
            "What page replacement policy does the Linux kernel implement for transparent huge pages on ARM64?",
        ]

    absent_questions = []
    for idx, q_text in enumerate(absent_list[:6], 1):
        abs_obj = {
            "id": f"rq_abs_{idx:02d}",
            "category": "absent_fact",
            "question": q_text,
            "expected_targets": [],
            "gold_answer": "",
            "is_absent": True,
            "abstain_target": "not_found",
        }
        absent_questions.append(abs_obj)
        print(f"  [Absent {idx}/6]: {q_text}")

    all_eval_questions = [item[0] for item in answerable_questions] + absent_questions
    with open(OUTPUT_QUESTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(all_eval_questions, f, indent=2)
    print(f"\nSaved {len(all_eval_questions)} questions to {OUTPUT_QUESTIONS_FILE}")

    # Select 15 randomly chosen generated questions for spot check
    spot_sample = rng.sample(answerable_questions, min(15, len(answerable_questions)))
    spot_lines = [
        "# Spot Check: 15 Sampled Retrieval Evaluation Questions",
        "",
        "These 15 questions were randomly sampled from `evals/questions_real.json` to verify:",
        "1. Paraphrasing quality (no copy-pasting of distinctive phrases from the source text).",
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


if __name__ == "__main__":
    build_real_eval_dataset()
