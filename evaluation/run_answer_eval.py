from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
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


def evaluate_answering(
    questions_path: Path | str,
    llm_client: LLMClient | None = None,
    db_url: str | None = None,
    k: int = 5,
    results_dir: Path | str | None = None,
) -> dict[str, Any]:
    """
    Run answer evaluation across questions dataset.

    Args:
        questions_path: Path to questions JSON.
        llm_client: Optional LLMClient to use (e.g. FakeLLMClient in tests).
        db_url: Optional database connection URL.
        k: Number of passages to retrieve.
        results_dir: Directory to save results JSON.

    Returns:
        Evaluation report dictionary.
    """
    path = Path(questions_path)
    if not path.exists():
        raise FileNotFoundError(f"Questions file not found: {path}")

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
                    # Check multi-page retrieval all vs any
                    any_ret = any(
                        is_source_match(exp["file"], exp["page"], r["file_name"], r["page_number"])
                        for exp in expected_sources
                        for r in retrieved[:k]
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
                    missing = [c for c in expected_contains if c.lower() not in answer_lower]
                    if missing:
                        question_failures.append(f"Answer missing expected phrase(s): {missing}")

        if question_failures:
            failures.append(
                {
                    "id": q_id,
                    "question": q_text,
                    "type": q_type,
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

    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_questions": tot_q,
        "by_type": summary_by_type,
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
        "failures": failures,
    }

    # Write results to evaluation/results/answers_<date>.json
    res_dir = Path(results_dir) if results_dir else project_root / "evaluation" / "results"
    res_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_file = res_dir / f"answers_{date_str}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    report["saved_to"] = str(out_file)

    return report


def print_answer_eval_report(report: dict[str, Any]):
    """Print formatted answering evaluation report and failures list."""
    print("=" * 65)
    print("              ANSWER GENERATION EVALUATION REPORT")
    print("=" * 65)
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
    print(f"Conflict Detection Rate:       {report.get('conflict_detection_rate', 0.0)*100:.1f}%")
    print(f"False-Positive Conflict Rate:  {report.get('false_positive_conflict_rate', 0.0)*100:.1f}%")
    print(f"Latency: p50={report['latency_p50']:.3f}s | p95={report['latency_p95']:.3f}s")
    print(f"Tokens:  Input={report['tokens']['input']} | Output={report['tokens']['output']} | Total={report['tokens']['total']}")
    print(f"Cost:    ${report['cost_per_100_questions']:.4f} per 100 questions")
    if "saved_to" in report:
        print(f"Output:  {report['saved_to']}")
    print("=" * 65)

    failures = report.get("failures", [])
    if failures:
        print(f"\nFAILURES LIST ({len(failures)}):")
        for f in failures:
            print(f"\n[ID: {f['id']}] ({f['type']})")
            print(f"Question: \"{f['question']}\"")
            for fail_desc in f["failures"]:
                print(f"  - {fail_desc}")
            if f.get("abstained"):
                print(f"  State: Abstained (reason: {f.get('abstain_reason')})")
            else:
                print(f"  Answer: {f.get('answer')}")
                print(f"  Citations: {f.get('citations')}")
    else:
        print("\nAll evaluation questions passed criteria!")


def main():
    default_questions = project_root / "evaluation" / "questions.json"
    questions_file = Path(sys.argv[1]) if len(sys.argv) > 1 else default_questions

    try:
        report = evaluate_answering(questions_file)
        print_answer_eval_report(report)
    except Exception as e:
        print(f"Error during answering evaluation: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
