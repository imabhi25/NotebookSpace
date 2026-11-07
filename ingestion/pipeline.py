import hashlib
from pathlib import Path
from typing import BinaryIO
from db.store import store_document_chunks
from ingestion.chunker import chunk_pages
from ingestion.embedder import embed_batch
from ingestion.parser import parse_pdf


def compute_file_hash(source: str | Path | BinaryIO) -> str:
    """Compute SHA-256 hash of a file or stream."""
    hasher = hashlib.sha256()
    if isinstance(source, (str, Path)):
        with open(source, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                hasher.update(chunk)
    else:
        # Seekable stream
        pos = source.tell() if hasattr(source, "tell") else 0
        if hasattr(source, "seek"):
            source.seek(0)
        for chunk in iter(lambda: source.read(65536), b""):
            hasher.update(chunk)
        if hasattr(source, "seek"):
            source.seek(pos)
    return hasher.hexdigest()


def ingest_pdf(
    source: str | Path | BinaryIO,
    file_name: str | None = None,
    db_url: str | None = None,
) -> int:
    """
    Ingest a PDF document: parse page-by-page, chunk with page boundary constraints,
    generate local embeddings, and store in PostgreSQL with pgvector idempotently.

    Args:
        source: File path or file-like binary stream.
        file_name: Optional explicit file name. Inferred if not provided.
        db_url: Optional database connection URL.

    Returns:
        The number of chunks stored.
    """
    # 1. Determine file name
    resolved_name: str
    if file_name is not None:
        resolved_name = file_name
    elif isinstance(source, (str, Path)):
        resolved_name = Path(source).name
    elif hasattr(source, "name") and isinstance(source.name, str):
        resolved_name = Path(source.name).name
    else:
        resolved_name = "document.pdf"

    # 2. Compute file hash
    file_hash = compute_file_hash(source)

    # 3. Parse PDF page-by-page
    pages = parse_pdf(source, file_name=resolved_name, skip_empty=False)

    # 4. Chunk each page
    chunks = chunk_pages(pages)

    # 5. Generate embeddings
    chunk_texts = [c.text for c in chunks]
    embeddings = embed_batch(chunk_texts)

    # 6. Store in database with idempotency guarantee
    count = store_document_chunks(
        file_name=resolved_name,
        chunks=chunks,
        embeddings=embeddings,
        file_hash=file_hash,
        db_url=db_url,
    )

    return count
