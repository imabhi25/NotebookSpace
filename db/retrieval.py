from typing import Any
from db.connection import get_connection
from ingestion.embedder import embed_text


def search(
    question: str,
    k: int = 5,
    db_url: str | None = None,
) -> list[dict[str, Any]]:
    """
    Perform plain top-k vector similarity search for a question against stored chunks.

    Args:
        question: The user query string.
        k: Number of top results to return (default: 5).
        db_url: Optional database connection URL.

    Returns:
        List of dicts containing file, page, chunk_text, and similarity_score.
    """
    if not question.strip() or k <= 0:
        return []

    # 1. Embed query
    query_vector = embed_text(question)

    # 2. Query pgvector for cosine similarity
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    file_name,
                    page_number,
                    chunk_text,
                    chunk_index,
                    1 - (embedding <=> %s::vector) AS similarity_score
                FROM chunks
                ORDER BY embedding <=> %s::vector
                LIMIT %s;
                """,
                (query_vector, query_vector, k),
            )
            rows = cur.fetchall()

    results: list[dict[str, Any]] = []
    for row in rows:
        file_name, page_num, text, chunk_idx, score = row
        results.append(
            {
                "file": file_name,
                "file_name": file_name,
                "page": page_num,
                "page_number": page_num,
                "text": text,
                "chunk_text": text,
                "chunk_index": chunk_idx,
                "score": float(score),
                "similarity_score": float(score),
            }
        )

    return results
