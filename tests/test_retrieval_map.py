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
