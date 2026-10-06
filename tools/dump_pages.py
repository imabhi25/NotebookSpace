import argparse
from pathlib import Path
import sys

# Ensure project root is in sys.path
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from ingestion.parser import parse_pdf

DEFAULT_OUTPUT_DIR = project_root / "data" / "page_dumps"


def dump_pdf_pages(pdf_path: Path | str, output_dir: Path | str = DEFAULT_OUTPUT_DIR) -> Path:
    """
    Extract pages from a single PDF and write to data/page_dumps/<name>.txt
    with clear '=== PAGE N ===' separators. Prints pages that extract as empty.
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")
    if not pdf_path.suffix.lower() == ".pdf":
        raise ValueError(f"File is not a PDF: {pdf_path}")

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    pages = parse_pdf(pdf_path, skip_empty=False)

    lines: list[str] = []
    for _, page_num, text in pages:
        lines.append(f"=== PAGE {page_num} ===")
        if not text.strip():
            print(f"Page {page_num} of {pdf_path.name} extracted as empty.")
        else:
            lines.append(text)
        lines.append("")

    out_file = out_dir / f"{pdf_path.stem}.txt"
    out_file.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return out_file


def dump_pages(
    source_path: Path | str,
    output_dir: Path | str = DEFAULT_OUTPUT_DIR,
) -> list[Path]:
    """
    Process a single PDF or a folder of PDFs, dumping pages for each.
    """
    source = Path(source_path)
    if not source.exists():
        raise FileNotFoundError(f"Source not found: {source}")

    written_files: list[Path] = []
    if source.is_file():
        written_files.append(dump_pdf_pages(source, output_dir=output_dir))
    elif source.is_dir():
        pdf_files = sorted(source.glob("*.pdf")) + sorted(source.glob("*.PDF"))
        # Deduplicate paths
        unique_pdfs = list(dict.fromkeys(pdf_files))
        if not unique_pdfs:
            print(f"No PDF files found in directory: {source}")
        for pdf in unique_pdfs:
            written_files.append(dump_pdf_pages(pdf, output_dir=output_dir))
    else:
        raise ValueError(f"Invalid source path: {source}")

    return written_files


def main():
    parser = argparse.ArgumentParser(
        description="Dump PDF pages to text files with '=== PAGE N ===' separators for manual labelling."
    )
    parser.add_argument(
        "source",
        type=str,
        help="Path to a PDF file or a folder containing PDF files.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(DEFAULT_OUTPUT_DIR),
        help=f"Directory to write page dump text files to (default: {DEFAULT_OUTPUT_DIR}).",
    )
    args = parser.parse_args()

    try:
        written = dump_pages(args.source, output_dir=args.output_dir)
        print(f"Successfully dumped {len(written)} PDF(s) to {args.output_dir}:")
        for f in written:
            print(f"  - {f.name}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
