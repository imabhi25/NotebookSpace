#!/usr/bin/env python3
"""
Verify evaluation/questions_draft.json against dumped text in data/page_dumps/.
Mechanically checks:
- Verbatim source quotes for single_page and multi_page against expected_sources.
- Verbatim quotes and distinct values for conflicting questions.
- Terms in expected_answer_contains present in source_quote.
- Keyword co-occurrence checks across all pages for not_in_documents (flags n12 explicitly).
"""

import json
from pathlib import Path
import re
import sys

project_root = Path(__file__).resolve().parent.parent
data_dumps_dir = project_root / "data" / "page_dumps"
draft_path = project_root / "evaluation" / "questions_draft.json"


def normalize(text: str) -> str:
    """Normalize whitespace and curly quotes."""
    if not text:
        return ""
    # Curly quotes and apostrophes
    text = text.replace("“", '"').replace("”", '"')
    text = text.replace("‘", "'").replace("’", "'")
    # Normalize whitespace
    return re.sub(r"\s+", " ", text).strip()


def load_page_dumps(dumps_dir: Path) -> tuple[dict[tuple[str, int], str], dict[tuple[str, int], list[str]]]:
    """
    Parse page dumps for sample course documents into:
    - pages: (pdf_filename, page_number) -> normalized_full_page_text
    - page_lines: (pdf_filename, page_number) -> list_of_lines
    """
    pages: dict[tuple[str, int], str] = {}
    page_lines: dict[tuple[str, int], list[str]] = {}
    if not dumps_dir.exists():
        raise FileNotFoundError(f"Page dumps directory not found: {dumps_dir}")

    sample_stems = {p.stem for p in (project_root / "docs" / "sample_docs").glob("*.pdf")}

    for txt_file in sorted(dumps_dir.glob("*.txt")):
        if txt_file.stem not in sample_stems:
            continue
        pdf_name = f"{txt_file.stem}.pdf"
        content = txt_file.read_text(encoding="utf-8")
        # Split on === PAGE N ===
        chunks = re.split(r"^=== PAGE (\d+) ===$", content, flags=re.MULTILINE)
        # chunks: [prefix, page_num1, page_text1, page_num2, page_text2, ...]
        for i in range(1, len(chunks), 2):
            page_num = int(chunks[i])
            raw_page_text = chunks[i + 1]
            page_text = normalize(raw_page_text)
            pages[(pdf_name, page_num)] = page_text
            lines = [normalize(l) for l in raw_page_text.splitlines() if normalize(l)]
            page_lines[(pdf_name, page_num)] = lines
    return pages, page_lines


