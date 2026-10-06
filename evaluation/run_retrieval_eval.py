import json
import sys
from pathlib import Path
from typing import Any

# Ensure project root is in sys.path
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from db.retrieval import search


def is_source_match(expected_file: str, expected_page: int, ret_file: str, ret_page: int) -> bool:
    """Check if a retrieved source matches an expected source."""
    return (
        Path(expected_file).name.lower() == Path(ret_file).name.lower()
        and int(expected_page) == int(ret_page)
    )


def evaluate_retrieval(
    questions_path: Path | str,
    db_url: str | None = None,
    k: int = 5,
) -> dict[str, Any]:
    """
    Run retrieval evaluation over an evaluation questions dataset.

    Args:
        questions_path: Path to the JSON questions file.
        db_url: Optional database connection URL.
        k: Maximum number of chunks to retrieve (default: 5).

    Returns:
        Dictionary containing metrics, counts, and miss details.
    """
    path = Path(questions_path)
    if not path.exists():
        raise FileNotFoundError(f"Evaluation questions file not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        questions = json.load(f)

    if not isinstance(questions, list):
        raise ValueError("Questions file must contain a JSON list of question objects.")

    answerable = [
        q for q in questions
        if q.get("type") != "not_in_documents" and len(q.get("expected_sources", [])) > 0
    ]

    total_answerable = len(answerable)
    top_3_hits = 0
    top_5_hits = 0
    multi_page_total = 0
    multi_page_any_hits = 0
    multi_page_all_hits = 0
    misses: list[dict[str, Any]] = []

    for item in answerable:
        q_id = item.get("id")
        q_text = item.get("question", "")
        q_type = item.get("type", "unknown")
        expected = item.get("expected_sources", [])

        results = search(q_text, k=k, db_url=db_url)

        # Check top 3 results
        hit_top_3 = False
        for res in results[:3]:
            res_file = res["file_name"]
            res_page = res["page_number"]
            if any(is_source_match(exp["file"], exp["page"], res_file, res_page) for exp in expected):
                hit_top_3 = True
                break

        # Check top 5 results
        hit_top_5 = False
        for res in results[:5]:
            res_file = res["file_name"]
            res_page = res["page_number"]
            if any(is_source_match(exp["file"], exp["page"], res_file, res_page) for exp in expected):
                hit_top_5 = True
                break

        if hit_top_3:
            top_3_hits += 1
        if hit_top_5:
            top_5_hits += 1
        else:
            # It's a top-5 miss
            misses.append(
                {
                    "id": q_id,
                    "question": q_text,
                    "type": q_type,
                    "expected_sources": expected,
                    "retrieved": [
                        {
                            "rank": idx + 1,
                            "file": r["file_name"],
                            "page": r["page_number"],
                            "score": round(r["score"], 4),
                        }
                        for idx, r in enumerate(results[:5])
                    ],
                }
            )

        # Multi-page all vs any check in top 5
        if q_type == "multi_page" and expected:
            multi_page_total += 1
            if hit_top_5:
                multi_page_any_hits += 1
            all_found = all(
                any(is_source_match(exp["file"], exp["page"], r["file_name"], r["page_number"]) for r in results[:5])
                for exp in expected
            )
            if all_found:
                multi_page_all_hits += 1

    recall_at_3 = (top_3_hits / total_answerable) if total_answerable > 0 else 0.0
    recall_at_5 = (top_5_hits / total_answerable) if total_answerable > 0 else 0.0
    multi_page_any_rate = (multi_page_any_hits / multi_page_total) if multi_page_total > 0 else 0.0
    multi_page_all_rate = (multi_page_all_hits / multi_page_total) if multi_page_total > 0 else 0.0

    return {
        "total_questions": len(questions),
        "total_answerable": total_answerable,
        "not_in_documents_count": len(questions) - total_answerable,
        "top_3_hits": top_3_hits,
        "top_5_hits": top_5_hits,
        "recall_at_3": recall_at_3,
        "recall_at_5": recall_at_5,
        "multi_page_total": multi_page_total,
        "multi_page_any_hits": multi_page_any_hits,
        "multi_page_all_hits": multi_page_all_hits,
        "multi_page_any_rate": multi_page_any_rate,
        "multi_page_all_rate": multi_page_all_rate,
        "misses": misses,
    }


def print_eval_report(report: dict[str, Any]):
    """Print a human-readable evaluation summary report."""
    print("=" * 60)
    print("            RETRIEVAL EVALUATION REPORT")
    print("=" * 60)
    print(f"Total Questions:         {report['total_questions']}")
    print(f"Answerable Questions:    {report['total_answerable']}")
    print(f"Unanswerable Questions:  {report['not_in_documents_count']}")
    print("-" * 60)
    ans = report["total_answerable"]
    if ans > 0:
        r3_pct = report["recall_at_3"] * 100
        r5_pct = report["recall_at_5"] * 100
        print(f"Top-3 Hit Rate (Recall@3): {report['top_3_hits']}/{ans} ({r3_pct:.1f}%)")
        print(f"Top-5 Hit Rate (Recall@5): {report['top_5_hits']}/{ans} ({r5_pct:.1f}%)")
    else:
        print("No answerable questions in the dataset.")

    mp_total = report.get("multi_page_total", 0)
    if mp_total > 0:
        mp_any = report.get("multi_page_any_hits", 0)
        mp_all = report.get("multi_page_all_hits", 0)
        mp_any_pct = report.get("multi_page_any_rate", 0.0) * 100
        mp_all_pct = report.get("multi_page_all_rate", 0.0) * 100
        print("-" * 60)
        print(f"Multi-Page Questions ({mp_total}):")
        print(f"  Any-Page Hit Rate:       {mp_any}/{mp_total} ({mp_any_pct:.1f}%)")
        print(f"  All-Expected-Pages Rate: {mp_all}/{mp_total} ({mp_all_pct:.1f}%)")
    print("=" * 60)

    misses = report.get("misses", [])
    if misses:
        print(f"\nMISSES ({len(misses)} questions where expected page was not in Top 5):")
        for idx, miss in enumerate(misses, start=1):
            print(f"\n[Miss #{idx}] ID: {miss['id']} | Type: {miss['type']}")
            print(f"Question: \"{miss['question']}\"")
            print("Expected Sources:")
            for exp in miss["expected_sources"]:
                print(f"  - {exp.get('file')}, Page {exp.get('page')}")
            print("Retrieved Chunks:")
            if not miss["retrieved"]:
                print("  (None retrieved)")
            for r in miss["retrieved"]:
                print(f"  {r['rank']}. {r['file']}, Page {r['page']} (similarity score: {r['score']})")
    else:
        print("\nAll answerable questions had at least one expected page in the Top 5 results!")


def main():
    default_questions = project_root / "evaluation" / "questions.json"
    questions_file = Path(sys.argv[1]) if len(sys.argv) > 1 else default_questions

    try:
        report = evaluate_retrieval(questions_file)
        print_eval_report(report)
    except Exception as e:
        print(f"Error executing evaluation: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
