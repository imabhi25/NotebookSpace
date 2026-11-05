"""
Retrieval map module:
Fits 3D PCA using pure numpy on chunks of selected sources in a notebook.
Projects stored chunk embeddings and question query vector into a shared 3D coordinate space.
Provides in-memory caching keyed by notebook sources and their versions.
"""

from typing import Any, Sequence
from uuid import UUID
import numpy as np

from db.connection import get_connection
from db.notebook_store import extract_key_terms
from ingestion.embedder import embed_text

# In-memory cache: (subject_id, tuple(sorted((source_id, version)))) -> cached data
_retrieval_map_cache: dict[tuple, dict[str, Any]] = {}


def invalidate_retrieval_map_cache(subject_id: str | None = None) -> None:
    """Invalidate cache entries for a given subject (or all if subject_id is None)."""
    if subject_id is None:
        _retrieval_map_cache.clear()
    else:
        sid_str = str(subject_id)
        keys_to_del = [k for k in _retrieval_map_cache if k[0] == sid_str]
        for k in keys_to_del:
            _retrieval_map_cache.pop(k, None)


def compute_pca_3d(
    X: np.ndarray,
    dim: int = 384,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Fits 3-component PCA on embeddings of shape (N, dim).
    Returns (projected_coords, mean_vector, components).
    - projected_coords: shape (N, 3)
    - mean_vector: shape (dim,)
    - components: shape (3, dim)
    Handles N = 0, 1, 2, 3 gracefully without erroring by falling back to fixed orthonormal bases.
    """
    N = len(X)
    if N == 0:
        mean = np.zeros((dim,), dtype=np.float32)
        comp = np.zeros((3, dim), dtype=np.float32)
        comp[0, 0] = 1.0
        comp[1, 1] = 1.0
        comp[2, 2] = 1.0
        return np.zeros((0, 3), dtype=np.float32), mean, comp

    mean = np.mean(X, axis=0).astype(np.float32)
    centered = (X - mean).astype(np.float32)

    if N == 1:
        comp = np.zeros((3, dim), dtype=np.float32)
        comp[0, 0] = 1.0
        comp[1, 1] = 1.0
        comp[2, 2] = 1.0
        return np.zeros((1, 3), dtype=np.float32), mean, comp

    # For N >= 2, perform SVD on centered points
    try:
        _, _, vt = np.linalg.svd(centered, full_matrices=False)
    except Exception:
        # Fallback in case of numerical instability
        vt = np.eye(3, dim, dtype=np.float32)

    k = min(3, vt.shape[0])
    comp = np.zeros((3, dim), dtype=np.float32)
    comp[:k] = vt[:k]

    # For N < 4 (e.g. N=2 or N=3 planar degenerate), ensure all 3 components exist
    for i in range(k, 3):
        basis = np.zeros((dim,), dtype=np.float32)
        basis[i % dim] = 1.0
        # Project out prior components
        for j in range(i):
            basis -= np.dot(basis, comp[j]) * comp[j]
        norm = np.linalg.norm(basis)
        if norm > 1e-6:
            comp[i] = basis / norm
        else:
            comp[i, i % dim] = 1.0

    proj = (centered @ comp.T).astype(np.float32)
    return proj, mean, comp


def get_or_fit_retrieval_map(
    user_id: str | UUID,
    subject_id: str | UUID,
    selected_source_ids: Sequence[str | UUID],
    sources: list[dict[str, Any]],
    db_url: str | None = None,
) -> dict[str, Any]:
    """
    Retrieves chunks for selected sources, fits 3D PCA, and caches the result
    keyed by subject_id and source versions.
    """
    sel_set = {str(sid) for sid in selected_source_ids}
    sel_sources = [s for s in sources if str(s["id"]) in sel_set and s.get("status") == "ready"]
    sources_key = tuple(sorted((str(s["id"]), int(s.get("version", 1))) for s in sel_sources))
    cache_key = (str(subject_id), sources_key)

    if cache_key in _retrieval_map_cache:
        return _retrieval_map_cache[cache_key]

    if not sel_sources:
        empty_res = {
            "chunks_meta": [],
            "embeddings": np.zeros((0, 384), dtype=np.float32),
            "proj_coords": np.zeros((0, 3), dtype=np.float32),
            "mean": np.zeros((384,), dtype=np.float32),
            "components": np.eye(3, 384, dtype=np.float32),
        }
        _retrieval_map_cache[cache_key] = empty_res
        return empty_res

    source_ids_str = [str(s["id"]) for s in sel_sources]
    sources_title_map = {str(s["id"]): s.get("title", s.get("file_name", "Source")) for s in sel_sources}

    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, source_id, file_name, page_number, chunk_index, chunk_text, embedding
                FROM chunks
                WHERE user_id = %s
                  AND subject_id = %s
                  AND source_id = ANY(%s::uuid[])
                ORDER BY source_id, page_number ASC, chunk_index ASC;
                """,
                (str(user_id), str(subject_id), source_ids_str),
            )
            rows = cur.fetchall()

    chunks_meta = []
    emb_list = []
    for r in rows:
        cid, sid, fname, pnum, cidx, ctext, emb_val = r
        if emb_val is None:
            continue
        if hasattr(emb_val, "to_numpy"):
            arr = emb_val.to_numpy()
        elif isinstance(emb_val, (list, tuple)):
            arr = np.array(emb_val, dtype=np.float32)
        else:
            arr = np.array(list(emb_val), dtype=np.float32)

        emb_list.append(arr)
        chunks_meta.append({
            "id": cid,
            "source_id": str(sid),
            "file_name": fname,
            "title": sources_title_map.get(str(sid), fname),
            "page_number": pnum,
            "chunk_index": cidx,
            "text": ctext,
        })

    if emb_list:
        X = np.stack(emb_list).astype(np.float32)
    else:
        X = np.zeros((0, 384), dtype=np.float32)

    proj_coords, mean, components = compute_pca_3d(X)

    result = {
        "chunks_meta": chunks_meta,
        "embeddings": X,
        "proj_coords": proj_coords,
        "mean": mean,
        "components": components,
    }
    _retrieval_map_cache[cache_key] = result
    return result


