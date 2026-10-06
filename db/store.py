from typing import Sequence
from db.connection import get_connection
from ingestion.chunker import Chunk


def store_document_chunks(
    file_name: str,
    chunks: Sequence[Chunk],
    embeddings: Sequence[list[float]],
    file_hash: str | None = None,
    db_url: str | None = None,
) -> int:
    """
    Store chunks and their embeddings in PostgreSQL with pgvector.
    Guarantees idempotency: re-uploading the same file name removes previous chunks
    and replaces them transactionally with the new ones.

    Args:
        file_name: Name of the uploaded file.
        chunks: Sequence of Chunk objects.
        embeddings: Sequence of embedding vectors corresponding to chunks.
        file_hash: Optional SHA256 or metadata hash of the file.
        db_url: Optional database connection URL.

    Returns:
        The number of chunks stored.
    """
    if len(chunks) != len(embeddings):
        raise ValueError(
            f"Chunks count ({len(chunks)}) does not match embeddings count ({len(embeddings)})"
        )

    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                # 1. Upsert document record
                cur.execute(
                    """
                    INSERT INTO documents (file_name, file_hash, upload_date)
                    VALUES (%s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (file_name)
                    DO UPDATE SET file_hash = EXCLUDED.file_hash, upload_date = CURRENT_TIMESTAMP
                    RETURNING id;
                    """,
                    (file_name, file_hash),
                )
                row = cur.fetchone()
                if not row:
                    raise RuntimeError("Failed to upsert document record.")
                doc_id = row[0]

                # 2. Remove existing chunks for this document to ensure idempotency
                cur.execute("DELETE FROM chunks WHERE document_id = %s;", (doc_id,))

                # 3. Insert newly processed chunks
                if chunks:
                    chunk_records = [
                        (
                            doc_id,
                            chunk.file_name,
                            chunk.page_number,
                            chunk.chunk_index,
                            chunk.text,
                            embeddings[idx],
                        )
                        for idx, chunk in enumerate(chunks)
                    ]

                    cur.executemany(
                        """
                        INSERT INTO chunks (
                            document_id, file_name, page_number, chunk_index, chunk_text, embedding
                        )
                        VALUES (%s, %s, %s, %s, %s, %s::vector);
                        """,
                        chunk_records,
                    )

    return len(chunks)


def get_document_chunks_count(file_name: str, db_url: str | None = None) -> int:
    """Get the count of stored chunks for a specific document file name."""
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM chunks WHERE file_name = %s;", (file_name,))
            row = cur.fetchone()
            return row[0] if row else 0


def delete_document(file_name: str, db_url: str | None = None) -> bool:
    """Delete a document and all its chunks by file name."""
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM documents WHERE file_name = %s;", (file_name,))
                return cur.rowcount > 0
