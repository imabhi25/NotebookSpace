import argparse
import json
from pathlib import Path
import re
import sys
from typing import Any

# Ensure project root is in sys.path
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

try:
    import pypdf
except ImportError:
    pypdf = None

try:
    from db.connection import get_connection
except Exception:
    get_connection = None

TARGET_COUNTS = {
    "single_page": 25,
    "multi_page": 10,
    "not_in_documents": 15,
    "conflicting": 10,
}

LABEL_REGEX = re.compile(r"\b(placeholder|conflict|conflicting)\b", re.IGNORECASE)


def get_file_page_count(
    file_name: str,
    data_dir: Path | str = project_root / "data",
    db_url: str | None = None,
) -> tuple[bool, int]:
    """
    Check if an expected file exists in the data/ folder (or project) or database,
    and return its total page count.
    """
    base_name = Path(file_name).name
    data_path = Path(data_dir)

    # 1. Search in data/ directory and subdirectories
    search_dirs = [data_path, project_root, project_root / "docs" / "sample_docs"]
    for s_dir in search_dirs:
        if not s_dir.exists():
            continue
        # Direct check
        direct = s_dir / base_name
        if direct.is_file():
            if pypdf:
                try:
                    reader = pypdf.PdfReader(str(direct))
                    return True, len(reader.pages)
                except Exception:
                    pass
            return True, 999999

        # Recursive check
        for candidate in s_dir.rglob(base_name):
            if candidate.is_file():
                if pypdf:
                    try:
                        reader = pypdf.PdfReader(str(candidate))
                        return True, len(reader.pages)
                    except Exception:
                        pass
                return True, 999999

    # 2. Check in database
    if get_connection:
        try:
            with get_connection(db_url) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT MAX(page_number) FROM chunks WHERE file_name = %s OR file_name = %s;",
                        (file_name, base_name),
                    )
                    row = cur.fetchone()
                    if row and row[0] is not None:
                        return True, int(row[0])

                    cur.execute(
                        "SELECT id FROM documents WHERE file_name = %s OR file_name = %s;",
                        (file_name, base_name),
                    )
                    doc_row = cur.fetchone()
                    if doc_row:
                        return True, 1
        except Exception:
            # If DB is not reachable, do not crash
            pass

    return False, 0


def validate_questions_file(
    questions_path: Path | str,
    data_dir: Path | str = project_root / "data",
    db_url: str | None = None,
    require_targets: bool = False,
) -> tuple[bool, list[str], dict[str, int]]:
    """
    Validate a questions JSON file against all requirements:
    - Required fields per type
    - Every expected file exists in DB or data/ folder and every page is within page count
    - Duplicate IDs or duplicate question text
    - 'not_in_documents' has no expected_sources
    - 'conflicting' has expected_conflict_files with 2 files
    - No 'placeholder': true entries
    - No label-like text (PLACEHOLDER, CONFLICT) in question text
    - Counts per type against targets

    Returns:
        (is_valid, errors_list, type_counts_dict)
    """
    path = Path(questions_path)
    if not path.exists():
        return False, [f"Questions file not found: {path}"], {}

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return False, [f"Invalid JSON in {path}: {e}"], {}

    if not isinstance(data, list):
        return False, [f"Top-level JSON in {path} must be a list of question objects."], {}

    errors: list[str] = []
    seen_ids: set[str] = set()
    seen_questions: set[str] = set()
    type_counts: dict[str, int] = {k: 0 for k in TARGET_COUNTS}

    file_cache: dict[str, tuple[bool, int]] = {}

    for idx, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            errors.append(f"Entry #{idx} is not a JSON object.")
            continue

        q_id = str(item.get("id", "")).strip()
        q_text = str(item.get("question", "")).strip()
        q_type = str(item.get("type", "")).strip()

        # 1. Check ID
        if not q_id:
            errors.append(f"Entry #{idx} is missing a non-empty 'id'.")
        elif q_id in seen_ids:
            errors.append(f"Duplicate question id: '{q_id}'.")
        else:
            seen_ids.add(q_id)

        # 2. Check Question text
        if not q_text:
            errors.append(f"Question '{q_id or idx}' is missing non-empty 'question' text.")
        else:
            norm_q = " ".join(q_text.lower().split())
            if norm_q in seen_questions:
                errors.append(f"Duplicate question text: '{q_text}' (id: '{q_id}').")
            else:
                seen_questions.add(norm_q)

            # Check label-like text in question
            label_match = LABEL_REGEX.search(q_text)
            if label_match:
                errors.append(
                    f"Question '{q_id}' contains label-like text '{label_match.group(0)}' in: \"{q_text}\"."
                )

        # 3. Check placeholder entry
        if item.get("placeholder") is True:
            errors.append(f"Question '{q_id}' has 'placeholder': true left.")

        # 4. Check Type
        if q_type not in TARGET_COUNTS:
            errors.append(
                f"Question '{q_id}' has invalid type '{q_type}'. Expected one of: {list(TARGET_COUNTS.keys())}."
            )
        else:
            type_counts[q_type] += 1

        # 5. Type-specific checks & sources
        expected_sources = item.get("expected_sources")
        if expected_sources is None or not isinstance(expected_sources, list):
            errors.append(f"Question '{q_id}' missing 'expected_sources' list.")
            expected_sources = []

        if q_type == "not_in_documents":
            if len(expected_sources) > 0:
                errors.append(
                    f"Question '{q_id}' is 'not_in_documents' but has {len(expected_sources)} expected_sources (must be empty)."
                )

        elif q_type == "single_page":
            if len(expected_sources) != 1:
                errors.append(
                    f"Question '{q_id}' is 'single_page' but has {len(expected_sources)} expected_sources (expected 1)."
                )

        elif q_type == "multi_page":
            if len(expected_sources) < 2:
                errors.append(
                    f"Question '{q_id}' is 'multi_page' but has {len(expected_sources)} expected_sources (expected >= 2)."
                )

        elif q_type == "conflicting":
            conflict_files = item.get("expected_conflict_files")
            if not isinstance(conflict_files, list) or len(conflict_files) != 2:
                errors.append(
                    f"Question '{q_id}' is 'conflicting' but 'expected_conflict_files' does not contain exactly 2 files (got: {conflict_files})."
                )
            elif str(conflict_files[0]).strip().lower() == str(conflict_files[1]).strip().lower():
                errors.append(
                    f"Question '{q_id}' 'expected_conflict_files' must have 2 distinct files, got: {conflict_files}."
                )
            else:
                for c_file in conflict_files:
                    c_file_str = str(c_file).strip()
                    if c_file_str not in file_cache:
                        file_cache[c_file_str] = get_file_page_count(c_file_str, data_dir=data_dir, db_url=db_url)
                    found, _ = file_cache[c_file_str]
                    if not found:
                        errors.append(
                            f"Question '{q_id}': conflict file '{c_file_str}' not found in database or data/ folder."
                        )

        # 6. Verify sources files and page counts
        for s_idx, src in enumerate(expected_sources):
            if not isinstance(src, dict) or "file" not in src or "page" not in src:
                errors.append(f"Question '{q_id}' expected_sources[{s_idx}] invalid (must have 'file' and 'page').")
                continue

            src_file = str(src.get("file", "")).strip()
            src_page = src.get("page")

            if not src_file:
                errors.append(f"Question '{q_id}' expected_sources[{s_idx}] missing file name.")
                continue

            if not isinstance(src_page, int) or src_page < 1:
                errors.append(f"Question '{q_id}' expected_sources[{s_idx}] page must be integer >= 1 (got: {src_page}).")
                continue

            if src_file not in file_cache:
                file_cache[src_file] = get_file_page_count(src_file, data_dir=data_dir, db_url=db_url)

            found, total_pages = file_cache[src_file]
            if not found:
                errors.append(f"Question '{q_id}': expected file '{src_file}' not found in database or data/ folder.")
            elif src_page > total_pages:
                errors.append(
                    f"Question '{q_id}': page {src_page} exceeds total page count ({total_pages}) for file '{src_file}'."
                )

    # Check targets if required
    if require_targets:
        for t_name, target in TARGET_COUNTS.items():
            actual = type_counts.get(t_name, 0)
            if actual != target:
                errors.append(
                    f"Target count mismatch for '{t_name}': got {actual}, expected {target}."
                )

    is_valid = len(errors) == 0
    return is_valid, errors, type_counts


