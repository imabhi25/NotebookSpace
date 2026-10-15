import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import time
from typing import Any

# Ensure project root is in sys.path
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from answering.answer import answer_question
from answering.llm import LLMClient
from evaluation.run_retrieval_eval import is_source_match


def calculate_percentile(data: list[float], percentile: float) -> float:
    """Calculate percentile from a list of floats using linear interpolation."""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    if len(sorted_data) == 1:
        return sorted_data[0]
    rank = (percentile / 100.0) * (len(sorted_data) - 1)
    low = int(rank)
    high = min(low + 1, len(sorted_data) - 1)
    weight = rank - low
    return sorted_data[low] * (1.0 - weight) + sorted_data[high] * weight


def _format_expected(q: dict[str, Any]) -> str:
    """Format expected sources / answers for failure reporting."""
    q_type = q.get("type", "unknown")
    if q_type == "not_in_documents":
        return "Abstain (unsupported / not in documents)"
    if q_type == "conflicting":
        files = q.get("expected_conflict_files", [])
        srcs = [f"{s['file']} p.{s['page']}" for s in q.get("expected_sources", [])]
        parts = []
        if files:
            parts.append(f"Conflict between {files}")
        if srcs:
            parts.append(f"Sources: [{', '.join(srcs)}]")
        return "; ".join(parts) if parts else "Conflict expected"

    srcs = [f"{s['file']} p.{s['page']}" for s in q.get("expected_sources", [])]
    res = f"Sources: [{', '.join(srcs)}]" if srcs else "None"
    if q.get("expected_answer_contains"):
        res += f", contains: {q.get('expected_answer_contains')}"
    return res


def _format_retrieved_pages(retrieved: list[dict[str, Any]]) -> str:
    """Format retrieved passage references for reporting."""
    if not retrieved:
        return "None"
    pages = [f"{r.get('file_name', '')} p.{r.get('page_number', '')}" for r in retrieved]
    return ", ".join(pages)


def _format_model_answer(res: dict[str, Any]) -> str:
    """Format model answer and citations for reporting."""
    if res.get("abstained"):
        return f"Abstained (reason: {res.get('abstain_reason')})"
    answer = res.get("answer", "")
    citations = res.get("citations", [])
    if citations:
        c_str = ", ".join(f"{c.get('file')} p.{c.get('page')}" for c in citations)
        return f"{answer} (citations: [{c_str}])"
    return answer


