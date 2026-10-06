from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class Chunk:
    file_name: str
    page_number: int
    chunk_index: int
    text: str

    @property
    def word_count(self) -> int:
        return len(self.text.split())


def chunk_page_text(
    text: str,
    file_name: str,
    page_number: int,
    chunk_size: int = 300,
    overlap: int = 50,
    max_chunk_size: int = 400,
    start_index: int = 0,
) -> list[Chunk]:
    """
    Split text from a single page into roughly 200-400 word chunks with small overlap.
    Guaranteed to never cross page boundaries.

    Args:
        text: Text content of the single page.
        file_name: Name of the origin document file.
        page_number: 1-indexed page number.
        chunk_size: Target word count per chunk (default: 300).
        overlap: Word count overlap between consecutive chunks (default: 50).
        max_chunk_size: Upper limit before splitting into multiple chunks (default: 400).
        start_index: Starting sequential chunk index for numbering.

    Returns:
        List of Chunk objects strictly belonging to this page.
    """
    words = text.split()
    if not words:
        return []

    total_words = len(words)

    # If the page fits within the maximum chunk size, keep it as a single chunk
    if total_words <= max_chunk_size:
        return [
            Chunk(
                file_name=file_name,
                page_number=page_number,
                chunk_index=start_index,
                text=" ".join(words),
            )
        ]

    chunks: list[Chunk] = []
    step = max(1, chunk_size - overlap)
    start = 0
    current_idx = start_index

    while start < total_words:
        # If the remaining words from start fit in max_chunk_size, consume them all
        remaining = total_words - start
        if remaining <= max_chunk_size and chunks:
            chunk_words = words[start:]
            chunks.append(
                Chunk(
                    file_name=file_name,
                    page_number=page_number,
                    chunk_index=current_idx,
                    text=" ".join(chunk_words),
                )
            )
            break

        end = min(start + chunk_size, total_words)
        chunk_words = words[start:end]
        chunks.append(
            Chunk(
                file_name=file_name,
                page_number=page_number,
                chunk_index=current_idx,
                text=" ".join(chunk_words),
            )
        )
        current_idx += 1

        if end == total_words:
            break

        start += step

    return chunks


def chunk_pages(
    pages: Sequence[tuple[str, int, str]],
    chunk_size: int = 300,
    overlap: int = 50,
    max_chunk_size: int = 400,
) -> list[Chunk]:
    """
    Chunk multiple pages while strictly enforcing that chunks never span two pages.

    Args:
        pages: Sequence of (file_name, page_number, text) tuples.
        chunk_size: Target word count per chunk.
        overlap: Overlap in words between consecutive chunks on the same page.
        max_chunk_size: Upper limit before splitting.

    Returns:
        Flattened list of Chunk objects across all pages.
    """
    all_chunks: list[Chunk] = []
    current_index = 0

    for file_name, page_number, page_text in pages:
        page_chunks = chunk_page_text(
            text=page_text,
            file_name=file_name,
            page_number=page_number,
            chunk_size=chunk_size,
            overlap=overlap,
            max_chunk_size=max_chunk_size,
            start_index=current_index,
        )
        all_chunks.extend(page_chunks)
        current_index += len(page_chunks)

    return all_chunks