def print_validation_report(
    file_path: Path | str,
    is_valid: bool,
    errors: list[str],
    type_counts: dict[str, int],
) -> None:
    """Print formatted validation summary and errors."""
    print("=" * 65)
    print(f"VALIDATION REPORT: {Path(file_path).name}")
    print("=" * 65)
    print("Counts per question type against targets:")
    total_q = sum(type_counts.values())
    total_target = sum(TARGET_COUNTS.values())
    for t_name, target in TARGET_COUNTS.items():
        actual = type_counts.get(t_name, 0)
        status_mark = "✓" if actual == target else "-"
        print(f"  {status_mark} {t_name:<20} {actual:>3} / {target:>3}")
    print(f"    {'Total':<20} {total_q:>3} / {total_target:>3}")
    print("-" * 65)

    if is_valid:
        print("✓ All validation checks passed successfully!")
    else:
        print(f"✗ Found {len(errors)} validation error(s):")
        for err in errors:
            print(f"  - {err}")
    print("=" * 65)


def main():
    parser = argparse.ArgumentParser(
        description="Validate evaluation questions dataset against formatting, source, and count rules."
    )
    parser.add_argument(
        "questions_file",
        nargs="?",
        default=None,
        help="Path to questions JSON file (defaults to validating evaluation/questions.json and evaluation/tuning_questions.json if present).",
    )
    parser.add_argument(
        "--data-dir",
        default=str(project_root / "data"),
        help="Directory where source PDFs are stored.",
    )
    parser.add_argument(
        "--require-targets",
        action="store_true",
        help="Enforce strict matching of targets (25 single_page, 10 multi_page, 15 not_in_documents, 10 conflicting).",
    )
    args = parser.parse_args()

    files_to_validate: list[Path] = []
    if args.questions_file:
        files_to_validate.append(Path(args.questions_file))
    else:
        test_file = project_root / "evaluation" / "questions.json"
        if test_file.exists():
            files_to_validate.append(test_file)
        tuning_file = project_root / "evaluation" / "tuning_questions.json"
        if tuning_file.exists():
            files_to_validate.append(tuning_file)

    if not files_to_validate:
        print("Error: No questions files found to validate.", file=sys.stderr)
        sys.exit(1)

    all_passed = True
    for q_file in files_to_validate:
        is_valid, errors, type_counts = validate_questions_file(
            questions_path=q_file,
            data_dir=args.data_dir,
            require_targets=args.require_targets,
        )
        print_validation_report(q_file, is_valid, errors, type_counts)
        if not is_valid:
            all_passed = False

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