def evaluate_answering(
    questions_path: Path | str,
    llm_client: LLMClient | None = None,
    db_url: str | None = None,
    k: int = 5,
    label: str | None = None,
    results_dir: Path | str | None = None,
    generate_markdown: bool = False,
    sleep_between_questions: float = 0.0,
) -> dict[str, Any]:
    """
    Run answer evaluation across questions dataset.

    Args:
        questions_path: Path to questions JSON.
        llm_client: Optional LLMClient to use (e.g. FakeLLMClient in tests).
        db_url: Optional database connection URL.
        k: Number of passages to retrieve.
        label: Optional run label (required when running canonical test set).
        results_dir: Directory to save results files.
        generate_markdown: Whether to write markdown report.
        sleep_between_questions: Optional seconds to sleep after each question.

    Returns:
        Evaluation report dictionary.
    """
    path = Path(questions_path)
    if not path.exists():
        raise FileNotFoundError(f"Questions file not found: {path}")

    # Enforce label requirement when evaluating canonical test set
    canonical_test_set = (project_root / "evaluation" / "questions.json").resolve()
    if path.resolve() == canonical_test_set and not label:
        raise ValueError(
            "Running the test set (questions.json) requires a label (use --label NAME)."
        )

    with open(path, "r", encoding="utf-8") as f:
        questions = json.load(f)

    if not isinstance(questions, list):
        raise ValueError("Questions file must contain a JSON list.")

    price_in = float(os.getenv("PRICE_PER_1M_INPUT", "0.0"))
    price_out = float(os.getenv("PRICE_PER_1M_OUTPUT", "0.0"))

    question_results: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    type_stats: dict[str, dict[str, Any]] = {
        "single_page": {"total": 0, "answered": 0, "abstained": 0, "cited_page_correct": 0},
        "multi_page": {
            "total": 0,
            "answered": 0,
            "abstained": 0,
            "cited_page_correct": 0,
            "retrieved_any": 0,
            "retrieved_all": 0,
        },
        "not_in_documents": {"total": 0, "answered": 0, "abstained": 0},
        "conflicting": {
            "total": 0,
            "answered": 0,
            "abstained": 0,
            "cited_page_correct": 0,
            "conflict_detected": 0,
        },
    }

    latencies: list[float] = []
    total_in_tok = 0
    total_out_tok = 0
    non_conflicting_total = 0
    false_positive_conflicts = 0

    total_answerable = 0
    top_3_retrieval_hits = 0
    top_5_retrieval_hits = 0

    for q in questions:
        q_id = q.get("id")
        q_text = q.get("question", "")
        q_type = q.get("type", "unknown")
        expected_sources = q.get("expected_sources", [])
        expected_contains = q.get("expected_answer_contains", [])

        res = answer_question(question=q_text, k=k, llm_client=llm_client, db_url=db_url)

        latency = res["latency"]
        latencies.append(latency)
        in_tok = res["tokens"]["input"]
        out_tok = res["tokens"]["output"]
        total_in_tok += in_tok
        total_out_tok += out_tok

        abstained = res["abstained"]
        answer = res["answer"]
        citations = res["citations"]
        retrieved = res["retrieved"]

        # Track retrieval hit rates for answerable questions
        if q_type != "not_in_documents" and expected_sources:
            total_answerable += 1
            hit_3 = any(
                is_source_match(exp["file"], exp["page"], r["file_name"], r["page_number"])
                for exp in expected_sources
                for r in retrieved[:3]
            )
            hit_5 = any(
                is_source_match(exp["file"], exp["page"], r["file_name"], r["page_number"])
                for exp in expected_sources
                for r in retrieved[:5]
            )
            if hit_3:
                top_3_retrieval_hits += 1
            if hit_5:
                top_5_retrieval_hits += 1

        # Track type stats
        stats = type_stats.setdefault(
            q_type,
            {
                "total": 0,
                "answered": 0,
                "abstained": 0,
                "cited_page_correct": 0,
                "conflict_detected": 0,
            },
        )
        stats["total"] += 1
        if abstained:
            stats["abstained"] += 1
        else:
            stats["answered"] += 1

        # Check failures and type-specific metrics
        question_failures: list[str] = []

        # Conflict evaluation: detection rate & false positive tracking
        if q_type == "conflicting":
            expected_conflict_files = [
                Path(f).name.lower() for f in q.get("expected_conflict_files", [])
            ]
            claim_files = {
                Path(c.get("file", "")).name.lower()
                for conf in res.get("conflicts", [])
                for c in conf.get("claims", [])
            }
            conflict_detected = bool(res.get("conflict_detected", False))
            has_all_expected = (
                all(ef in claim_files for ef in expected_conflict_files)
                if expected_conflict_files
                else True
            )

            if conflict_detected and has_all_expected:
                stats["conflict_detected"] += 1
            else:
                if not conflict_detected:
                    question_failures.append("Failed to detect conflict between sources.")
                elif not has_all_expected:
                    question_failures.append(
                        f"Conflict detected but claims did not cover all expected files. Expected: {expected_conflict_files}, got: {list(claim_files)}"
                    )
        else:
            non_conflicting_total += 1
            if res.get("conflict_detected", False):
                false_positive_conflicts += 1
                question_failures.append(
                    "False positive: conflict reported on non-conflicting question."
                )

        # Check expected conflict resolution
        if "expected_resolution" in q:
            exp_res = q["expected_resolution"]
            exp_curr = Path(exp_res.get("current_file", "")).name.lower()
            conflicts = res.get("conflicts", [])
            matched_res = False
            for conf in conflicts:
                r = conf.get("resolution")
                if r and Path(r.get("current_file", "")).name.lower() == exp_curr:
                    if not exp_res.get("basis") or r.get("basis") == exp_res.get("basis"):
                        matched_res = True
                        break
            if not matched_res:
                question_failures.append(
                    f"Expected conflict resolution current_file={exp_curr}, got: {[c.get('resolution') for c in conflicts]}"
                )

        # Check expected conventions
        if "expected_conventions" in q:
            exp_convs = q["expected_conventions"]
            got_convs = res.get("conventions", [])
            if len(exp_convs) == 0 and len(got_convs) > 0:
                question_failures.append(f"Expected 0 conventions, got {len(got_convs)}: {got_convs}")
            elif len(exp_convs) > 0:
                for exp_c in exp_convs:
                    exp_top = exp_c.get("topic")
                    found = any(c.get("topic") == exp_top for c in got_convs)
                    if not found:
                        question_failures.append(f"Expected convention topic '{exp_top}' not found in {got_convs}")

        # Check expected convention mismatch
        if "expected_convention_mismatch" in q:
            exp_mismatch = q["expected_convention_mismatch"]
            mismatches = res.get("convention_mismatches", [])
            found_mismatch = any(m.get("topic") == exp_mismatch.get("topic") for m in mismatches)
            if not found_mismatch:
                question_failures.append(f"Expected convention mismatch for '{exp_mismatch.get('topic')}', got: {mismatches}")

        if q_type == "not_in_documents":
            if not abstained:
                stats["answered"] += 0  # already counted
                question_failures.append("Answered unsupported question instead of abstaining.")
        else:
            # Answerable question
            if abstained:
                question_failures.append(
                    f"Abstained on answerable question (reason: {res['abstain_reason']})."
                )
            else:
                # Check citations correctness
                if q_type == "single_page":
                    correct = any(
                        is_source_match(exp["file"], exp["page"], cit["file"], cit["page"])
                        for exp in expected_sources
                        for cit in citations
                    )
                    if correct:
                        stats["cited_page_correct"] += 1
                    else:
                        question_failures.append(
                            f"Cited page incorrect. Expected: {expected_sources}, Got: {citations}"
                        )
                elif q_type == "multi_page":
                    any_ret = any(
                        any(
                            is_source_match(exp["file"], exp["page"], r["file_name"], r["page_number"])
                            for r in retrieved[:k]
                        )
                        for exp in expected_sources
                    )
                    all_ret = all(
                        any(
                            is_source_match(exp["file"], exp["page"], r["file_name"], r["page_number"])
                            for r in retrieved[:k]
                        )
                        for exp in expected_sources
                    )
                    if any_ret:
                        stats["retrieved_any"] += 1
                    if all_ret:
                        stats["retrieved_all"] += 1

                    # All expected pages cited for multi_page
                    all_cited = all(
                        any(
                            is_source_match(exp["file"], exp["page"], cit["file"], cit["page"])
                            for cit in citations
                        )
                        for exp in expected_sources
                    )
                    if all_cited:
                        stats["cited_page_correct"] += 1
                    else:
                        question_failures.append(
                            f"Did not cite all expected pages. Expected: {expected_sources}, Got: {citations}"
                        )
                elif q_type == "conflicting":
                    any_cited = any(
                        is_source_match(exp["file"], exp["page"], cit["file"], cit["page"])
                        for exp in expected_sources
                        for cit in citations
                    )
                    if any_cited:
                        stats["cited_page_correct"] += 1

                # Check expected_answer_contains
                if expected_contains and not abstained:
                    answer_lower = answer.lower()
                    missing = []
                    for c in expected_contains:
                        if isinstance(c, list):
                            if not any(isinstance(alt, str) and alt.lower() in answer_lower for alt in c):
                                missing.append(c)
                        elif isinstance(c, str):
                            if c.lower() not in answer_lower:
                                missing.append(c)
                    if missing:
                        question_failures.append(f"Answer missing expected phrase(s): {missing}")

        expected_formatted = _format_expected(q)
        retrieved_formatted = _format_retrieved_pages(retrieved)
        model_answer_formatted = _format_model_answer(res)

        if question_failures:
            failures.append(
                {
                    "id": q_id,
                    "question": q_text,
                    "type": q_type,
                    "expected": expected_formatted,
                    "retrieved_pages": retrieved_formatted,
                    "model_answer": model_answer_formatted,
                    "failure_reasons": question_failures,
                    "failures": question_failures,
                    "answer": answer,
                    "citations": citations,
                    "abstained": abstained,
                    "abstain_reason": res["abstain_reason"],
                }
            )

        question_results.append(
            {
                "id": q_id,
                "question": q_text,
                "type": q_type,
                "result": res,
                "failures": question_failures,
            }
        )

        if sleep_between_questions > 0:
            time.sleep(sleep_between_questions)

    # Compute rates
    summary_by_type: dict[str, Any] = {}
    for t_name, s in type_stats.items():
        tot = s["total"]
        if tot == 0:
            continue
        if t_name in ("single_page", "multi_page", "conflicting"):
            summary_by_type[t_name] = {
                "total": tot,
                "answered_rate": s["answered"] / tot,
                "abstained_on_answerable_rate": s["abstained"] / tot,
                "cited_page_correct_rate": s.get("cited_page_correct", 0) / tot,
            }
            if t_name == "multi_page":
                summary_by_type[t_name]["retrieved_any_rate"] = s.get("retrieved_any", 0) / tot
                summary_by_type[t_name]["retrieved_all_rate"] = s.get("retrieved_all", 0) / tot
            elif t_name == "conflicting":
                summary_by_type[t_name]["conflict_detection_rate"] = (
                    s.get("conflict_detected", 0) / tot
                )
        elif t_name == "not_in_documents":
            summary_by_type[t_name] = {
                "total": tot,
                "unsupported_answer_rate": s["answered"] / tot,
                "abstention_rate": s["abstained"] / tot,
            }

    tot_q = len(questions)
    p50 = calculate_percentile(latencies, 50)
    p95 = calculate_percentile(latencies, 95)
    total_tokens = total_in_tok + total_out_tok
    total_cost = (total_in_tok * price_in / 1e6) + (total_out_tok * price_out / 1e6)
    cost_per_100 = (total_cost / tot_q * 100) if tot_q > 0 else 0.0

    conflicting_tot = type_stats.get("conflicting", {}).get("total", 0)
    conflict_det_count = type_stats.get("conflicting", {}).get("conflict_detected", 0)
    conflict_detection_rate = (
        (conflict_det_count / conflicting_tot) if conflicting_tot > 0 else 0.0
    )
    fp_conflict_rate = (
        (false_positive_conflicts / non_conflicting_total)
        if non_conflicting_total > 0
        else 0.0
    )

    retrieval_hit_rate_top_3 = (
        (top_3_retrieval_hits / total_answerable) if total_answerable > 0 else 0.0
    )
    retrieval_hit_rate_top_5 = (
        (top_5_retrieval_hits / total_answerable) if total_answerable > 0 else 0.0
    )

    # Compile the 5 worst failures per question type
    worst_failures_by_type: dict[str, list[dict[str, Any]]] = {}
    standard_types = ["single_page", "multi_page", "not_in_documents", "conflicting"]
    for st in standard_types:
        type_fails = [f for f in failures if f.get("type") == st]
        # Sort so severe errors (unsupported answers, missing conflicts, etc.) come first
        type_fails_sorted = sorted(
            type_fails,
            key=lambda x: (
                0 if not x.get("abstained") and x.get("type") == "not_in_documents" else 1,
                -len(x.get("failure_reasons", [])),
            ),
        )
        worst_failures_by_type[st] = [
            {
                "id": f.get("id"),
                "question": f.get("question"),
                "expected": f.get("expected"),
                "retrieved_pages": f.get("retrieved_pages"),
                "model_answer": f.get("model_answer"),
                "failure_reason": "; ".join(f.get("failure_reasons", [])),
            }
            for f in type_fails_sorted[:5]
        ]

    timestamp_iso = datetime.now(timezone.utc).isoformat()
    report: dict[str, Any] = {
        "timestamp": timestamp_iso,
        "label": label,
        "total_questions": tot_q,
        "by_type": summary_by_type,
        "retrieval_hit_rate_top_3": round(retrieval_hit_rate_top_3, 4),
        "retrieval_hit_rate_top_5": round(retrieval_hit_rate_top_5, 4),
        "conflict_detection_rate": round(conflict_detection_rate, 4),
        "false_positive_conflict_rate": round(fp_conflict_rate, 4),
        "latency_p50": round(p50, 4),
        "latency_p95": round(p95, 4),
        "tokens": {
            "input": total_in_tok,
            "output": total_out_tok,
            "total": total_tokens,
        },
        "cost_per_100_questions": round(cost_per_100, 4),
        "failures_count": len(failures),
        "worst_failures_by_type": worst_failures_by_type,
        "failures": failures,
    }

    # Write results JSON to evaluation/results/<label>_<timestamp>.json
    res_dir = Path(results_dir) if results_dir else project_root / "evaluation" / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    prefix = label if label else "answers"
    out_file = res_dir / f"{prefix}_{date_str}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    report["saved_to"] = str(out_file)

    if generate_markdown:
        md_file = res_dir / f"{prefix}_{date_str}.md"
        md_content = render_markdown_report(report)
        with open(md_file, "w", encoding="utf-8") as f:
            f.write(md_content)
        report["saved_to_markdown"] = str(md_file)

    return report


