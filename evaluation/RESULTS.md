# Partial Baseline Evaluation and Full Retrieval Audit

## 1. Executive Summary and Execution Accounting

This report presents verified, reproducible results for the Course-Document Assistant against the frozen 60-question benchmark dataset in `evaluation/questions.json`.

All per-question records, retrieved passages, matching cache keys, and verification outcomes are published in `evaluation/results/partial_baseline_results.json`.

### Execution Accounting
- **Total Benchmark Questions:** 60
- **Completed Questions (with Verified Model Generation):** 14 / 60 (23.3%). These correspond to single-page lookup questions `s1` through `s14`.
- **Newly Completed in this Invocation:** 1 question (`s14`).
- **Attempted-but-Failed Questions:** 1 / 60 (1.7%). Question `s15` was submitted to the upstream Google Generative Language API and halted on HTTP 429 (`RESOURCE_EXHAUSTED`).
- **Unattempted Questions:** 45 / 60 (75.0%). Comprising single-page questions `s16` through `s25`, multi-page questions `m1` through `m10`, conflicting questions `c1` through `c10`, and unsupported questions `n1` through `n15`. These questions were never sent to the LLM due to quota exhaustion and must not be counted as model or API failures.
- **Execution Invocations (Attempts):**
  - **Attempt 1:** Evaluated `s1` through `s12` into `.cache/llm/`; halted at `s13` with HTTP 429.
  - **Attempt 2:** Replayed `s1` through `s12` from cache; executed and cached `s13`; halted at `s14` with HTTP 429.
  - **Attempt 3:** Replayed `s1` through `s13` from cache; halted at `s14` with HTTP 429.
  - **Attempt 4 (Bounded Resume):** Replayed `s1` through `s13` from cache; evaluated and cached `s14`; halted at `s15` with HTTP 429 (`RESOURCE_EXHAUSTED`). Execution was stopped immediately without restart loops.

---

## 2. Reconciled Corpus Identity

The evaluation corpus was audited across physical files on disk, text dumps, database tables, and benchmark source references:

- **Physical Documents on Disk (`docs/sample_docs/`):** Exactly 6 synthetic course PDFs, 22 total pages.
  - `announcement_update.pdf`: 3 pages (SHA-256: `2c1e56b298b81bea1109172e17add5afd0066ac3fed4294d5b0a9f0edb42397b`)
  - `assignment_1.pdf`: 3 pages (SHA-256: `322feb25a50da5d6ddc2df3058b9310634feeac03765230116d5eac81b9013e8`)
  - `assignment_2.pdf`: 4 pages (SHA-256: `962c0024aaf60718651ede5c097b261807fa4c068682d2952e72301123be04ee`)
  - `exam_guide.pdf`: 4 pages (SHA-256: `72919c2839fe71ed4019210cfe710b66012d7e395c345c1dbeda830a0cef1699`)
  - `lecture_schedule.pdf`: 4 pages (SHA-256: `450210fb538753665b6f5f02a2b2b1554b871b2077d67f70ec47dd1f1e7e0e1b`)
  - `syllabus.pdf`: 4 pages (SHA-256: `09a6384a60c7acc680ae8e9a3eeb67812ad4733d7c28ec42a98e962e95735dd1`)
- **Extracted Page Dumps (`data/page_dumps/`):** 6 text dump files containing 22 total dumped pages matching the physical PDFs page for page.
- **Database Content (`eval` database):** Table `documents` contains 6 records with matching SHA-256 hashes; table `chunks` contains 22 distinct chunks corresponding to the 22 pages.
- **Benchmark Source References (`evaluation/questions.json`):** Maximum referenced page numbers match physical bounds: `announcement_update.pdf` p.3, `assignment_1.pdf` p.3, `assignment_2.pdf` p.4, `exam_guide.pdf` p.4, `lecture_schedule.pdf` p.4, `syllabus.pdf` p.4.
- **Resolution of Discrepancy:** The corpus has not changed. An earlier mention of 27 pages was an arithmetic error in a prior narrative draft. Physical PDFs, text dumps, and database chunks all confirm 22 pages.

---

## 3. Model Provenance

