import io
from pathlib import Path
import pytest
from reportlab.pdfgen import canvas

from answering.answer import answer_question
from answering.llm import FakeLLMClient
from db.store import delete_document
from ingestion.pipeline import ingest_pdf


@pytest.fixture(scope="module")
def seeded_answering_doc():
    file_name = "answering_test_syllabus.pdf"
    delete_document(file_name)

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)
    # Page 1
    c.drawString(100, 750, "Course Grading: Midterm 40 percent, Final exam 60 percent.")
    c.showPage()
    # Page 2
    c.drawString(100, 750, "Office hours are Wednesdays 1pm to 3pm in room CS-101.")
    c.showPage()
    c.save()
    buffer.seek(0)

    ingest_pdf(buffer, file_name=file_name)
    yield file_name
    delete_document(file_name)


def test_normal_cited_answer(seeded_answering_doc: str, tmp_path: Path):
    """Test standard successful answering with valid citation."""
    fake_json = (
        '{"supported": true, '
        f'"answer": "Office hours are on Wednesdays [answering_test_syllabus.pdf p.2].", '
        f'"citations": [{{"file": "{seeded_answering_doc}", "page": 2}}]}}'
    )
    client = FakeLLMClient(default_response=fake_json, cache_dir=tmp_path / "cache")

    res = answer_question("When are office hours?", k=3, llm_client=client)

    assert res["abstained"] is False
    assert res["abstain_reason"] is None
    assert "Wednesdays" in res["answer"]
    assert len(res["citations"]) == 1
    assert res["citations"][0]["file"] == seeded_answering_doc
    assert res["citations"][0]["page"] == 2
    assert res["tokens"]["input"] > 0
    assert res["tokens"]["output"] > 0
    assert res["latency"] >= 0.0


def test_not_found_abstention(seeded_answering_doc: str, tmp_path: Path):
    """Test model declaring NOT_FOUND converts to proper abstention."""
    fake_json = '{"supported": false, "answer": "NOT_FOUND", "citations": []}'
    client = FakeLLMClient(default_response=fake_json, cache_dir=tmp_path / "cache")

    res = answer_question("What is the exact date of the final exam?", k=3, llm_client=client)

    assert res["abstained"] is True
    assert res["abstain_reason"] == "not_found"
    assert res["answer"] == "NOT_FOUND"
    assert res["citations"] == []


def test_invalid_citation_rejection_empty(seeded_answering_doc: str, tmp_path: Path):
    """Test model providing supported answer with empty citations is rejected."""
    fake_json = '{"supported": true, "answer": "Midterm is 40 percent", "citations": []}'
    client = FakeLLMClient(default_response=fake_json, cache_dir=tmp_path / "cache")

    res = answer_question("What is the midterm weight?", k=3, llm_client=client)

    assert res["abstained"] is True
    assert res["abstain_reason"] == "invalid_citation"
    assert res["citations"] == []


def test_invalid_citation_rejection_hallucinated_page(seeded_answering_doc: str, tmp_path: Path):
    """Test citation pointing to a page/file not retrieved is rejected."""
    fake_json = (
        '{"supported": true, '
        '"answer": "Midterm is 40 percent", '
        f'"citations": [{{"file": "{seeded_answering_doc}", "page": 99}}]}}'
    )
    client = FakeLLMClient(default_response=fake_json, cache_dir=tmp_path / "cache")

    res = answer_question("What is the midterm weight?", k=3, llm_client=client)

    assert res["abstained"] is True
    assert res["abstain_reason"] == "invalid_citation"


def test_bad_json_retry_success(seeded_answering_doc: str, tmp_path: Path):
    """Test retry once when initial model output is not valid JSON."""
    bad_output = "I am a helpful assistant: the midterm is 40%."
    good_json = (
        '{"supported": true, '
        '"answer": "Midterm is 40 percent [answering_test_syllabus.pdf p.1].", '
        f'"citations": [{{"file": "{seeded_answering_doc}", "page": 1}}]}}'
    )
    client = FakeLLMClient(
        responses=[bad_output, good_json],
        cache_dir=tmp_path / "cache",
    )

    res = answer_question("What is the midterm weight?", k=3, llm_client=client)

    assert res["abstained"] is False
    assert res["abstain_reason"] == None
    assert client.call_count == 2