def render_markdown_report(report: dict[str, Any]) -> str:
    """Generate Markdown evaluation report matching all metrics and failures."""
    lines: list[str] = []
    label_str = report.get("label") or "Unlabelled"
    lines.append(f"# Answer Generation Evaluation Report: {label_str}\n")
    lines.append(f"- **Label**: `{label_str}`")
    lines.append(f"- **Timestamp**: `{report.get('timestamp')}`")
    lines.append(f"- **Total Questions Evaluated**: {report.get('total_questions')}\n")

    lines.append("## Overall Metrics\n")
    lines.append("| Metric | Value |")
    lines.append("|---|---|")
    lines.append(f"| Retrieval Hit Rate (top-3) | {report.get('retrieval_hit_rate_top_3', 0.0) * 100:.1f}% |")
    lines.append(f"| Retrieval Hit Rate (top-5) | {report.get('retrieval_hit_rate_top_5', 0.0) * 100:.1f}% |")
    lines.append(f"| Conflict Detection Rate | {report.get('conflict_detection_rate', 0.0) * 100:.1f}% |")
    lines.append(f"| False-Positive Conflict Rate | {report.get('false_positive_conflict_rate', 0.0) * 100:.1f}% |")
    lines.append(f"| Latency (p50) | {report.get('latency_p50', 0.0):.3f}s |")
    lines.append(f"| Latency (p95) | {report.get('latency_p95', 0.0):.3f}s |")
    tok = report.get("tokens", {})
    lines.append(f"| Total Tokens | {tok.get('total', 0)} (in: {tok.get('input', 0)}, out: {tok.get('output', 0)}) |")
    lines.append(f"| Cost per 100 Questions | ${report.get('cost_per_100_questions', 0.0):.4f} |\n")

    lines.append("## Metrics by Question Type\n")
    for q_type, data in report.get("by_type", {}).items():
        lines.append(f"### {q_type.upper()} (n={data.get('total', 0)})\n")
        lines.append("| Metric | Value |")
        lines.append("|---|---|")
        if q_type == "not_in_documents":
            lines.append(f"| Unsupported Answer Rate | {data.get('unsupported_answer_rate', 0.0) * 100:.1f}% |")
            lines.append(f"| Proper Abstention Rate | {data.get('abstention_rate', 0.0) * 100:.1f}% |")
        else:
            lines.append(f"| Answered Rate | {data.get('answered_rate', 0.0) * 100:.1f}% |")
            lines.append(f"| Abstained on Answerable | {data.get('abstained_on_answerable_rate', 0.0) * 100:.1f}% |")
            lines.append(f"| Cited-Page-Correct Rate | {data.get('cited_page_correct_rate', 0.0) * 100:.1f}% |")
            if q_type == "multi_page":
                lines.append(f"| Retrieved Any-Page Rate | {data.get('retrieved_any_rate', 0.0) * 100:.1f}% |")
                lines.append(f"| Retrieved All-Pages Rate | {data.get('retrieved_all_rate', 0.0) * 100:.1f}% |")
            elif q_type == "conflicting":
                lines.append(f"| Conflict Detection Rate | {data.get('conflict_detection_rate', 0.0) * 100:.1f}% |")
        lines.append("")

    lines.append("## Worst Failures by Question Type (Up to 5 per type)\n")
    worst = report.get("worst_failures_by_type", {})
    for q_type in ["single_page", "multi_page", "not_in_documents", "conflicting"]:
        lines.append(f"### {q_type.upper()}\n")
        failures_list = worst.get(q_type, [])
        if not failures_list:
            lines.append("No failures recorded for this question type.\n")
            continue

        for idx, f in enumerate(failures_list, 1):
            lines.append(f"#### Failure {idx} (ID: {f.get('id')})")
            lines.append(f"- **Question**: {f.get('question')}")
            lines.append(f"- **Expected**: {f.get('expected')}")
            lines.append(f"- **Retrieved Pages**: {f.get('retrieved_pages')}")
            lines.append(f"- **Model Answer**: {f.get('model_answer')}")
            lines.append(f"- **Failure Reason**: {f.get('failure_reason')}\n")

    return "\n".join(lines)


