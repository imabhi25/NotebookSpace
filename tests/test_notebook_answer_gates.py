"""The notebook answering pipeline has no similarity or citation-tag refusal gates.

Storage is monkeypatched, so these run without a database (they skip when psycopg is not installed).
"""
import json

import pytest

pytest.importorskip("psycopg")

import answering.notebook_answer as na  # noqa: E402
import db.notebook_store as store  # noqa: E402
from answering.llm import FakeLLMClient  # noqa: E402

CHUNK = {
    "id": 1, "source_id": "src-1", "file": "notes.pdf", "file_name": "notes.pdf", "title": "notes.pdf",
    "page": 2, "page_number": 2, "text": "Entropy never decreases in an isolated system.",
    "score": 0.05, "similarity_score": 0.05, "source_version": 1, "matched_terms": [],
}


@pytest.fixture
def env(monkeypatch):
    state = {"messages": [], "saved": [], "retrieval_queries": []}

    def fake_save(**kw):
        msg = {"id": f"m{len(state['saved'])}", **kw}
        state["saved"].append(msg)
        return msg

    def fake_search(question, **kw):
        state["retrieval_queries"].append(question)
        return [dict(CHUNK)]

    monkeypatch.setattr(na, "save_message", fake_save)
    monkeypatch.setattr(na, "search_scoped", fake_search)
    monkeypatch.setattr(na, "get_messages_for_conversation", lambda **kw: list(state["messages"]))
    monkeypatch.setattr(na, "get_sources_for_subject", lambda **kw: [])
    monkeypatch.setattr(store, "delete_message", lambda **kw: True)
    return state


def ask(question, reply, **kw):
    client = FakeLLMClient(responses=list(reply) if isinstance(reply, (list, tuple)) else [reply])
    return na.answer_notebook_question(
        question=question, conversation_id="c1", user_id="u1", subject_id="s1",
        selected_source_ids=["src-1"], llm_client=client, **kw,
    )


def test_low_similarity_score_still_reaches_the_model(env):
    reply = json.dumps({"supported": True, "answer": "Because entropy never decreases [notes.pdf p.2].",
                        "citations": [{"file": "notes.pdf", "page": 2}], "conflicts": []})
    res = ask("why", reply)
    assert res["abstained"] is False and "entropy" in res["content"]


def test_untagged_grounded_answer_gets_top_passage_as_citation(env):
    reply = json.dumps({"supported": True, "answer": "It follows from the second law.", "citations": [], "conflicts": []})
    res = ask("explain the second one", reply)
    assert res["abstained"] is False
    assert res["citations"][0]["source_id"] == "src-1" and res["citations"][0]["page"] == 2


def test_general_explanation_is_kept_without_citations(env):
    reply = json.dumps({"supported": False, "answer": "Heat flows from hot to cold, which is why.", "citations": [], "conflicts": []})
    res = ask("why?", reply)
    assert res["abstained"] is False and res["citations"] == []


def test_prose_reply_is_kept_instead_of_bad_output(env):
    res = ask("what about heat", ["Heat is energy in transit.", "Heat is energy in transit."])  # JSON is retried once
    assert res["abstained"] is False and res["content"] == "Heat is energy in transit."


def test_explicit_not_found_from_the_model_still_abstains(env):
    res = ask("hello", json.dumps({"supported": False, "answer": "NOT_FOUND", "citations": []}))
    assert res["abstained"] is True and res["abstain_reason"] == "not_found"


def test_short_followup_uses_recent_conversation(env):
    env["messages"] = [
        {"id": "u0", "role": "user", "content": "What is entropy?", "created_at": "2026-01-01T00:00:00+00:00"},
        {"id": "a0", "role": "assistant", "content": "A measure of disorder.", "created_at": "2026-01-01T00:00:01+00:00",
         "abstained": False, "retrieved": [dict(CHUNK, id=9)]},
    ]
    ask("why", json.dumps({"supported": True, "answer": "ok [notes.pdf p.2]", "citations": [{"file": "notes.pdf", "page": 2}]}))
    assert "What is entropy?" in env["retrieval_queries"][0]


