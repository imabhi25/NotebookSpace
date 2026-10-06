from pathlib import Path
from typing import BinaryIO
import pypdf


def parse_pdf(
    source: str | Path | BinaryIO,
    file_name: str | None = None,
    skip_empty: bool = False,
) -> list[tuple[str, int, str]]:
    """
    Extract text per page from a PDF file.

    Args:
        source: File path (str or Path) or binary file-like object.
        file_name: Optional explicit file name. If None, inferred from path or stream.
        skip_empty: If True, omit pages that contain no extractable text.
                   If False, include them with an empty string while preserving page numbers.

    Returns:
        List of tuples: (file, page, text) where page is 1-indexed.
    """
    resolved_name: str
    if file_name is not None:
        resolved_name = file_name
    elif isinstance(source, (str, Path)):
        resolved_name = Path(source).name
    elif hasattr(source, "name") and isinstance(source.name, str):
        resolved_name = Path(source.name).name
    else:
        resolved_name = "document.pdf"

    if isinstance(source, (str, Path)):
        path_obj = Path(source)
        if not path_obj.exists():
            raise FileNotFoundError(f"PDF file not found: {source}")
        reader = pypdf.PdfReader(str(path_obj))
    else:
        reader = pypdf.PdfReader(source)

    results: list[tuple[str, int, str]] = []

    for page_idx, page in enumerate(reader.pages, start=1):
        raw_text = page.extract_text() or ""
        cleaned_text = raw_text.strip()

        if skip_empty and not cleaned_text:
            continue

        results.append((resolved_name, page_idx, cleaned_text))

    return results