def test_bad_json_retry_then_abstain(seeded_answering_doc: str, tmp_path: Path):
    """Test model failing JSON parse on both attempts results in bad_output abstention."""
    bad_output_1 = "This is not valid json."
    bad_output_2 = "Still not valid json."
    client = FakeLLMClient(
        responses=[bad_output_1, bad_output_2],
        cache_dir=tmp_path / "cache",
    )

    res = answer_question("What is the midterm weight?", k=3, llm_client=client)

    assert res["abstained"] is True
    assert res["abstain_reason"] == "bad_output"
    assert res["citations"] == []
    assert client.call_count == 2


def test_low_score_pre_check(monkeypatch, tmp_path: Path):
    """Test that low similarity score pre-check abstains without calling the LLM."""
    monkeypatch.setenv("SUPPORT_MIN_SCORE", "0.99")  # Unreachably high threshold
    client = FakeLLMClient(default_response="{}", cache_dir=tmp_path / "cache")

    res = answer_question("Completely unrelated query about space travel", k=3, llm_client=client)

    assert res["abstained"] is True
    assert res["abstain_reason"] == "low_retrieval_score"
    assert res["tokens"]["total"] == 0
    assert client.call_count == 0  # Did not call the model!


def test_latency_uses_recorded_model_latency_on_cache_hit(tmp_path, monkeypatch):
    from answering import answer as ans
    from answering.llm import LLMResponse

    class Stub:
        def generate(self, system, user):
            return LLMResponse(
                text='{"supported": true, "answer": "x [a.pdf p.1]", "citations": [{"file": "a.pdf", "page": 1}]}',
                input_tokens=10,
                output_tokens=5,
                latency_seconds=2.5,
            )

    monkeypatch.setattr(
        ans, "search",
        lambda q, k=5, db_url=None: [
            {"file_name": "a.pdf", "page_number": 1, "text": "t", "score": 0.9}
        ],
    )
    out = ans.answer_question("q", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert out["latency"] >= 2.5


def test_conflict_detection_two_distinct_files(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    mock_retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Due Oct 10", "score": 0.9, "upload_date": "2026-09-01T10:00:00"},
        {"file_name": "assignment.pdf", "page_number": 2, "text": "Due Oct 15", "score": 0.88, "upload_date": "2026-09-05T12:00:00"},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: mock_retrieved)

    conflict_json = (
        '{"supported": true, '
        '"answer": "Syllabus says Oct 10 [syllabus.pdf p.1], but assignment says Oct 15 [assignment.pdf p.2].", '
        '"citations": [{"file": "syllabus.pdf", "page": 1}, {"file": "assignment.pdf", "page": 2}], '
        '"conflicts": [{'
        '  "topic": "Due Date", '
        '  "claims": ['
        '    {"file": "syllabus.pdf", "page": 1, "value": "October 10"}, '
        '    {"file": "assignment.pdf", "page": 2, "value": "October 15"}'
        '  ]'
        '}]}'
    )

    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=conflict_json, input_tokens=10, output_tokens=10, latency_seconds=0.5)

    res = ans.answer_question("When is it due?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")

    assert res["abstained"] is False
    assert res["conflict_detected"] is True
    assert len(res["conflicts"]) == 1
    conflict = res["conflicts"][0]
    assert conflict["topic"] == "Due Date"
    assert len(conflict["claims"]) == 2
    assert conflict["claims"][0]["file"] == "syllabus.pdf"
    assert conflict["claims"][0]["upload_date"] == "2026-09-01T10:00:00"
    assert conflict["claims"][1]["file"] == "assignment.pdf"
    assert conflict["claims"][1]["upload_date"] == "2026-09-05T12:00:00"


def test_conflict_dropped_when_single_file(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    mock_retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Midterm 40%", "score": 0.9, "upload_date": "2026-09-01T10:00:00"},
        {"file_name": "syllabus.pdf", "page_number": 2, "text": "Midterm 50%", "score": 0.88, "upload_date": "2026-09-01T10:00:00"},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: mock_retrieved)

    # Conflict has 2 claims, but both from syllabus.pdf -> must be dropped
    conflict_json = (
        '{"supported": true, '
        '"answer": "Midterm is 40% [syllabus.pdf p.1] or 50% [syllabus.pdf p.2].", '
        '"citations": [{"file": "syllabus.pdf", "page": 1}, {"file": "syllabus.pdf", "page": 2}], '
        '"conflicts": [{'
        '  "topic": "Midterm weight", '
        '  "claims": ['
        '    {"file": "syllabus.pdf", "page": 1, "value": "40%"}, '
        '    {"file": "syllabus.pdf", "page": 2, "value": "50%"}'
        '  ]'
        '}]}'
    )

    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=conflict_json, input_tokens=10, output_tokens=10, latency_seconds=0.5)

    res = ans.answer_question("What is the midterm weight?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")

    assert res["abstained"] is False
    assert res["conflict_detected"] is False
    assert res["conflicts"] == []


