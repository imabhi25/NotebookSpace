import json
from pathlib import Path
from answering.logger import log_answer


def test_log_answer_appends_json_line(tmp_path: Path):
    log_file = tmp_path / "answers.jsonl"
    log_answer(
        question="What is the exam format?",
        answer="It is multiple choice [syllabus.pdf p.1]",
        citations=[{"file": "syllabus.pdf", "page": 1}],
        abstained=False,
        reason=None,
        top_scores=[0.82, 0.75],
        tokens={"input": 120, "output": 35, "total": 155},
        latency=0.45,
        log_file=log_file,
    )

    assert log_file.exists()
    lines = log_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1

    entry = json.loads(lines[0])
    assert entry["question"] == "What is the exam format?"
    assert entry["answer"] == "It is multiple choice [syllabus.pdf p.1]"
    assert entry["citations"] == [{"file": "syllabus.pdf", "page": 1}]
    assert entry["abstained"] is False
    assert entry["reason"] is None
    assert entry["top_scores"] == [0.82, 0.75]
    assert entry["tokens"] == {"input": 120, "output": 35, "total": 155}
    assert entry["latency"] == 0.45
