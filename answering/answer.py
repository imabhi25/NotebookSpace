import json
import logging
import os
from pathlib import Path
import time
from typing import Any
from dotenv import load_dotenv

from answering.llm import LLMClient, get_llm_client
from answering.logger import log_answer
from answering.notebook_answer import normalize_convention_value
from db.retrieval import search

load_dotenv()
logger = logging.getLogger("course_assistant.answering")


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
        "Cite each claim in your answer as [file p.N] (for example: [document.pdf p.1]).\n"
        "If the passages do not contain the answer, reply exactly with NOT_FOUND.\n\n"
        "Conflict detection and resolution rules:\n"
        "- Report a conflict ONLY when two or more DIFFERENT files give different values for the same fact (for example, different due dates or grading percentages).\n"
        "- NEVER report a conflict for mere wording differences, and NEVER report a conflict within a single file.\n"
        "- When conflicts exist between different files, your answer text MUST present both values; add one line saying which is current when there is a resolution.\n"
        "- If there is a conflict, report it under 'conflicts' with 'topic', 'claims', and an optional 'resolution' (or null).\n"
        "- Only fill 'resolution' when (a) a document explicitly says it replaces or updates the other (basis: 'explicit_supersede'), or (b) both claims carry dates in their text and one is clearly newer (basis: 'newer_dated_document'). Otherwise use null. Never guess.\n"
        "- If there is no conflict, 'conflicts' must be an empty list [].\n\n"
        "Notation and convention rules:\n"
        "- Course materials often use different notation or conventions (e.g. 0-indexed vs 1-indexed arrays, log base 2 vs natural log, inclusive vs exclusive ranges, pseudocode styles).\n"
        "- Only include conventions that are directly relevant to THIS answer and stated or clearly shown in the cited passages. Empty list otherwise.\n"
        "- Report conventions under 'conventions' with:\n"
        "  - 'topic': exactly one of 'array_indexing', 'log_base', 'range_bounds', 'pseudocode_style', 'other'\n"
        "  - 'value': the stated or shown convention value (e.g. '0-indexed', 'log base 2')\n"
        "  - 'file': the file name\n"
        "  - 'page': the page number\n"
        "  - 'adopted': true if this answer follows this convention, false otherwise (at most one true per topic)\n\n"
        "You must respond ONLY with a JSON object in this exact format:\n"
        "{\n"
        '  "supported": true,\n'
        '  "answer": "<your answer containing [file p.N] citations>",\n'
        '  "citations": [{"file": "<file_name>", "page": <page_number>}],\n'
        '  "conflicts": [\n'
        '    {\n'
        '      "topic": "<topic of conflict>",\n'
        '      "claims": [\n'
        '        {"file": "<file_name>", "page": <page_number>, "value": "<stated value>"}\n'
        '      ],\n'
        '      "resolution": {\n'
        '        "current_file": "<file_name>",\n'
        '        "current_page": <page_number>,\n'
        '        "basis": "explicit_supersede" | "newer_dated_document",\n'
        '        "evidence": "<short quote or date justifying it>"\n'
        '      }\n'
        '    }\n'
        '  ],\n'
        '  "conventions": [\n'
        '    {\n'
        '      "topic": "array_indexing" | "log_base" | "range_bounds" | "pseudocode_style" | "other",\n'
        '      "value": "<stated convention value>",\n'
        '      "file": "<file_name>",\n'
        '      "page": <page_number>,\n'
        '      "adopted": true | false\n'
        '    }\n'
        '  ]\n'
        "}\n"
        "If the answer cannot be found in the passages, output:\n"
        "{\n"
        '  "supported": false,\n'
        '  "answer": "NOT_FOUND",\n'
        '  "citations": [],\n'
        '  "conflicts": [],\n'
        '  "conventions": []\n'
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
    conflicts: list[dict[str, Any]] | None = None,
    conflict_detected: bool = False,
    model: str | None = None,
    log_file: Path | str | None = None,
    conventions: list[dict[str, Any]] | None = None,
    convention_mismatches: list[dict[str, Any]] | None = None,
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
        conflicts=conflicts,
        conflict_detected=conflict_detected,
        log_file=log_file,
    )
    return {
        "answer": answer,
        "citations": citations,
        "conflicts": conflicts or [],
        "conflict_detected": conflict_detected,
        "abstained": abstained,
        "abstain_reason": abstain_reason,
        "retrieved": retrieved,
        "tokens": tokens,
        "latency": latency,
        "model": model,
        "conventions": conventions or [],
        "convention_mismatches": convention_mismatches or [],
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
        dict with: answer, citations, abstained, abstain_reason, retrieved, tokens, latency, model.
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

    pre_llm_seconds = time.perf_counter() - start_time

    # 2. Build prompt
    passages_text = format_passages_for_prompt(retrieved)
    system_prompt = get_system_prompt()
    user_prompt = f"Passages:\n{passages_text}\n\nQuestion: {question}"

    # 3. Call model with single retry on JSON parse failure
    client = llm_client or get_llm_client()
    model_name = getattr(client, "model", None)
    resp = client.generate(system=system_prompt, user=user_prompt)

    llm_latency = resp.latency_seconds
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
        llm_latency += retry_resp.latency_seconds
        total_in_tok += retry_resp.input_tokens
        total_out_tok += retry_resp.output_tokens
        parsed = try_parse_json(retry_resp.text)

    # Use recorded model latency so cached replays do not understate it.
    latency = pre_llm_seconds + llm_latency
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
            model=model_name,
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
            model=model_name,
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
            model=model_name,
            log_file=log_file,
        )

    retrieved_sources = {
        (
            Path(r.get("file_name", r.get("file", ""))).name.lower(),
            int(r.get("page_number", r.get("page", 0))),
        )
        for r in retrieved
    }
    file_page_to_upload_date = {
        (
            Path(r.get("file_name", r.get("file", ""))).name.lower(),
            int(r.get("page_number", r.get("page", 0))),
        ): r.get("upload_date")
        for r in retrieved
    }
    file_to_upload_date = {
        Path(r.get("file_name", r.get("file", ""))).name.lower(): r.get("upload_date")
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
                model=model_name,
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
                model=model_name,
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
                model=model_name,
                log_file=log_file,
            )

        validated_citations.append({"file": cit["file"], "page": cit_page})

    # Step 2: Conflict validation
    # Each conflict needs at least 2 claims from at least 2 distinct files,
    # and every (file, page) must be among the retrieved passages.
    # Drop invalid conflicts (do not fail the whole answer) and log the drop.
    raw_conflicts = parsed.get("conflicts", [])
    validated_conflicts: list[dict[str, Any]] = []

    if isinstance(raw_conflicts, list):
        for conflict in raw_conflicts:
            if not isinstance(conflict, dict):
                logger.warning("Dropping conflict: item is not a dict: %s", conflict)
                continue

            topic = str(conflict.get("topic", "")).strip()
            claims = conflict.get("claims", [])
            if not topic:
                logger.warning("Dropping conflict: missing or empty topic in %s", conflict)
                continue

            if not isinstance(claims, list) or len(claims) < 2:
                logger.warning(
                    "Dropping conflict '%s': requires at least 2 claims, got %s",
                    topic,
                    len(claims) if isinstance(claims, list) else type(claims),
                )
                continue

            valid_claims = []
            distinct_files = set()
            distinct_values: set[str] = set()
            conflict_invalid = False

            for claim in claims:
                if (
                    not isinstance(claim, dict)
                    or "file" not in claim
                    or "page" not in claim
                    or "value" not in claim
                ):
                    logger.warning("Dropping conflict '%s': invalid claim structure %s", topic, claim)
                    conflict_invalid = True
                    break

                try:
                    c_file_clean = Path(str(claim["file"])).name.lower()
                    c_page = int(claim["page"])
                    c_val = str(claim["value"]).strip()
                except (ValueError, TypeError):
                    logger.warning("Dropping conflict '%s': invalid claim types %s", topic, claim)
                    conflict_invalid = True
                    break

                if (c_file_clean, c_page) not in retrieved_sources:
                    logger.warning(
                        "Dropping conflict '%s': claim source (%s, %s) not in retrieved passages",
                        topic,
                        c_file_clean,
                        c_page,
                    )
                    conflict_invalid = True
                    break

                if not c_val:
                    logger.warning("Dropping conflict '%s': empty claim value", topic)
                    conflict_invalid = True
                    break

                distinct_files.add(c_file_clean)
                distinct_values.add(" ".join(c_val.lower().split()))
                upload_date = file_page_to_upload_date.get((c_file_clean, c_page)) or file_to_upload_date.get(c_file_clean)
                valid_claims.append({
                    "file": str(claim["file"]),
                    "page": c_page,
                    "value": c_val,
                    "upload_date": upload_date,
                })

            if conflict_invalid:
                continue

            if len(distinct_values) < 2:
                logger.warning("Dropping conflict '%s': claim values do not differ", topic)
                continue

            if len(distinct_files) < 2:
                logger.warning(
                    "Dropping conflict '%s': claims must come from at least 2 distinct files, got %s",
                    topic,
                    distinct_files,
                )
                continue

            # Validate optional resolution
            raw_res = conflict.get("resolution")
            validated_resolution = None
            if isinstance(raw_res, dict):
                res_file = raw_res.get("current_file")
                res_page = raw_res.get("current_page")
                res_basis = raw_res.get("basis")
                res_evidence = raw_res.get("evidence")

                if (
                    res_file
                    and res_page is not None
                    and res_basis in ("explicit_supersede", "newer_dated_document")
                    and isinstance(res_evidence, str)
                    and res_evidence.strip()
                ):
                    try:
                        res_page_int = int(res_page) if res_page is not None else None
                    except (ValueError, TypeError):
                        res_page_int = None

                    # Must match one of the valid claims
                    matching_claim = None
                    target_clean = Path(str(res_file).strip()).name.lower()
                    for c in valid_claims:
                        c_clean = Path(str(c["file"])).name.lower()
                        if (
                            target_clean == c_clean
                            or target_clean == Path(c_clean).stem.lower()
                        ):
                            matching_claim = c
                            break

                    if matching_claim:
                        current_page = (
                            res_page_int
                            if res_page_int == matching_claim["page"]
                            else matching_claim["page"]
                        )
                        validated_resolution = {
                            "current_file": matching_claim["file"],
                            "current_page": current_page,
                            "basis": res_basis,
                            "evidence": res_evidence.strip(),
                        }
                    else:
                        logger.warning(
                            "Dropping resolution: current_file '%s' not in conflict claims",
                            res_file,
                        )
                else:
                    logger.warning(
                        "Dropping resolution: invalid fields or basis in %s",
                        raw_res,
                    )

            validated_conflicts.append({
                "topic": topic,
                "claims": valid_claims,
                "resolution": validated_resolution,
            })

    conflict_detected = len(validated_conflicts) > 0

    # Step 3: Conventions validation
    ALLOWED_CONVENTION_TOPICS = {"array_indexing", "log_base", "range_bounds", "pseudocode_style", "other"}
    raw_conventions = parsed.get("conventions", [])
    validated_conventions: list[dict[str, Any]] = []
    adopted_per_topic: set[str] = set()

    if isinstance(raw_conventions, list):
        for conv in raw_conventions:
            if not isinstance(conv, dict):
                continue
            topic = str(conv.get("topic", "")).strip().lower()
            if topic not in ALLOWED_CONVENTION_TOPICS:
                continue

            val = str(conv.get("value", "")).strip()
            raw_c_file = str(conv.get("file", "")).strip()
            if not val or not raw_c_file:
                continue

            try:
                c_page = int(conv["page"])
            except (ValueError, TypeError, KeyError):
                continue

            c_file_clean = Path(raw_c_file).name.lower()
            if (c_file_clean, c_page) not in retrieved_sources:
                continue

            is_adopted = bool(conv.get("adopted", False))
            if is_adopted:
                if topic in adopted_per_topic:
                    is_adopted = False
                else:
                    adopted_per_topic.add(topic)

            validated_conventions.append({
                "topic": topic,
                "value": val,
                "file": raw_c_file,
                "page": c_page,
                "adopted": is_adopted,
            })

    # Detect convention mismatches
    from collections import defaultdict
    topic_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for c in validated_conventions:
        topic_groups[c["topic"]].append(c)

    convention_mismatches: list[dict[str, Any]] = []
    for topic, convs in topic_groups.items():
        if topic == "other":
            continue
        distinct_files = {Path(c["file"]).name.lower() for c in convs}
        distinct_vals = {normalize_convention_value(topic, c["value"]) for c in convs}
        if len(distinct_files) >= 2 and len(distinct_vals) >= 2:
            adopted_item = next((c for c in convs if c.get("adopted")), None)
            convention_mismatches.append({
                "topic": topic,
                "conventions": convs,
                "adopted_file": adopted_item["file"] if adopted_item else None,
                "adopted_value": adopted_item["value"] if adopted_item else None,
            })

    return _make_result(
        question=question,
        answer=raw_answer,
        citations=validated_citations,
        abstained=False,
        abstain_reason=None,
        retrieved=retrieved,
        tokens=token_stats,
        latency=latency,
        conflicts=validated_conflicts,
        conflict_detected=conflict_detected,
        model=model_name,
        log_file=log_file,
        conventions=validated_conventions,
        convention_mismatches=convention_mismatches,
    )
