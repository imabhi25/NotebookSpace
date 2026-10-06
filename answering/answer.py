import json
import os
from pathlib import Path
import time
from typing import Any
from dotenv import load_dotenv

from answering.llm import LLMClient, get_llm_client
from answering.logger import log_answer
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


def _make_result(
    question: str,
    answer: str,
    citations: list[dict[str, Any]],
    abstained: bool,
    abstain_reason: str | None,
    retrieved: list[dict[str, Any]],
    tokens: dict[str, int],
    latency: float,
    log_file: Path | str | None = None,
) -> dict[str, Any]:
    top_scores = [float(r.get("score", r.get("similarity_score", 0.0))) for r in retrieved]
    log_answer(
        question=question,
        answer=answer,
        citations=citations,
        abstained=abstained,
        reason=abstain_reason,
        top_scores=top_scores,
        tokens=tokens,
        latency=latency,
        log_file=log_file,
    )
    return {
        "answer": answer,
        "citations": citations,
        "abstained": abstained,
        "abstain_reason": abstain_reason,
        "retrieved": retrieved,
        "tokens": tokens,
        "latency": latency,
    }


def answer_question(
    question: str,
    k: int = 5,
    llm_client: LLMClient | None = None,
    db_url: str | None = None,
    log_file: Path | str | None = None,
) -> dict[str, Any]:
    """
    Answer a question using retrieved course document passages and an LLM.

    Args:
        question: User query string.
        k: Number of passages to retrieve (default: 5).
        llm_client: Optional LLMClient instance (defaults to configured provider).
        db_url: Optional database connection URL.
        log_file: Optional path to append log JSON line (default: logs/answers.jsonl).

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
        return _make_result(
            question=question,
            answer="NOT_FOUND",
            citations=[],
            abstained=True,
            abstain_reason="low_retrieval_score",
            retrieved=retrieved,
            tokens={"input": 0, "output": 0, "total": 0},
            latency=latency,
            log_file=log_file,
        )

    # 2. Build prompt
    passages_text = format_passages_for_prompt(retrieved)
    system_prompt = get_system_prompt()
    user_prompt = f"Passages:\n{passages_text}\n\nQuestion: {question}"

    # 3. Call model with single retry on JSON parse failure
    client = llm_client or get_llm_client()
    resp = client.generate(system=system_prompt, user=user_prompt)

    total_in_tok = resp.input_tokens
    total_out_tok = resp.output_tokens

    def try_parse_json(text: str) -> dict[str, Any] | None:
        content = text.strip()
        if content.startswith("```"):
            lines = content.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            content = "\n".join(lines).strip()
        try:
            val = json.loads(content)
            return val if isinstance(val, dict) else None
        except Exception:
            return None

    parsed = try_parse_json(resp.text)

    # If first attempt failed to parse, retry once
    if parsed is None:
        retry_user_prompt = (
            f"{user_prompt}\n\n"
            "Error: Your previous response was not valid JSON. "
            "Please respond ONLY with the valid JSON object matching the requested schema."
        )
        retry_resp = client.generate(system=system_prompt, user=retry_user_prompt)
        total_in_tok += retry_resp.input_tokens
        total_out_tok += retry_resp.output_tokens
        parsed = try_parse_json(retry_resp.text)

    latency = time.perf_counter() - start_time
    token_stats = {
        "input": total_in_tok,
        "output": total_out_tok,
        "total": total_in_tok + total_out_tok,
    }

    if parsed is None:
        return _make_result(
            question=question,
            answer="NOT_FOUND",
            citations=[],
            abstained=True,
            abstain_reason="bad_output",
            retrieved=retrieved,
            tokens=token_stats,
            latency=latency,
            log_file=log_file,
        )

    supported = bool(parsed.get("supported", False))
    raw_answer = str(parsed.get("answer", "")).strip()
    raw_citations = parsed.get("citations", [])

    if not supported or raw_answer == "NOT_FOUND":
        return _make_result(
            question=question,
            answer="NOT_FOUND",
            citations=[],
            abstained=True,
            abstain_reason="not_found",
            retrieved=retrieved,
            tokens=token_stats,
            latency=latency,
            log_file=log_file,
        )

    # Step 3: Citation validation
    # Reject and convert to an abstention any answer whose citations are empty
    # or point to a file/page not among the retrieved passages. Record abstain_reason = "invalid_citation".
    if not isinstance(raw_citations, list) or len(raw_citations) == 0:
        return _make_result(
            question=question,
            answer="NOT_FOUND",
            citations=[],
            abstained=True,
            abstain_reason="invalid_citation",
            retrieved=retrieved,
            tokens=token_stats,
            latency=latency,
            log_file=log_file,
        )

    retrieved_sources = {
        (
            Path(r.get("file_name", r.get("file", ""))).name.lower(),
            int(r.get("page_number", r.get("page", 0))),
        )
        for r in retrieved
    }

    validated_citations: list[dict[str, Any]] = []
    for cit in raw_citations:
        if not isinstance(cit, dict) or "file" not in cit or "page" not in cit:
            return _make_result(
                question=question,
                answer="NOT_FOUND",
                citations=[],
                abstained=True,
                abstain_reason="invalid_citation",
                retrieved=retrieved,
                tokens=token_stats,
                latency=latency,
                log_file=log_file,
            )

        try:
            cit_file = Path(str(cit["file"])).name.lower()
            cit_page = int(cit["page"])
        except (ValueError, TypeError):
            return _make_result(
                question=question,
                answer="NOT_FOUND",
                citations=[],
                abstained=True,
                abstain_reason="invalid_citation",
                retrieved=retrieved,
                tokens=token_stats,
                latency=latency,
                log_file=log_file,
            )

        if (cit_file, cit_page) not in retrieved_sources:
            return _make_result(
                question=question,
                answer="NOT_FOUND",
                citations=[],
                abstained=True,
                abstain_reason="invalid_citation",
                retrieved=retrieved,
                tokens=token_stats,
                latency=latency,
                log_file=log_file,
            )

        validated_citations.append({"file": cit["file"], "page": cit_page})

    return _make_result(
        question=question,
        answer=raw_answer,
        citations=validated_citations,
        abstained=False,
        abstain_reason=None,
        retrieved=retrieved,
        tokens=token_stats,
        latency=latency,
        log_file=log_file,
    )