- **Configured Request Model:** `gemini-3.5-flash` (set via environment variable `LLM_MODEL`).
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`.
- **Served Model Metadata:** Cached response payloads in `.cache/llm/` store `text`, `input_tokens`, `output_tokens`, and `latency_seconds`, but do not preserve server-side model version headers.
- **Literal Upstream Error String:** The HTTP 429 response body contained the literal message: `Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash`. No further model-alias assertions are made beyond this literal response string.

---

## 4. Partial Generation Results (Questions s1 to s14)

The generation metrics below reflect the completed partial subset of 14 single-page questions. Untested question categories are marked not evaluated.

| Metric | Single-Page Subset (s1-s14) | Multi-Page (m1-m10) | Conflicting (c1-c10) | Not in Documents (n1-n15) | Full Benchmark (60 Qs) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Questions Completed** | 14 / 25 (56.0%) | 0 / 10 (0.0%) | 0 / 10 (0.0%) | 0 / 15 (0.0%) | 14 / 60 (23.3%) |
| **Answered Rate** | 14 / 14 (100.0%) | Not evaluated | Not evaluated | Not evaluated | Partial (14 completed) |
| **Model Abstention Rate** | 0 / 14 (0.0%) | Not evaluated | Not evaluated | Not evaluated | Partial (0 abstentions) |
| **Any Expected Page Cited** | 13 / 14 (92.9%) | Not evaluated | Not evaluated | Not evaluated | Partial (13/14 on subset) |
| **Per-Citation Support Precision** | 16 / 16 (100.0%) | Not evaluated | Not evaluated | Not evaluated | Partial (16/16 citations) |
| **Answer Correctness (Fact Match)** | 13 / 14 (92.9%) | Not evaluated | Not evaluated | Not evaluated | Partial (13/14 on subset) |
| **Claim Support (Assistant Review)** | 14 / 14 (100.0%) | Not evaluated | Not evaluated | Not evaluated | Partial (14/14 on subset) |

### Detailed Metric Definitions and Auditing
1. **Separation of Citation Support from Answer Correctness:**
   - *Citation Support Precision (16 / 16, 100.0%):* Measures whether each individual cited passage directly substantiates the specific assertion to which the citation is attached. Across all 14 answers, 16 citations were emitted (12 questions with 1 citation, and 2 questions with 2 citations: `s8` and `s10`). Every single emitted citation was verified to support its attached claim.
   - *Question Answer Correctness (13 / 14, 92.9%):* Measures whether the response actually answers the query posed and contains the required ground-truth factual terms.
   - *Case Study `s10` ("Assignment 1 data structure"):* The model generated: "For Assignment 1, students are required to design and implement a High-Performance Concurrent Key-Value Store [syllabus.pdf p.3] [announcement_update.pdf p.1]."
     - Citation Support: `syllabus.pdf` p.3 explicitly names Assignment 1 as "High-Performance Concurrent Key-Value Store", and `announcement_update.pdf` p.1 repeats this title. Both citations support the sentence emitted by the model.
     - Answer Correctness: The response failed because the question asked what data structure is required (expected: "concurrent hash map" / "hash table"), which is only detailed on `assignment_1.pdf` page 1 (a passage missed by retrieval at $k=5$). Thus, the claim is supported by its citations, but the answer fails to correctly answer the question.
2. **Any Expected Page Cited (Per-Question Recall):** 13 / 14 (92.9%). Question `s10` missed the ground truth page (`assignment_1.pdf` p.1). All other 13 questions cited their ground truth page.
3. **Answer Correctness (Fact Match):** 13 / 14 (92.9%). 13 questions matched all required terms in `expected_answer_contains`. Question `s10` missed data structure terms.
4. **Claim Support (Assistant Manual Review):** 14 / 14 (100.0%). All 14 completed answers made only factual statements corroborated by the passages supplied in the prompt.

### Per-Question Review Log (Questions s1 to s14)
- `s1` (Credits): 1 citation (`syllabus.pdf` p.1). Emitted claim supported (Credits: 4.0). Answer correct.
- `s2` (Instructor Email): 1 citation (`syllabus.pdf` p.1). Emitted claim supported (amercer@example.edu). Answer correct.
- `s3` (Grade A Threshold): 1 citation (`syllabus.pdf` p.2). Emitted claim supported (93%). Answer correct.
- `s4` (Participation Weight): 1 citation (`syllabus.pdf` p.2). Emitted claim supported (10%). Answer correct.
- `s5` (Assignment 4 Title and Due Date): 1 citation (`syllabus.pdf` p.3). Emitted claim supported (Asynchronous Network RPC Framework, Dec 16). Answer correct.
- `s6` (Assignment 3 System Topic): 1 citation (`syllabus.pdf` p.3). Emitted claim supported (Write-Ahead Logging and Crash Recovery Engine). Answer correct.
- `s7` (Academic Integrity): 1 citation (`syllabus.pdf` p.4). Emitted claim supported (Academic Conduct Board). Answer correct.
- `s8` (Accessibility Accommodations): 2 citations (`syllabus.pdf` p.4, `exam_guide.pdf` p.4). Both claims supported (Student Support Office and Accessibility Center). Answer correct.
- `s9` (Prohibited Locking in Assignment 1): 1 citation (`assignment_1.pdf` p.1). Emitted claim supported (coarse-grained global locks). Answer correct.
- `s10` (Assignment 1 Data Structure): 2 citations (`syllabus.pdf` p.3, `announcement_update.pdf` p.1). Emitted sentence supported by both pages, but fails to answer question (project title provided instead of data structure). Answer incorrect.
- `s11` (Rehashing Load Factor): 1 citation (`assignment_1.pdf` p.2). Emitted claim supported (0.75). Answer correct.
- `s12` (Sanitizer Tools): 1 citation (`assignment_1.pdf` p.2). Emitted claim supported (AddressSanitizer and ThreadSanitizer). Answer correct.
- `s13` (Design Document Rubric Weight): 1 citation (`assignment_1.pdf` p.3). Emitted claim supported (15 points). Answer correct.
- `s14` (Course Grading Breakdown): 1 citation (`syllabus.pdf` p.2). Emitted claim supported (4 projects 40%, midterm 25%, final project 25%, participation 10%). Answer correct.

### Latency and Token Usage
- **Measured Model Inference Latency:** Median (p50) = 3.64 seconds, 95th percentile (p95) = 18.33 seconds. Measured pure generation HTTP duration recorded by client and stored in `.cache/llm/`.
- **Recorded Answer Latency in `logs/answers.jsonl`:** Sum of local vector retrieval (~0.03s) plus recorded model latency, preserving model execution metrics across cache replays.
- **Measured Inter-Question Wall-Clock Delay:** Replay logs in `logs/answers.jsonl` measure an interval of 8.02s to 8.36s between consecutive cached queries, reflecting local retrieval, disk cache read, and the deliberate 8.0-second `--sleep-between-questions` pacing delay.
- **Token Consumption:** Across 14 completed questions, average input tokens was 1,228 and average output tokens was 99.

---

## 5. Full Retrieval-Only Evaluation Across the 60-Question Benchmark

Executed using PostgreSQL pgvector cosine similarity search ($k=5$) against the isolated `eval` database without generation API calls:

### Overall Retrieval Metrics
- **Total Answerable Questions:** 45 (25 single-page, 10 multi-page, 10 conflicting).
- **Overall Top-3 Any-Source Recall:** 38 / 45 (84.4%)
- **Overall Top-5 Any-Source Recall:** 42 / 45 (93.3%)

### Breakdown by Question Type

#### 1. Single-Page Lookups (`single_page`, N = 25)
- **Top-3 Recall:** 19 / 25 (76.0%)
- **Top-5 Recall:** 22 / 25 (88.0%)
- **Top-5 Misses (3 questions):**
  - `s10` ("Assignment 1 data structure"): Expected `assignment_1.pdf` p.1. Retrieved `syllabus.pdf` p.3, `announcement_update.pdf` p.1, `assignment_2.pdf` p.4, `assignment_1.pdf` p.3, `syllabus.pdf` p.1.
  - `s16` ("Instructor office hours"): Expected `syllabus.pdf` p.1. Retrieved `announcement_update.pdf` p.3, `exam_guide.pdf` p.4, `announcement_update.pdf` p.1, `syllabus.pdf` p.3, `syllabus.pdf` p.2.
  - `s22` ("Midterm evaluation topics"): Expected `exam_guide.pdf` p.2. Retrieved `exam_guide.pdf` p.1, `announcement_update.pdf` p.2, `syllabus.pdf` p.2, `announcement_update.pdf` p.3, `assignment_1.pdf` p.3.

#### 2. Multi-Page Lookups (`multi_page`, N = 10)
- **Top-3 Any-Source Recall:** 10 / 10 (100.0%)
- **Top-5 Any-Source Recall:** 10 / 10 (100.0%)
- **Top-5 All-Required-Sources Recall:** 7 / 10 (70.0%)
- **Partial Retrievals (retrieved 1 of 2 required sources in top 5):**
  - `m1` ("Prerequisites and C++20 standard"): Expected `syllabus.pdf` p.1 and `exam_guide.pdf` p.2. Retrieved `syllabus.pdf` p.1 (hit); missed `exam_guide.pdf` p.2 (retrieved p.1 instead).
  - `m7` ("Room location and lecture schedule"): Expected `syllabus.pdf` p.1 and `lecture_schedule.pdf` p.1. Retrieved `lecture_schedule.pdf` p.1 (hit); missed `syllabus.pdf` p.1.
  - `m9` ("Assignment 1 benchmark read/write ratio and extension cause"): Expected `assignment_1.pdf` p.2 and `announcement_update.pdf` p.1. Retrieved `announcement_update.pdf` p.1 (hit); missed `assignment_1.pdf` p.2 (retrieved p.3 instead).

#### 3. Conflicting Lookups (`conflicting`, N = 10)
- **Top-3 Any-Source Recall:** 9 / 10 (90.0%)
- **Top-5 Any-Source Recall:** 10 / 10 (100.0%)
- **Top-5 All-Required-Sources Recall:** 9 / 10 (90.0%)
- **Partial Retrieval (retrieved 1 of 2 conflicting sources in top 5):**
  - `c4` ("Assignment 2 submission due date conflict"): Expected `syllabus.pdf` p.3 (due Nov 18) and `assignment_2.pdf` p.1 (due Nov 25). Retrieved `syllabus.pdf` p.3 (hit); missed `assignment_2.pdf` p.1 (retrieved p.4 instead).

#### 4. Unsupported Questions (`not_in_documents`, N = 15)
- **Passages with similarity score >= 0.25:** 14 / 15 (93.3%).
- **Implication:** Vector similarity scores alone do not filter unsupported questions. The system relies on model adherence to the abstention prompt.

---

## 6. Benchmark Errata

### Label Defect in Question `m7`
- **Question Text:** "In which room does CS 401 meet, and what are the scheduled weekly lecture meeting times?"
- **Ground-Truth Label in `questions.json`:** Marked as `multi_page` requiring `syllabus.pdf` p.1 and `lecture_schedule.pdf` p.1.
- **Source Text Audit:**
  - `lecture_schedule.pdf` page 1 states: "CS 401 Weekly Lecture Schedule ... meets Monday and Wednesday from 10:00 AM to 11:30 AM in Turing Hall Room 101." This single page contains both the room and the weekly meeting times.
  - `syllabus.pdf` page 1 states: "Location: Turing Hall Room 101." It does not list the lecture meeting times (only instructor office hours).
- **Errata Determination:** `lecture_schedule.pdf` page 1 is independently sufficient to answer both parts of question `m7`. Requiring `syllabus.pdf` page 1 is a label defect.
- **Policy:** The frozen dataset `evaluation/questions.json` is preserved without retroactive alteration. Under original scoring, `m7` is scored as partial retrieval (1/2 sources). Under corrected analysis, retrieving `lecture_schedule.pdf` page 1 satisfies the information requirement of the query.

---

## 7. Test Suite Status

Execution of `.venv/bin/pytest` against `pytest_scratch` database:
- **Total Tests:** 75
- **Passed:** 75
- **Failed:** 0
- **Updates Applied:**
  - `tests/test_evaluation.py`: Updated `test_questions_json_format` to validate the full 60-question structure (25 single-page, 10 multi-page, 10 conflicting, 15 unsupported), unique IDs, valid file names, and page bounds.
  - `tests/conftest.py`: Added autouse fixture `isolate_test_llm_cache` setting `LLM_CACHE_DIR` to a temporary directory per test session, preventing test fixtures (such as `test.pdf`) from contaminating the benchmark cache in `.cache/llm/`.

---

## 8. Exact Quota Blocker and Safe Resumption Prerequisites

### Observed Quota Blocker
During execution of question `s15`, the Google Generative Language API returned HTTP 429 (`RESOURCE_EXHAUSTED`):
- **Quota Metric:** `generativelanguage.googleapis.com/generate_content_free_tier_requests`
- **Plan Limit:** 20 requests
- **Stated Upstream Guidance:** "Please retry in 3h17m45s"

### Current Question State
- **Completed Questions:** 14 (`s1` through `s14`)
- **Attempted and Halted:** 1 (`s15`)
- **Remaining Unattempted:** 45 (`s16` through `s60`)

### Safe Resumption Prerequisites
1. **Quota Clearance:** Wait until the upstream API quota reset window elapses (approximately 3.3 hours from 16:42 EDT) or provide credentials with active request allocation.
2. **Preserved Cache Verification:** Verify `.cache/llm/` retains all 14 completed records (`s1` through `s14`). Resuming will replay them from disk without sending external API requests.
3. **Execution Pacing:** Execute with `--sleep-between-questions 8` to respect per-minute request limits.
4. **Finite Retry Policy:** Run as a single monitored process without unconstrained shell restart loops. Cap transient HTTP retries at 3 attempts, respect `Retry-After` if present, and halt immediately on non-transient status codes or database errors.
5. **Configuration Freeze:** Preserve all frozen labels in `evaluation/questions.json`, database corpus (22 pages in `eval`), prompt templates, and retrieval settings ($k=5$, threshold 0.25) without modification.