def build_retrieval_map_payload(
    user_id: str | UUID,
    subject_id: str | UUID,
    selected_source_ids: Sequence[str | UUID],
    sources: list[dict[str, Any]],
    question: str | None = None,
    message_retrieved: list[dict[str, Any]] | None = None,
    message_abstained: bool = False,
    message_abstain_reason: str | None = None,
    support_min_score: float = 0.20,
    db_url: str | None = None,
) -> dict[str, Any]:
    """
    Builds the full retrieval map payload:
    - 3D coordinates for all notebook chunks
    - Query projection in the same space (using local FastEmbed embedding)
    - Raw cosine similarity and final boosted score per chunk
    - Matched terms and top-k retrieval / abstained statuses
    """
    fitted = get_or_fit_retrieval_map(
        user_id=user_id,
        subject_id=subject_id,
        selected_source_ids=selected_source_ids,
        sources=sources,
        db_url=db_url,
    )

    chunks_meta = fitted["chunks_meta"]
    embeddings = fitted["embeddings"]
    proj_coords = fitted["proj_coords"]
    mean = fitted["mean"]
    components = fitted["components"]

    query_pos = None
    query_vector = None
    key_terms = []

    if question and question.strip():
        # Re-embed question with local FastEmbed (no paid/external API)
        q_emb = embed_text(question.strip())
        query_vector = np.array(q_emb, dtype=np.float32)
        q_centered = query_vector - mean
        q_proj = q_centered @ components.T
        query_pos = {
            "x": float(q_proj[0]),
            "y": float(q_proj[1]),
            "z": float(q_proj[2]),
        }
        key_terms = extract_key_terms(question)

    retrieved_map: dict[int, dict[str, Any]] = {}
    if message_retrieved:
        for r in message_retrieved:
            rid = r.get("id")
            if rid is not None:
                retrieved_map[rid] = r

    # Compute cosine similarities if question is provided
    output_chunks = []
    top_score = 0.0

    for idx, meta in enumerate(chunks_meta):
        cid = meta["id"]
        pos = {
            "x": float(proj_coords[idx, 0]),
            "y": float(proj_coords[idx, 1]),
            "z": float(proj_coords[idx, 2]),
        }

        raw_cos = None
        final_score = None
        matched = []
        is_retrieved = False

        if cid in retrieved_map:
            is_retrieved = True
            r_item = retrieved_map[cid]
            final_score = float(r_item.get("score", r_item.get("similarity_score", 0.0)))
            matched = list(r_item.get("matched_terms", []))

        if query_vector is not None and len(embeddings) > idx:
            c_emb = embeddings[idx]
            c_norm = np.linalg.norm(c_emb)
            q_norm = np.linalg.norm(query_vector)
            if c_norm > 1e-9 and q_norm > 1e-9:
                cos_val = float(np.dot(c_emb, query_vector) / (c_norm * q_norm))
            else:
                cos_val = 0.0
            raw_cos = cos_val

            if final_score is None:
                c_text_lower = meta["text"].lower()
                matched = [t for t in key_terms if t.lower() in c_text_lower]
                if matched:
                    final_score = min(1.0, max(raw_cos + 0.30, 0.40))
                else:
                    final_score = raw_cos

        if final_score is not None and final_score > top_score:
            top_score = final_score

        output_chunks.append({
            "id": cid,
            "source_id": meta["source_id"],
            "file_name": meta["file_name"],
            "title": meta["title"],
            "page_number": meta["page_number"],
            "chunk_index": meta["chunk_index"],
            "text": meta["text"],
            "position": pos,
            "raw_cosine": raw_cos,
            "score": final_score,
            "matched_terms": matched,
            "is_retrieved": is_retrieved,
        })

    abstained = message_abstained
    abstain_reason = message_abstain_reason
    if not message_retrieved and question and top_score < support_min_score:
        abstained = True
        abstain_reason = "low_retrieval_score"

    retrieved_chunk_ids = list(retrieved_map.keys())

    return {
        "subject_id": str(subject_id),
        "question": question,
        "query_position": query_pos,
        "abstained": abstained,
        "abstain_reason": abstain_reason,
        "support_min_score": support_min_score,
        "chunks": output_chunks,
        "retrieved_chunk_ids": retrieved_chunk_ids,
    }
