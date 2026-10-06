import json
import os
from pathlib import Path
import time
from typing import Any
from dotenv import load_dotenv

from answering.llm import LLMClient, get_llm_client
from db.retrieval import search

load_dotenv()


def format_passages_for_prompt(retrieved: list[dict[str, Any]]) -> str:
    """Format retrieved passages with [1]..[k], file name, and page number."""
    formatted = []
    for idx, passage in enumerate(retrieved, start=1):
        file_name = passage.get("file_name", passage.get("file", "document.pdf"))
        page_num = passage.get("page_number", passage.get("page", 1))
        text = passage.get("text", passage.get("chunk_text", "")).strip()
        formatted.append(f"[{idx}] (File: {file_name}, Page: {page_num})\n{text}")
    return "\n\n".join(formatted)


def get_system_prompt() -> str:
    return (
        "You are a course-document assistant. Answer the user's question using ONLY the provided course document passages.\n"
        "Cite each claim in your answer as [file p.N] (for example: [syllabus.pdf p.1]).\n"
        "If the passages do not contain the answer, reply exactly with NOT_FOUND.\n"
        "You must respond ONLY with a JSON object in this exact format:\n"
        "{\n"
        '  "supported": true,\n'
        '  "answer": "<your answer containing [file p.N] citations>",\n'
        '  "citations": [{"file": "<file_name>", "page": <page_number>}]\n'
        "}\n"
        "If the answer cannot be found in the passages, output:\n"
        "{\n"
        '  "supported": false,\n'
        '  "answer": "NOT_FOUND",\n'
        '  "citations": []\n'
        "}\n"
        "Do not include any text, markdown backticks, or explanation outside the JSON object."
    )


def answer_question(
    question: str,
    k: int = 5,
    llm_client: LLMClient | None = None,
    db_url: str | None = None,
) -> dict[str, Any]:
    """
    Answer a question using retrieved course document passages and an LLM.

    Args:
        question: User query string.
        k: Number of passages to retrieve (default: 5).
        llm_client: Optional LLMClient instance (defaults to configured provider).
        db_url: Optional database connection URL.

    Returns:
        dict with: answer, citations, abstained, abstain_reason, retrieved, tokens, latency.
    """
    start_time = time.perf_counter()
    support_min_score = float(os.getenv("SUPPORT_MIN_SCORE", "0.25"))

    # 1. Retrieve passages with existing search()
    retrieved = search(question, k=k, db_url=db_url)

    # Cheap pre-check: empty results or top score below threshold
    top_score = (
        max((r.get("similarity_score", r.get("score", 0.0)) for r in retrieved), default=0.0)
        if retrieved
        else 0.0
    )

    if not retrieved or top_score < support_min_score:
        latency = time.perf_counter() - start_time
        return {
            "answer": "NOT_FOUND",
            "citations": [],
            "abstained": True,
            "abstain_reason": "low_retrieval_score",
            "retrieved": retrieved,
            "tokens": {"input": 0, "output": 0, "total": 0},
            "latency": latency,
        }

    # 2. Build prompt
    passages_text = format_passages_for_prompt(retrieved)
    system_prompt = get_system_prompt()
    user_prompt = f"Passages:\n{passages_text}\n\nQuestion: {question}"

    # 3. Call model
    client = llm_client or get_llm_client()
    resp = client.generate(system=system_prompt, user=user_prompt)

    total_in_tok = resp.input_tokens
    total_out_tok = resp.output_tokens

    # Parse response
    content = resp.text.strip()
    if content.startswith("```"):
        # Strip markdown code fencing if present
        lines = content.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        content = "\n".join(lines).strip()

    try:
        parsed = json.loads(content)
    except Exception:
        parsed = None

    latency = time.perf_counter() - start_time

    if not parsed or not isinstance(parsed, dict):
        return {
            "answer": "NOT_FOUND",
            "citations": [],
            "abstained": True,
            "abstain_reason": "bad_output",
            "retrieved": retrieved,
            "tokens": {
                "input": total_in_tok,
                "output": total_out_tok,
                "total": total_in_tok + total_out_tok,
            },
            "latency": latency,
        }

    supported = bool(parsed.get("supported", False))
    raw_answer = str(parsed.get("answer", "")).strip()
    raw_citations = parsed.get("citations", [])

    if not supported or raw_answer == "NOT_FOUND":
        return {
            "answer": "NOT_FOUND",
            "citations": [],
            "abstained": True,
            "abstain_reason": "not_found",
            "retrieved": retrieved,
            "tokens": {
                "input": total_in_tok,
                "output": total_out_tok,
                "total": total_in_tok + total_out_tok,
            },
            "latency": latency,
        }

    return {
        "answer": raw_answer,
        "citations": raw_citations,
        "abstained": False,
        "abstain_reason": None,
        "retrieved": retrieved,
        "tokens": {
            "input": total_in_tok,
            "output": total_out_tok,
            "total": total_in_tok + total_out_tok,
        },
        "latency": latency,
    }