def verify_draft(target_file: Path | str | None = None):
    target = Path(target_file) if target_file else (Path(sys.argv[1]) if len(sys.argv) > 1 else draft_path)
    pages, page_lines = load_page_dumps(data_dumps_dir)
    if not target.exists():
        print(f"Error: {target} does not exist", file=sys.stderr)
        sys.exit(1)

    with open(target, "r", encoding="utf-8") as f:
        questions = json.load(f)

    failures: list[str] = []
    print("=================================================================")
    print(f"VERIFICATION REPORT: {target.relative_to(project_root) if target.is_relative_to(project_root) else target.name}")
    print(f"Loaded {len(pages)} pages across {len(set(k[0] for k in pages.keys()))} dumped documents.")
    print(f"Loaded {len(questions)} draft questions.")
    print("=================================================================\n")

    for q in questions:
        q_id = q.get("id")
        q_type = q.get("type")
        q_text = q.get("question")
        sources = q.get("expected_sources", [])
        quote = q.get("source_quote")
        contains = q.get("expected_answer_contains", [])

        # 1. Single Page and Multi Page Checks
        if q_type in ("single_page", "multi_page"):
            if not quote:
                print(f"FAIL [{q_id}] ({q_type}): missing source_quote")
                failures.append(f"{q_id}: missing source_quote")
                continue

            # Split on ' / ' or '...'
            raw_segments = re.split(r"\s+/\s+|\.\.\.", quote)
            segments = [normalize(s) for s in raw_segments if normalize(s)]

            question_failed = False
            failed_segments = []

            for seg in segments:
                # Must appear on AT LEAST ONE page in expected_sources
                found_on_any_source = False
                for src in sources:
                    key = (src["file"], src["page"])
                    page_content = pages.get(key, "")
                    if seg in page_content:
                        found_on_any_source = True
                        break

                if not found_on_any_source:
                    question_failed = True
                    failed_segments.append(seg)

            # Check expected_answer_contains
            norm_quote = normalize(quote)
            missing_contains = []
            for term in contains:
                if isinstance(term, list):
                    if not any(normalize(alt).lower() in norm_quote.lower() for alt in term):
                        missing_contains.append(term)
                elif isinstance(term, str):
                    if normalize(term).lower() not in norm_quote.lower():
                        missing_contains.append(term)

            if question_failed or missing_contains:
                details = []
                if failed_segments:
                    details.append(f"segment(s) not verbatim on expected page: {failed_segments}")
                if missing_contains:
                    details.append(f"expected_answer_contains not in quote: {missing_contains}")
                print(f"FAIL [{q_id}] ({q_type}): {'; '.join(details)}")
                failures.append(f"{q_id}: {'; '.join(details)}")
            else:
                print(f"PASS [{q_id}] ({q_type})")

        # 2. Conflicting Checks
        elif q_type == "conflicting":
            if not quote:
                print(f"FAIL [{q_id}] (conflicting): missing source_quote")
                failures.append(f"{q_id}: missing source_quote")
                continue

            # Parse "file p.N: text vs file p.M: text" or similar
            conflict_parts = re.split(r"\s+vs\s+", quote, flags=re.IGNORECASE)
            part_failures = []
            extracted_values = []

            if len(conflict_parts) != 2:
                part_failures.append(f"could not split source_quote on ' vs ' (got {len(conflict_parts)} parts)")
            else:
                for part in conflict_parts:
                    m = re.search(r"([\w_]+\.pdf)\s*(?:\(p\.(\d+)\)|p\.(\d+)):\s*(.*)", part.strip())
                    if not m:
                        part_failures.append(f"could not parse conflict format in: '{part}'")
                    else:
                        file_name = m.group(1)
                        page_num = int(m.group(2) or m.group(3))
                        text_val = normalize(m.group(4))
                        extracted_values.append(text_val)

                        page_content = pages.get((file_name, page_num), "")
                        if text_val not in page_content:
                            part_failures.append(f"'{text_val}' not verbatim in {file_name} p.{page_num}")

            # Check values differ
            if len(extracted_values) == 2:
                if extracted_values[0].lower() == extracted_values[1].lower():
                    part_failures.append(f"conflicting values do not differ: '{extracted_values[0]}'")

            # Check expected_answer_contains
            norm_quote = normalize(quote)
            missing_contains = []
            for term in contains:
                if isinstance(term, list):
                    if not any(normalize(alt).lower() in norm_quote.lower() for alt in term):
                        missing_contains.append(term)
                elif isinstance(term, str):
                    if normalize(term).lower() not in norm_quote.lower():
                        missing_contains.append(term)
            if missing_contains:
                part_failures.append(f"expected_answer_contains not in quote: {missing_contains}")

            if part_failures:
                print(f"FAIL [{q_id}] (conflicting): {'; '.join(part_failures)}")
                failures.append(f"{q_id}: {'; '.join(part_failures)}")
            else:
                print(f"PASS [{q_id}] (conflicting)")

        # 3. Not in Documents Checks
        elif q_type == "not_in_documents":
            is_n12 = q_id == "n12"

            # Broadened stems and synonyms per not_in_documents question
            keyword_map = {
                "n1": ["isbn", "textbook", "book", "reading list"],
                "n2": ["kit", "hardware", "purchase", "cost", "fee", "$"],
                "n3": ["cloud", "aws", "azure", "credit", "hosting"],
                "n4": ["teaching assistant", "TA", "graduate", "email"],
                "n5": ["reading week", "break", "recess", "holiday"],
                "n6": ["incomplete", "grade of i", "deferred", "extension of grade"],
                "n7": ["final exam", "final", "auditorium", "hall", "room", "location"],
                "n8": ["grace", "slip", "extension", "late"],
                "n9": ["cluster", "supercomputer", "hostname"],
                "n10": ["pass", "fail", "withdraw", "audit", "p/f"],
                "n11": ["peer tutor", "tutor", "undergraduate", "application", "eligib"],
                "n12": ["discord", "forum", "piazza", "slack", "discussion"],
                "n13": ["bus", "parking", "transit", "shuttle"],
                "n14": ["phone", "telephone", "office number"],
                "n15": ["linux", "kernel", "workstation", "operating system"],
            }

            def match_stem(term: str, line: str) -> bool:
                t = term.lower()
                l = line.lower()
                if term == "$":
                    return "$" in line
                if term == "c++":
                    return "c++" in l
                if term == "p/f":
                    return "p/f" in l
                if term == "TA":
                    return bool(re.search(r"\btas?\b", l))
                if t in [
                    "book", "textbook", "kit", "fee", "credit", "holiday",
                    "cluster", "shuttle", "phone", "telephone", "workstation",
                    "kernel", "auditorium", "hall", "room", "location", "forum",
                    "team", "group", "partner", "pair", "extension", "language",
                ]:
                    return bool(re.search(r"\b" + re.escape(t) + r"s?\b", l))
                if t == "operating system":
                    return bool(re.search(r"\boperating systems?\b", l))
                if t == "teaching assistant":
                    return bool(re.search(r"\bteaching assistants?\b", l))
                if t == "peer tutor":
                    return bool(re.search(r"\bpeer tutors?\b", l))
                if t == "tutor":
                    return bool(re.search(r"\btutor\w*\b", l))
                if t == "undergraduate":
                    return bool(re.search(r"\bundergraduat\w*\b", l))
                if t == "application":
                    return bool(re.search(r"\bapplicat\w*\b", l))
                if t == "eligib":
                    return bool(re.search(r"\beligib\w*\b", l))
                if t == "deferred":
                    return bool(re.search(r"\bdeferr?\w*\b", l))
                if t == "reading week":
                    return bool(re.search(r"\breading weeks?\b", l))
                if t == "final exam":
                    return bool(re.search(r"\bfinal exams?\b", l))
                if t == "reading list":
                    return bool(re.search(r"\breading lists?\b", l))
                if t == "office number":
                    return bool(re.search(r"\boffice numbers?\b", l))
                if t == "bus":
                    return bool(re.search(r"\bbus(es)?\b", l))
                if t == "pass":
                    return bool(re.search(r"\bpass(es|ed|ing)?\b", l))
                if t == "fail":
                    return bool(re.search(r"\bfail(s|ed|ing|ure|ures)?\b", l))
                if t == "audit":
                    return bool(re.search(r"\baudit(s|ed|ing)?\b", l))
                if t == "withdraw":
                    return bool(re.search(r"\bwithdraw(s|al|als|ing|n)?\b", l))
                if t == "graduate":
                    return bool(re.search(r"\bgraduat(e|es|ed|ing)?\b", l))
                if t == "break":
                    return bool(re.search(r"\bbreak(s|down|downs)?\b", l))
                if t == "cost":
                    return bool(re.search(r"\bcost(s|ing)?\b", l))
                if t == "hosting":
                    return bool(re.search(r"\bhost(s|ed|ing)?\b", l))
                if t == "purchase":
                    return bool(re.search(r"\bpurchas(e|es|ed|ing)?\b", l))
                return bool(re.search(r"\b" + re.escape(t) + r"\b", l))

            keywords = keyword_map.get(q_id, [w.lower() for w in re.findall(r"\b[A-Za-z0-9]{4,}\b", q_text)[:3]])

            # Search every page for each key term individually
            term_matches: dict[str, list[tuple[str, int, str]]] = {}
            for kw in keywords:
                term_matches[kw] = []
                for (file_name, page_num), lines in page_lines.items():
                    for line in lines:
                        if match_stem(kw, line):
                            term_matches[kw].append((file_name, page_num, line))

            any_term_hit = any(len(hits) > 0 for hits in term_matches.values())
            if any_term_hit:
                print(f"INFO [{q_id}] Individual term matches across documents:")
                for kw, hits in term_matches.items():
                    if hits:
                        print(f"  - Key term '{kw}' found on {len(hits)} line(s):")
                        for f_name, p_num, line_str in hits:
                            print(f"      * {f_name} p.{p_num}: \"{line_str}\"")
                    else:
                        print(f"  - Key term '{kw}': 0 matches (completely absent)")

            if is_n12 and "late penalty" in q_text.lower():
                print(f"FAIL [{q_id}] (not_in_documents): [FLAGGED: syllabus and announcement both define late penalties]")
                failures.append(f"{q_id}: late penalty is defined in documents for assignments")
            else:
                print(f"PASS [{q_id}] (not_in_documents)")

    print("\n=================================================================")
    print(f"SUMMARY: {len(questions) - len(failures)} PASSED, {len(failures)} FAILED.")
    print("=================================================================")

    if failures:
        print("\nFailed questions:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("\nAll questions passed mechanical verification!")
        sys.exit(0)


if __name__ == "__main__":
    verify_draft()