def print_answer_eval_report(report: dict[str, Any]):
    """Print formatted answering evaluation report and failures breakdown."""
    print("=" * 65)
    print("              ANSWER GENERATION EVALUATION REPORT")
    print("=" * 65)
    if report.get("label"):
        print(f"Run Label:                 {report['label']}")
    print(f"Total Questions Evaluated: {report['total_questions']}")
    print("-" * 65)
    for q_type, data in report.get("by_type", {}).items():
        print(f"Type: {q_type.upper()} (n={data['total']})")
        if q_type == "not_in_documents":
            print(f"  Unsupported Answer Rate:   {data['unsupported_answer_rate']*100:.1f}%")
            print(f"  Proper Abstention Rate:    {data['abstention_rate']*100:.1f}%")
        else:
            print(f"  Answered Rate:             {data['answered_rate']*100:.1f}%")
            print(f"  Abstained on Answerable:   {data['abstained_on_answerable_rate']*100:.1f}%")
            print(f"  Cited-Page-Correct Rate:   {data['cited_page_correct_rate']*100:.1f}%")
            if q_type == "multi_page":
                print(f"  Retrieved Any-Page Rate:   {data.get('retrieved_any_rate', 0.0)*100:.1f}%")
                print(f"  Retrieved All-Pages Rate:  {data.get('retrieved_all_rate', 0.0)*100:.1f}%")
            elif q_type == "conflicting":
                print(f"  Conflict Detection Rate:   {data.get('conflict_detection_rate', 0.0)*100:.1f}%")
        print()

    print("-" * 65)
    print(f"Retrieval Hit Rate (top-3):    {report.get('retrieval_hit_rate_top_3', 0.0)*100:.1f}%")
    print(f"Retrieval Hit Rate (top-5):    {report.get('retrieval_hit_rate_top_5', 0.0)*100:.1f}%")
    print(f"Conflict Detection Rate:       {report.get('conflict_detection_rate', 0.0)*100:.1f}%")
    print(f"False-Positive Conflict Rate:  {report.get('false_positive_conflict_rate', 0.0)*100:.1f}%")
    print(f"Latency: p50={report['latency_p50']:.3f}s | p95={report['latency_p95']:.3f}s")
    print(f"Tokens:  Input={report['tokens']['input']} | Output={report['tokens']['output']} | Total={report['tokens']['total']}")
    print(f"Cost:    ${report['cost_per_100_questions']:.4f} per 100 questions")
    if "saved_to" in report:
        print(f"Saved JSON:     {report['saved_to']}")
    if "saved_to_markdown" in report:
        print(f"Saved Markdown: {report['saved_to_markdown']}")
    print("=" * 65)

    worst_by_type = report.get("worst_failures_by_type", {})
    total_failures = report.get("failures_count", 0)

    print("\n" + "=" * 65)
    print(f"   WORST FAILURES BREAKDOWN (Total Failures: {total_failures})")
    print("=" * 65)

    for q_type in ["single_page", "multi_page", "not_in_documents", "conflicting"]:
        failures_list = worst_by_type.get(q_type, [])
        print(f"\n--- TYPE: {q_type.upper()} ---")
        if not failures_list:
            print("  No failures recorded.")
            continue

        for idx, f in enumerate(failures_list, 1):
            print(f"Failure {idx} (ID: {f.get('id')}):")
            print(f"  Question:        \"{f.get('question')}\"")
            print(f"  Expected:        {f.get('expected')}")
            print(f"  Retrieved Pages: {f.get('retrieved_pages')}")
            print(f"  Model Answer:    {f.get('model_answer')}")
            print(f"  Failure Reason:  {f.get('failure_reason')}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Run answer generation evaluation")
    parser.add_argument(
        "--questions",
        "-q",
        default=str(project_root / "evaluation" / "questions.json"),
        help="Path to questions JSON file (default: evaluation/questions.json)",
    )
    parser.add_argument(
        "--label",
        "-l",
        default=None,
        help="Label name for this evaluation run (required when evaluating the test set questions.json)",
    )
    parser.add_argument(
        "--markdown",
        action="store_true",
        help="Generate Markdown report in addition to JSON",
    )
    parser.add_argument(
        "--k",
        type=int,
        default=5,
        help="Number of passages to retrieve (default: 5)",
    )
    parser.add_argument(
        "--results-dir",
        default=None,
        help="Directory to save evaluation results",
    )
    parser.add_argument(
        "--sleep-between-questions",
        type=float,
        default=0.0,
        help="Seconds to sleep after each question (default: 0)",
    )
    parser.add_argument(
        "positional_questions",
        nargs="?",
        default=None,
        help=argparse.SUPPRESS,
    )

    args = parser.parse_args()

    q_path_str = args.positional_questions if args.positional_questions else args.questions
    questions_file = Path(q_path_str).resolve()

    canonical_test_set = (project_root / "evaluation" / "questions.json").resolve()
    is_test_set = questions_file.name == "questions.json" or questions_file == canonical_test_set

    if is_test_set and not args.label:
        print(
            "Error: Running the test set (questions.json) requires --label NAME (e.g. --label baseline).",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        report = evaluate_answering(
            questions_path=questions_file,
            k=args.k,
            label=args.label,
            results_dir=args.results_dir,
            generate_markdown=args.markdown,
            sleep_between_questions=args.sleep_between_questions,
        )
        print_answer_eval_report(report)
    except Exception as e:
        print(f"Error during answering evaluation: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
