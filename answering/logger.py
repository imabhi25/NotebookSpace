from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any

DEFAULT_LOG_PATH = "logs/answers.jsonl"


def log_answer(
    question: str,
    answer: str,
    citations: list[dict[str, Any]],
    abstained: bool,
    reason: str | None,
    top_scores: list[float],
    tokens: dict[str, int],
    latency: float,
    conflicts: list[dict[str, Any]] | None = None,
    conflict_detected: bool = False,
    log_file: Path | str | None = None,
) -> None:
    """
    Append one JSON line per answered question to logs/answers.jsonl.
    Feeds cost, latency, and quality metrics.
    """
    path_str = log_file or os.getenv("ANSWERS_LOG_PATH", DEFAULT_LOG_PATH)
    path = Path(path_str)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "question": question,
            "answer": answer,
            "citations": citations,
            "conflicts": conflicts or [],
            "conflict_detected": conflict_detected,
            "abstained": abstained,
            "reason": reason,
            "top_scores": [round(float(s), 4) for s in top_scores],
            "tokens": tokens,
            "latency": round(float(latency), 4),
        }
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception:
        # Logging failure should not disrupt the answering flow
        pass
