import sys
from pathlib import Path

# Add project root to sys.path if running script directly
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from ingestion.pipeline import ingest_pdf


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m ingestion.ingest <path_to_pdf>")
        sys.exit(1)

    file_path = Path(sys.argv[1])
    if not file_path.exists():
        print(f"Error: File '{file_path}' does not exist.", file=sys.stderr)
        sys.exit(1)

    print(f"Ingesting '{file_path}'...")
    chunk_count = ingest_pdf(file_path)
    print(f"Successfully ingested '{file_path.name}': {chunk_count} chunk(s) stored.")


if __name__ == "__main__":
    main()
