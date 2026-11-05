import uuid
import numpy as np
import pytest
from fastapi.testclient import TestClient

from answering.retrieval_map import (
    compute_pca_3d,
    get_or_fit_retrieval_map,
    invalidate_retrieval_map_cache,
    _retrieval_map_cache,
)
from api.main import app
from tests.test_api_auth import _delete_user, _new_guest

client = TestClient(app)


def test_pca_shapes_and_small_chunk_counts():
    """Verify that compute_pca_3d handles N=0, 1, 2, 3, and larger gracefully."""
    for n in [0, 1, 2, 3, 5, 25]:
        X = np.random.randn(n, 384).astype(np.float32)
        proj, mean, comp = compute_pca_3d(X)
        assert proj.shape == (n, 3)
        assert mean.shape == (384,)
        assert comp.shape == (3, 384)

    # N=1 should have projected point at [0, 0, 0]
    X1 = np.ones((1, 384), dtype=np.float32)
    proj1, mean1, _ = compute_pca_3d(X1)
    np.testing.assert_allclose(proj1[0], [0.0, 0.0, 0.0], atol=1e-5)


def test_retrieval_map_cache_invalidation():
    """Verify that the retrieval map caches by source versions and invalidates correctly."""
    user_id = str(uuid.uuid4())
    subject_id = str(uuid.uuid4())
    s1_id = str(uuid.uuid4())
    sources = [{"id": s1_id, "title": "Source 1", "version": 1, "status": "ready"}]

    invalidate_retrieval_map_cache()
    assert len(_retrieval_map_cache) == 0

    # Mock fit
    res1 = get_or_fit_retrieval_map(
        user_id=user_id,
        subject_id=subject_id,
        selected_source_ids=[s1_id],
        sources=sources,
    )
    assert len(_retrieval_map_cache) == 1

    # Calling again hits cache
    res2 = get_or_fit_retrieval_map(
        user_id=user_id,
        subject_id=subject_id,
        selected_source_ids=[s1_id],
        sources=sources,
    )
    assert res1 is res2

    # Invalidate subject
    invalidate_retrieval_map_cache(subject_id)
    assert len(_retrieval_map_cache) == 0


def test_retrieval_map_api_endpoint(monkeypatch):
    """Test the GET /subjects/{subject_id}/retrieval-map endpoint."""
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    headers, user_id = _new_guest()

    try:
        # Create notebook
        subj = client.post("/subjects", json={"name": "Retrieval Map Notebook"}, headers=headers).json()
        sid = subj["id"]

        # Add 2 sources
        src1 = client.post(
            f"/subjects/{sid}/sources/paste",
            json={"title": "Linear Algebra", "text": "Eigenvectors and eigenvalues represent principal components."},
            headers=headers,
        ).json()
        assert src1["status"] == "ready"

        src2 = client.post(
            f"/subjects/{sid}/sources/paste",
            json={"title": "Algorithms", "text": "Dijkstra algorithm finds shortest paths in non-negative graphs."},
            headers=headers,
        ).json()
        assert src2["status"] == "ready"

        # Ask question
        conv = client.post(f"/subjects/{sid}/conversations", json={"title": "Test Chat"}, headers=headers).json()
        cid = conv["id"]
        ask_resp = client.post(
            f"/subjects/{sid}/conversations/{cid}/messages",
            json={"question": "What is Dijkstra?", "selected_source_ids": [src1["id"], src2["id"]]},
            headers=headers,
        )
        assert ask_resp.status_code == 200

        # Query retrieval map
        resp = client.get(
            f"/subjects/{sid}/retrieval-map",
            params={"conversation_id": cid, "question": "What is Dijkstra?"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["subject_id"] == sid
        assert data["query_position"] is not None
        assert "x" in data["query_position"] and "y" in data["query_position"] and "z" in data["query_position"]
        assert len(data["chunks"]) >= 2

        for c in data["chunks"]:
            assert "id" in c
            assert "position" in c
            assert "x" in c["position"] and "y" in c["position"] and "z" in c["position"]
            assert "raw_cosine" in c
            assert "score" in c

        # Cache invalidation via delete source
        del_resp = client.delete(f"/subjects/{sid}/sources/{src2['id']}", headers=headers)
        assert del_resp.status_code == 200
        # Cache for sid should be cleared
        sid_keys = [k for k in _retrieval_map_cache if k[0] == sid]
        assert len(sid_keys) == 0

    finally:
        _delete_user(user_id)


def test_keyword_boost_flips_ranking():
    """Unit test demonstrating that keyword boost can flip chunk ranking compared to pure vector search."""
    from db.notebook_store import (
        create_subject,
        create_source,
        store_source_chunks,
        update_source_status,
        search_scoped,
    )
    from ingestion.chunker import chunk_pages
    from ingestion.embedder import embed_batch
    from evals.run_retrieval_eval import search_without_keyword_boost

    token, user_id = _new_guest()
    try:
        subj = create_subject(user_id, "Test Boost Flip")
        # Source A has higher semantic similarity to "late work" without containing the literal word "policy"
        text_a = "Students submitting exercises past the deadline will receive reduced credit."
        src_a = create_source(user_id, subj["id"], "Source A", "source_a.txt", "text")
        chunks_a = chunk_pages([(1, 1, text_a)])
        store_source_chunks(user_id, subj["id"], src_a["id"], 1, chunks_a, embed_batch([c.text for c in chunks_a]))
        update_source_status(source_id=src_a["id"], status="ready", page_count=1, word_count=10, raw_content=text_a, version=1)

        # Source B has low semantic similarity to "late work" but contains the exact key term "policy"
        text_b = "A company security policy requires badge access at all doors."
        src_b = create_source(user_id, subj["id"], "Source B", "source_b.txt", "text")
        chunks_b = chunk_pages([(1, 1, text_b)])
        store_source_chunks(user_id, subj["id"], src_b["id"], 1, chunks_b, embed_batch([c.text for c in chunks_b]))
        update_source_status(source_id=src_b["id"], status="ready", page_count=1, word_count=10, raw_content=text_b, version=1)

        q = "What is the policy for late work?"
        s_ids = [src_a["id"], src_b["id"]]

        # 1. Pure vector cosine search (no keyword boost)
        res_noboost = search_without_keyword_boost(q, user_id, subj["id"], s_ids, k=2)
        # 2. Hybrid search (vector cosine + keyword boost)
        res_hybrid = search_scoped(q, user_id, subj["id"], s_ids, k=2)

        # In no-boost mode, Source A ranks #1 because of higher raw semantic similarity
        assert res_noboost[0]["file"] == "Source A"
        assert res_noboost[1]["file"] == "Source B"
        assert res_noboost[0]["score"] > res_noboost[1]["score"]

        # In hybrid mode, Source B gets boosted by +0.30 due to matching "policy" and flips to #1
        assert res_hybrid[0]["file"] == "Source B"
        assert res_hybrid[1]["file"] == "Source A"
        assert "policy" in res_hybrid[0]["matched_terms"]
        assert res_hybrid[0]["score"] > res_hybrid[1]["score"]
    finally:
        _delete_user(user_id)

