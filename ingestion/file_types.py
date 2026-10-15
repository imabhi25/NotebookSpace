"""Uploaded-file readers: turn each supported file type into (file_name, page, text) pages.

PDFs and slide decks keep their real page and slide numbers so citations point at them.
Formats without pages (Word, spreadsheets, text, code) are split into ~350-word virtual pages.
"""

import csv
import io
from pathlib import Path
from typing import BinaryIO

from ingestion.parsers import _HTMLContentExtractor, parse_pdf_source, parse_text_source

# Extension -> stored source_type.
SOURCE_TYPES: dict[str, str] = {
    ".pdf": "pdf",
    ".pptx": "pptx",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".csv": "csv",
    ".txt": "txt",
    ".md": "markdown",
    ".markdown": "markdown",
    ".html": "html",
    ".htm": "html",
    ".tex": "txt",
    ".rtf": "txt",
    ".json": "code",
    ".yaml": "code",
    ".yml": "code",
    ".xml": "code",
    ".sql": "code",
    ".py": "code",
    ".ipynb": "code",
    ".c": "code",
    ".h": "code",
    ".cpp": "code",
    ".hpp": "code",
    ".cc": "code",
    ".java": "code",
    ".js": "code",
    ".jsx": "code",
    ".ts": "code",
    ".tsx": "code",
    ".go": "code",
    ".rs": "code",
    ".rb": "code",
    ".kt": "code",
    ".swift": "code",
    ".scala": "code",
    ".r": "code",
    ".m": "code",
    ".sh": "code",
    ".asm": "code",
    ".s": "code",
}

# Binary document formats may be large (decks with images); text formats never need to be.
BINARY_TYPES = {"pdf", "pptx", "docx", "xlsx"}

# Old Office formats need a converter we don't ship; say how to fix it instead of failing vaguely.
LEGACY_HINTS = {
    ".ppt": "Old PowerPoint (.ppt) files aren't supported. Save it as .pptx or PDF and upload that.",
    ".doc": "Old Word (.doc) files aren't supported. Save it as .docx or PDF and upload that.",
    ".xls": "Old Excel (.xls) files aren't supported. Save it as .xlsx or CSV and upload that.",
}

MAX_SHEET_ROWS = 5000


def source_type_for(file_name: str) -> str | None:
    return SOURCE_TYPES.get(Path(file_name).suffix.lower())


def _decode(data: bytes) -> str:
    if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
        try:
            return data.decode("utf-16")
        except UnicodeDecodeError:
            pass
    return data.decode("utf-8-sig", errors="replace")


def _parse_pptx(stream: BinaryIO, file_name: str) -> list[tuple[str, int, str]]:
    from pptx import Presentation

    deck = Presentation(stream)
    pages: list[tuple[str, int, str]] = []
    for number, slide in enumerate(deck.slides, start=1):
        parts: list[str] = []
        for shape in slide.shapes:
            if getattr(shape, "has_text_frame", False) and shape.has_text_frame:
                text = shape.text_frame.text.strip()
                if text:
                    parts.append(text)
            if getattr(shape, "has_table", False) and shape.has_table:
                for row in shape.table.rows:
                    cells = [c.text.strip() for c in row.cells]
                    if any(cells):
                        parts.append(" | ".join(cells))
        if slide.has_notes_slide:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                parts.append(f"Speaker notes: {notes}")
        text = "\n".join(parts).strip()
        if text:
            pages.append((file_name, number, text))
    if not pages:
        raise ValueError("No readable text found in this slide deck. Slides that are only images can't be read yet.")
    return pages


def _parse_docx(stream: BinaryIO, file_name: str) -> list[tuple[str, int, str]]:
    import docx

    document = docx.Document(stream)
    parts = [p.text.strip() for p in document.paragraphs if p.text.strip()]
    for table in document.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if any(cells):
                parts.append(" | ".join(cells))
    return parse_text_source(content="\n".join(parts), file_name=file_name)


def _parse_xlsx(stream: BinaryIO, file_name: str) -> list[tuple[str, int, str]]:
    from openpyxl import load_workbook

    workbook = load_workbook(stream, read_only=True, data_only=True)
    parts: list[str] = []
    try:
        for sheet in workbook.worksheets:
            parts.append(f"Sheet: {sheet.title}")
            for index, row in enumerate(sheet.iter_rows(values_only=True)):
                if index >= MAX_SHEET_ROWS:
                    parts.append(f"(Sheet truncated after {MAX_SHEET_ROWS} rows)")
                    break
                cells = ["" if v is None else str(v).strip() for v in row]
                if any(cells):
                    parts.append(" | ".join(cells))
    finally:
        workbook.close()
    return parse_text_source(content="\n".join(parts), file_name=file_name)


def _parse_csv(data: bytes, file_name: str) -> list[tuple[str, int, str]]:
    reader = csv.reader(io.StringIO(_decode(data)))
    lines = []
    for index, row in enumerate(reader):
        if index >= MAX_SHEET_ROWS:
            lines.append(f"(Truncated after {MAX_SHEET_ROWS} rows)")
            break
        if any(cell.strip() for cell in row):
            lines.append(" | ".join(cell.strip() for cell in row))
    return parse_text_source(content="\n".join(lines), file_name=file_name)


def _parse_html(data: bytes, file_name: str) -> list[tuple[str, int, str]]:
    extractor = _HTMLContentExtractor()
    extractor.feed(_decode(data))
    return parse_text_source(content="".join(extractor.text_chunks), file_name=file_name)


def parse_uploaded_file(path: str | Path, file_name: str) -> list[tuple[str, int, str]]:
    """Read a saved upload from disk and return its pages. Raises ValueError with a readable message."""
    source_type = source_type_for(file_name)
    if source_type is None:
        raise ValueError("This file type isn't supported.")

    with open(path, "rb") as stream:
        if source_type == "pdf":
            return parse_pdf_source(source=stream, file_name=file_name)
        if source_type == "pptx":
            return _parse_pptx(stream, file_name)
        if source_type == "docx":
            return _parse_docx(stream, file_name)
        if source_type == "xlsx":
            return _parse_xlsx(stream, file_name)
        data = stream.read()

    if source_type == "csv":
        return _parse_csv(data, file_name)
    if source_type == "html":
        return _parse_html(data, file_name)
    return parse_text_source(content=_decode(data), file_name=file_name)
