#!/usr/bin/env python3
"""
Seed the demo database with synthetic sample course documents.
Ingests all PDFs found in docs/sample_docs/ into PostgreSQL/pgvector.
If documents do not exist yet, generates them automatically via make_sample_docs.
"""

from pathlib import Path
import sys

# Ensure project root is in sys.path
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from ingestion.pipeline import ingest_pdf
from tools.make_sample_docs import make_sample_docs, OUTPUT_DIR


def seed_demo_database(docs_dir: Path | None = None) -> list[tuple[str, int]]:
    target_dir = docs_dir or OUTPUT_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    pdf_files = sorted(list(target_dir.glob("*.pdf")))
    if not pdf_files:
        print(f"No PDFs found in {target_dir}. Generating synthetic sample documents...")
        make_sample_docs()
        pdf_files = sorted(list(target_dir.glob("*.pdf")))

    if not pdf_files:
        print(f"Error: No PDF files available to seed from {target_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Seeding demo database from {target_dir} ({len(pdf_files)} document(s))...")
    seeded: list[tuple[str, int]] = []

    for pdf_path in pdf_files:
        chunks_stored = ingest_pdf(pdf_path, file_name=pdf_path.name)
        seeded.append((pdf_path.name, chunks_stored))
        print(f"  - Ingested '{pdf_path.name}': {chunks_stored} chunk(s) stored.")

    total_chunks = sum(c for _, c in seeded)
    print(f"\nDemo database successfully seeded: {len(seeded)} documents, {total_chunks} total chunks.")
    return seeded


def main():
    try:
        seed_demo_database()
    except Exception as e:
        print(f"Error seeding demo database: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