def test_conflict_dropped_when_hallucinated_page(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    mock_retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Due Oct 10", "score": 0.9, "upload_date": "2026-09-01T10:00:00"},
        {"file_name": "assignment.pdf", "page_number": 2, "text": "Due Oct 15", "score": 0.88, "upload_date": "2026-09-05T12:00:00"},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: mock_retrieved)

    # Claim points to assignment.pdf page 99 (not in retrieved passages) -> must be dropped
    conflict_json = (
        '{"supported": true, '
        '"answer": "Due date mentioned [syllabus.pdf p.1].", '
        '"citations": [{"file": "syllabus.pdf", "page": 1}], '
        '"conflicts": [{'
        '  "topic": "Due Date", '
        '  "claims": ['
        '    {"file": "syllabus.pdf", "page": 1, "value": "October 10"}, '
        '    {"file": "assignment.pdf", "page": 99, "value": "October 15"}'
        '  ]'
        '}]}'
    )

    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=conflict_json, input_tokens=10, output_tokens=10, latency_seconds=0.5)

    res = ans.answer_question("When is it due?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")

    assert res["abstained"] is False
    assert res["conflict_detected"] is False
    assert res["conflicts"] == []


def test_conflict_dropped_when_insufficient_claims(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    mock_retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Due Oct 10", "score": 0.9, "upload_date": "2026-09-01T10:00:00"},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: mock_retrieved)

    # Only 1 claim in conflict -> must be dropped
    conflict_json = (
        '{"supported": true, '
        '"answer": "Due date mentioned [syllabus.pdf p.1].", '
        '"citations": [{"file": "syllabus.pdf", "page": 1}], '
        '"conflicts": [{'
        '  "topic": "Due Date", '
        '  "claims": ['
        '    {"file": "syllabus.pdf", "page": 1, "value": "October 10"}'
        '  ]'
        '}]}'
    )

    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=conflict_json, input_tokens=10, output_tokens=10, latency_seconds=0.5)

    res = ans.answer_question("When is it due?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")

    assert res["abstained"] is False
    assert res["conflict_detected"] is False
    assert res["conflicts"] == []


import pytest


