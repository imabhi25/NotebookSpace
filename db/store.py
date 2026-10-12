from pathlib import Path
from typing import Any, Sequence
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


def get_all_documents(db_url: str | None = None) -> list[dict[str, Any]]:
    """List all stored documents with their upload dates and chunk counts."""
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    d.file_name,
                    d.upload_date,
                    COUNT(c.id)::int as chunk_count
                FROM documents d
                LEFT JOIN chunks c ON d.id = c.document_id
                GROUP BY d.id, d.file_name, d.upload_date
                ORDER BY d.upload_date DESC;
                """
            )
            rows = cur.fetchall()
            return [
                {
                    "file_name": row[0],
                    "upload_date": row[1].isoformat() if row[1] else None,
                    "chunk_count": row[2],
                }
                for row in rows
            ]


def get_passages_for_page(
    file_name: str,
    page_number: int,
    user_id: str | None = None,
    db_url: str | None = None,
) -> list[dict[str, Any]]:
    """Return chunks for a document page that the given user may read.

    Chunks of notebook sources carry their owner's user_id and are returned only to that
    owner. Chunks of the shared demo corpus have no owner and no source, and are the fallback
    when the user has nothing under that name. Without a user_id only the shared corpus is
    searched, so this function never returns another user's text.
    """
    base_name = Path(file_name).name
    select = """
        SELECT file_name, page_number, chunk_index, chunk_text
        FROM chunks
        WHERE (file_name = %s OR file_name = %s)
          AND page_number = %s
    """
    order = " ORDER BY chunk_index ASC;"
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            rows: list[Any] = []
            if user_id is not None:
                cur.execute(
                    select + " AND user_id = %s" + order,
                    (file_name, base_name, page_number, str(user_id)),
                )
                rows = cur.fetchall()
            if not rows:
                cur.execute(
                    select + " AND user_id IS NULL AND source_id IS NULL" + order,
                    (file_name, base_name, page_number),
                )
                rows = cur.fetchall()
            return [
                {
                    "file_name": row[0],
                    "page_number": row[1],
                    "chunk_index": row[2],
                    "text": row[3],
                    "chunk_text": row[3],
                }
                for row in rows
            ]