def test_retry_replaces_the_turn_in_place(env):
    env["messages"] = [
        {"id": "u0", "role": "user", "content": "Q1", "created_at": "2026-01-01T00:00:00+00:00"},
        {"id": "a0", "role": "assistant", "content": "NOT_FOUND", "created_at": "2026-01-01T00:00:01+00:00", "abstained": True, "retrieved": []},
        {"id": "u1", "role": "user", "content": "Q2", "created_at": "2026-01-01T00:00:02+00:00"},
    ]
    reply = json.dumps({"supported": True, "answer": "Better [notes.pdf p.2]", "citations": [{"file": "notes.pdf", "page": 2}]})
    ask("Q1", reply, is_retry=True, retry_message_id="a0")
    assistant = [m for m in env["saved"] if m["role"] == "assistant"][-1]
    assert assistant["created_at"] == "2026-01-01T00:00:01+00:00"


def test_conceptual_question_with_c_sources_does_not_abstain(monkeypatch, env):
    c_chunk = {
        "id": 10, "source_id": "src-c", "file": "c_strings.pdf", "file_name": "c_strings.pdf",
        "title": "c_strings.pdf", "page": 1, "page_number": 1,
        "text": "Assignment 2: int strgLen( char *s ) returns the number of characters in string s. Include <string.h>.",
        "score": 0.85, "similarity_score": 0.85, "source_version": 1, "matched_terms": ["strglen"],
    }
    monkeypatch.setattr(na, "search_scoped", lambda *a, **kw: [c_chunk])

    reply = json.dumps({
        "supported": True,
        "answer": "In C programming, strings are represented as null-terminated character arrays (char *s). The strgLen function calculates the length by traversing until the null character '\\0' [c_strings.pdf p.1].",
        "citations": [{"file": "c_strings.pdf", "page": 1}],
        "conflicts": [],
    })
    res = ask("Why strleng?", reply)
    assert res["abstained"] is False
    assert "c_strings.pdf" in res["citations"][0]["file"]
    assert "null-terminated" in res["content"]


def test_related_question_initial_not_found_is_retried_and_answered(monkeypatch, env):
    c_chunk = {
        "id": 10, "source_id": "src-c", "file": "c_strings.pdf", "file_name": "c_strings.pdf",
        "title": "c_strings.pdf", "page": 1, "page_number": 1,
        "text": "Assignment 2: int strgLen( char *s ) returns the number of characters in string s. Include <string.h>.",
        "score": 0.80, "similarity_score": 0.80, "source_version": 1, "matched_terms": ["str"],
    }
    monkeypatch.setattr(na, "search_scoped", lambda *a, **kw: [c_chunk])

    # First attempt the model returns NOT_FOUND, second attempt it explains helpfully
    replies = [
        json.dumps({"supported": False, "answer": "NOT_FOUND", "citations": []}),
        json.dumps({
            "supported": True,
            "answer": "In C, 'str' refers to string manipulation functions like strgLen in strg.c [c_strings.pdf p.1].",
            "citations": [{"file": "c_strings.pdf", "page": 1}],
            "conflicts": [],
        }),
    ]
    res = ask("Why str?", replies)
    assert res["abstained"] is False
    assert len(res["citations"]) == 1
    assert res["citations"][0]["file"] == "c_strings.pdf"
    assert "strgLen" in res["content"]