@pytest.mark.parametrize(
    "v1,v2",
    [("October 10", "october  10"), ("", "October 15"), ("  ", "  ")],
)
def test_conflict_dropped_when_values_do_not_differ(monkeypatch, tmp_path, v1, v2):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "a.pdf", "page_number": 1, "text": "x", "score": 0.9},
        {"file_name": "b.pdf", "page_number": 1, "text": "y", "score": 0.8},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = (
        '{"supported": true, "answer": "x [a.pdf p.1]", '
        '"citations": [{"file": "a.pdf", "page": 1}], '
        '"conflicts": [{"topic": "T", "claims": ['
        '{"file": "a.pdf", "page": 1, "value": "%s"}, '
        '{"file": "b.pdf", "page": 1, "value": "%s"}]}]}' % (v1, v2)
    )

    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=1, output_tokens=1, latency_seconds=0.1)

    res = ans.answer_question("q", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert res["conflict_detected"] is False
    assert res["conflicts"] == []


def test_conflict_resolution_valid_kept(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Oct 10", "score": 0.9},
        {"file_name": "announcement.pdf", "page_number": 1, "text": "Oct 15", "score": 0.88},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = """{
        "supported": true,
        "answer": "Syllabus says Oct 10 [syllabus.pdf p.1], announcement updates to Oct 15 [announcement.pdf p.1].",
        "citations": [{"file": "announcement.pdf", "page": 1}],
        "conflicts": [
            {
                "topic": "Due Date",
                "claims": [
                    {"file": "syllabus.pdf", "page": 1, "value": "October 10"},
                    {"file": "announcement.pdf", "page": 1, "value": "October 15"}
                ],
                "resolution": {
                    "current_file": "announcement.pdf",
                    "current_page": 1,
                    "basis": "explicit_supersede",
                    "evidence": "Announcement updates the deadline to October 15"
                }
            }
        ]
    }"""
    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=10, output_tokens=10, latency_seconds=0.1)

    res = ans.answer_question("When is it due?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert res["conflict_detected"] is True
    assert len(res["conflicts"]) == 1
    conf = res["conflicts"][0]
    assert conf["resolution"] is not None
    assert conf["resolution"]["current_file"] == "announcement.pdf"
    assert conf["resolution"]["basis"] == "explicit_supersede"
    assert "updates" in conf["resolution"]["evidence"]


def test_conflict_resolution_unrelated_file_dropped(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Oct 10", "score": 0.9},
        {"file_name": "announcement.pdf", "page_number": 1, "text": "Oct 15", "score": 0.88},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = """{
        "supported": true,
        "answer": "Syllabus says Oct 10 [syllabus.pdf p.1], announcement says Oct 15 [announcement.pdf p.1].",
        "citations": [{"file": "announcement.pdf", "page": 1}],
        "conflicts": [
            {
                "topic": "Due Date",
                "claims": [
                    {"file": "syllabus.pdf", "page": 1, "value": "October 10"},
                    {"file": "announcement.pdf", "page": 1, "value": "October 15"}
                ],
                "resolution": {
                    "current_file": "unrelated_doc.pdf",
                    "current_page": 1,
                    "basis": "explicit_supersede",
                    "evidence": "Fake evidence"
                }
            }
        ]
    }"""
    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=10, output_tokens=10, latency_seconds=0.1)

    res = ans.answer_question("When is it due?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert res["conflict_detected"] is True
    assert len(res["conflicts"]) == 1
    conf = res["conflicts"][0]
    assert conf["resolution"] is None


def test_conflict_resolution_null_ok(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Oct 10", "score": 0.9},
        {"file_name": "announcement.pdf", "page_number": 1, "text": "Oct 15", "score": 0.88},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = """{
        "supported": true,
        "answer": "Syllabus says Oct 10 [syllabus.pdf p.1], announcement says Oct 15 [announcement.pdf p.1].",
        "citations": [{"file": "announcement.pdf", "page": 1}],
        "conflicts": [
            {
                "topic": "Due Date",
                "claims": [
                    {"file": "syllabus.pdf", "page": 1, "value": "October 10"},
                    {"file": "announcement.pdf", "page": 1, "value": "October 15"}
                ],
                "resolution": null
            }
        ]
    }"""
    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=10, output_tokens=10, latency_seconds=0.1)

    res = ans.answer_question("When is it due?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert res["conflict_detected"] is True
    assert len(res["conflicts"]) == 1
    assert res["conflicts"][0]["resolution"] is None


def test_conflict_resolution_bad_basis_dropped(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Oct 10", "score": 0.9},
        {"file_name": "announcement.pdf", "page_number": 1, "text": "Oct 15", "score": 0.88},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = """{
        "supported": true,
        "answer": "Syllabus says Oct 10 [syllabus.pdf p.1], announcement says Oct 15 [announcement.pdf p.1].",
        "citations": [{"file": "announcement.pdf", "page": 1}],
        "conflicts": [
            {
                "topic": "Due Date",
                "claims": [
                    {"file": "syllabus.pdf", "page": 1, "value": "October 10"},
                    {"file": "announcement.pdf", "page": 1, "value": "October 15"}
                ],
                "resolution": {
                    "current_file": "announcement.pdf",
                    "current_page": 1,
                    "basis": "guessing_randomly",
                    "evidence": "I guessed"
                }
            }
        ]
    }"""
    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=10, output_tokens=10, latency_seconds=0.1)

    res = ans.answer_question("When is it due?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert res["conflict_detected"] is True
    assert len(res["conflicts"]) == 1
    assert res["conflicts"][0]["resolution"] is None


def test_conventions_valid_and_mismatch_detected(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "lecture_03.pdf", "page_number": 1, "text": "Arrays start at 1.", "score": 0.9},
        {"file_name": "tutorial_02.pdf", "page_number": 2, "text": "Arrays start at 0.", "score": 0.88},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = """{
        "supported": true,
        "answer": "Tutorial uses 0-indexed arrays [tutorial_02.pdf p.2] while lecture uses 1-indexed [lecture_03.pdf p.1].",
        "citations": [{"file": "tutorial_02.pdf", "page": 2}],
        "conflicts": [],
        "conventions": [
            {
                "topic": "array_indexing",
                "value": "1-indexed",
                "file": "lecture_03.pdf",
                "page": 1,
                "adopted": false
            },
            {
                "topic": "array_indexing",
                "value": "0-indexed",
                "file": "tutorial_02.pdf",
                "page": 2,
                "adopted": true
            }
        ]
    }"""
    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=10, output_tokens=10, latency_seconds=0.1)

    res = ans.answer_question("How are arrays indexed?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert len(res["conventions"]) == 2
    assert len(res["convention_mismatches"]) == 1
    mismatch = res["convention_mismatches"][0]
    assert mismatch["topic"] == "array_indexing"
    assert mismatch["adopted_file"] == "tutorial_02.pdf"
    assert mismatch["adopted_value"] == "0-indexed"


def test_conventions_unretrieved_file_dropped(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "lecture_03.pdf", "page_number": 1, "text": "Arrays start at 1.", "score": 0.9},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = """{
        "supported": true,
        "answer": "Arrays start at 1 [lecture_03.pdf p.1].",
        "citations": [{"file": "lecture_03.pdf", "page": 1}],
        "conflicts": [],
        "conventions": [
            {
                "topic": "array_indexing",
                "value": "0-indexed",
                "file": "phantom_file.pdf",
                "page": 99,
                "adopted": true
            }
        ]
    }"""
    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=10, output_tokens=10, latency_seconds=0.1)

    res = ans.answer_question("How are arrays indexed?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert len(res["conventions"]) == 0
    assert len(res["convention_mismatches"]) == 0


def test_normalize_convention_value_helper():
    from answering.notebook_answer import normalize_convention_value

    # array_indexing
    for zero_val in ["0-indexed", "0-based", "zero-indexed", "zero-based", "0", "zero", "0_indexed"]:
        assert normalize_convention_value("array_indexing", zero_val) == "0"
    for one_val in ["1-indexed", "1-based", "one-indexed", "one-based", "1", "one", "1_indexed"]:
        assert normalize_convention_value("array_indexing", one_val) == "1"

    # log_base
    for base2_val in ["2", "base 2", "log2", "log_2", "lg", "binary", "binary logarithm"]:
        assert normalize_convention_value("log_base", base2_val) == "2"
    for base_e_val in ["e", "base e", "ln", "natural", "natural log"]:
        assert normalize_convention_value("log_base", base_e_val) == "e"
    for base10_val in ["10", "base 10", "log10", "common", "decimal"]:
        assert normalize_convention_value("log_base", base10_val) == "10"

    # other topics normalized with whitespace/case
    assert normalize_convention_value("other", "Some convention") == "some convention"


def test_conventions_normalization_avoids_false_mismatch(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "lecture_03.pdf", "page_number": 1, "text": "Arrays start at 0.", "score": 0.9},
        {"file_name": "tutorial_02.pdf", "page_number": 2, "text": "Arrays are zero-based.", "score": 0.88},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = """{
        "supported": true,
        "answer": "Arrays are 0-indexed [lecture_03.pdf p.1] [tutorial_02.pdf p.2].",
        "citations": [{"file": "lecture_03.pdf", "page": 1}, {"file": "tutorial_02.pdf", "page": 2}],
        "conflicts": [],
        "conventions": [
            {
                "topic": "array_indexing",
                "value": "0-indexed",
                "file": "lecture_03.pdf",
                "page": 1,
                "adopted": false
            },
            {
                "topic": "array_indexing",
                "value": "zero-based",
                "file": "tutorial_02.pdf",
                "page": 2,
                "adopted": true
            }
        ]
    }"""
    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=10, output_tokens=10, latency_seconds=0.1)

    res = ans.answer_question("How are arrays indexed?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert len(res["conventions"]) == 2
    # Because "0-indexed" and "zero-based" normalize to "0", NO mismatch should be flagged
    assert len(res["convention_mismatches"]) == 0
    # Original values are preserved in conventions for display
    assert res["conventions"][0]["value"] == "0-indexed"
    assert res["conventions"][1]["value"] == "zero-based"


def test_conventions_normalization_triggers_mismatch_and_preserves_display(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "lecture_03.pdf", "page_number": 1, "text": "Use log2.", "score": 0.9},
        {"file_name": "tutorial_02.pdf", "page_number": 2, "text": "Use ln.", "score": 0.88},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = """{
        "supported": true,
        "answer": "Lecture uses log2 [lecture_03.pdf p.1], tutorial uses natural log ln [tutorial_02.pdf p.2].",
        "citations": [{"file": "lecture_03.pdf", "page": 1}, {"file": "tutorial_02.pdf", "page": 2}],
        "conflicts": [],
        "conventions": [
            {
                "topic": "log_base",
                "value": "log2 (binary)",
                "file": "lecture_03.pdf",
                "page": 1,
                "adopted": false
            },
            {
                "topic": "log_base",
                "value": "natural ln",
                "file": "tutorial_02.pdf",
                "page": 2,
                "adopted": true
            }
        ]
    }"""
    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=10, output_tokens=10, latency_seconds=0.1)

    res = ans.answer_question("What log base is used?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert len(res["conventions"]) == 2
    assert len(res["convention_mismatches"]) == 1
    mismatch = res["convention_mismatches"][0]
    assert mismatch["topic"] == "log_base"
    # Original values preserved for display
    assert mismatch["adopted_file"] == "tutorial_02.pdf"
    assert mismatch["adopted_value"] == "natural ln"
    assert res["conventions"][0]["value"] == "log2 (binary)"
    assert res["conventions"][1]["value"] == "natural ln"


def test_conventions_topic_other_skips_mismatch(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "lecture_03.pdf", "page_number": 1, "text": "Style guide A.", "score": 0.9},
        {"file_name": "tutorial_02.pdf", "page_number": 2, "text": "Style guide B.", "score": 0.88},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = """{
        "supported": true,
        "answer": "Lecture uses style A [lecture_03.pdf p.1], tutorial uses style B [tutorial_02.pdf p.2].",
        "citations": [{"file": "lecture_03.pdf", "page": 1}, {"file": "tutorial_02.pdf", "page": 2}],
        "conflicts": [],
        "conventions": [
            {
                "topic": "other",
                "value": "Style A",
                "file": "lecture_03.pdf",
                "page": 1,
                "adopted": false
            },
            {
                "topic": "other",
                "value": "Style B",
                "file": "tutorial_02.pdf",
                "page": 2,
                "adopted": true
            }
        ]
    }"""
    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=10, output_tokens=10, latency_seconds=0.1)

    res = ans.answer_question("What style is used?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    # Conventions are preserved
    assert len(res["conventions"]) == 2
    # But mismatch detection is skipped for topic "other"
    assert len(res["convention_mismatches"]) == 0


def test_conflict_resolution_page_corrected_to_claim_page(monkeypatch, tmp_path):
    from answering import answer as ans
    from answering.llm import LLMResponse

    retrieved = [
        {"file_name": "syllabus.pdf", "page_number": 1, "text": "Midterm is 30%", "score": 0.9},
        {"file_name": "announcement.pdf", "page_number": 2, "text": "Midterm is 40% per update.", "score": 0.9},
    ]
    monkeypatch.setattr(ans, "search", lambda q, k=5, db_url=None: retrieved)
    payload = """{
        "supported": true,
        "answer": "Syllabus says 30% [syllabus.pdf p.1], announcement says 40% [announcement.pdf p.2].",
        "citations": [{"file": "syllabus.pdf", "page": 1}, {"file": "announcement.pdf", "page": 2}],
        "conflicts": [
            {
                "topic": "Midterm Weight",
                "claims": [
                    {"file": "syllabus.pdf", "page": 1, "value": "30%"},
                    {"file": "announcement.pdf", "page": 2, "value": "40%"}
                ],
                "resolution": {
                    "current_file": "announcement.pdf",
                    "current_page": 99,
                    "basis": "explicit_supersede",
                    "evidence": "Announcement says per update."
                }
            }
        ]
    }"""
    class Stub:
        def generate(self, system, user):
            return LLMResponse(text=payload, input_tokens=10, output_tokens=10, latency_seconds=0.1)

    res = ans.answer_question("What is the midterm weight?", llm_client=Stub(), log_file=tmp_path / "log.jsonl")
    assert len(res["conflicts"]) == 1
    res_obj = res["conflicts"][0]["resolution"]
    assert res_obj is not None
    assert res_obj["current_file"] == "announcement.pdf"
    # Even though LLM returned current_page: 99, it should be corrected to matching claim's page (2)
    assert res_obj["current_page"] == 2