def test_low_relevance_noise_chunks_filtered_from_citations(monkeypatch, env):
    good_chunk = {
        "id": 10, "source_id": "src-c", "file": "c_strings.pdf", "file_name": "c_strings.pdf",
        "title": "c_strings.pdf", "page": 1, "page_number": 1,
        "text": "Assignment 2: int strgLen( char *s ) returns characters.",
        "score": 0.85, "similarity_score": 0.85, "source_version": 1, "matched_terms": ["strglen"],
    }
    noise_chunk = {
        "id": 11, "source_id": "src-noise", "file": "syllabus.pdf", "file_name": "syllabus.pdf",
        "title": "syllabus.pdf", "page": 10, "page_number": 10,
        "text": "Grading scale and university attendance policies.",
        "score": 0.12, "similarity_score": 0.12, "source_version": 1, "matched_terms": [],
    }
    monkeypatch.setattr(na, "search_scoped", lambda *a, **kw: [good_chunk, noise_chunk])

    # LLM erroneously cited both the relevant chunk and the noise chunk
    reply = json.dumps({
        "supported": True,
        "answer": "The strgLen function measures length [c_strings.pdf p.1] [syllabus.pdf p.10].",
        "citations": [
            {"file": "c_strings.pdf", "page": 1},
            {"file": "syllabus.pdf", "page": 10},
        ],
        "conflicts": [],
    })
    res = ask("What is strgLen?", reply)
    assert res["abstained"] is False
    # Noise chunk (syllabus.pdf p.10) must be filtered out, leaving only c_strings.pdf p.1
    assert len(res["citations"]) == 1
    assert res["citations"][0]["file"] == "c_strings.pdf"
    assert res["citations"][0]["page"] == 1


def test_unrelated_zero_relation_abstains_immediately(monkeypatch, env):
    chunk = dict(CHUNK)
    monkeypatch.setattr(na, "search_scoped", lambda *a, **kw: [chunk])

    reply = json.dumps({"supported": False, "answer": "NOT_FOUND", "citations": []})
    res = ask("What is the capital of Mars?", reply)
    assert res["abstained"] is True
    assert res["abstain_reason"] == "not_found"


def test_meta_query_show_more_pdf_content_does_not_abstain(monkeypatch, env):
    syllabus_chunk = {
        "id": 20, "source_id": "src-syl", "file": "syllabus.pdf", "file_name": "syllabus.pdf",
        "title": "syllabus.pdf", "page": 1, "page_number": 1,
        "text": "Course Syllabus: CS101 Introduction to Systems. Topics include C programming, pointers, and memory.",
        "score": 0.85, "similarity_score": 0.85, "source_version": 1, "matched_source": True, "matched_terms": ["syllabus"],
    }
    monkeypatch.setattr(na, "search_scoped", lambda *a, **kw: [syllabus_chunk])

    reply = json.dumps({
        "supported": True,
        "answer": "The syllabus covers CS101 Introduction to Systems, with topics including C programming, pointers, and memory management [syllabus.pdf p.1].",
        "citations": [{"file": "syllabus.pdf", "page": 1}],
        "conflicts": [],
    })
    res = ask("Can you show more pdf content of syllabus", reply)
    assert res["abstained"] is False
    assert "CS101" in res["content"]
    assert res["citations"][0]["file"] == "syllabus.pdf"


def test_meta_query_fallback_when_llm_returns_not_found(monkeypatch, env):
    syllabus_chunk = {
        "id": 21, "source_id": "src-syl", "file": "syllabus.pdf", "file_name": "syllabus.pdf",
        "title": "syllabus.pdf", "page": 2, "page_number": 2,
        "text": "Grading Breakdown: Assignments 40%, Midterm 25%, Final Project 35%. Late submissions are penalized 10% per day.",
        "score": 0.80, "similarity_score": 0.80, "source_version": 1, "matched_source": True,
    }
    monkeypatch.setattr(na, "search_scoped", lambda *a, **kw: [syllabus_chunk])

    # LLM returns NOT_FOUND on both attempts for a meta query
    replies = [
        json.dumps({"supported": False, "answer": "NOT_FOUND", "citations": []}),
        json.dumps({"supported": False, "answer": "NOT_FOUND", "citations": []}),
    ]
    res = ask("Summarize this file", replies)
    assert res["abstained"] is False
    assert "Grading Breakdown" in res["content"]
    assert len(res["citations"]) >= 1
    assert res["citations"][0]["file"] == "syllabus.pdf"


