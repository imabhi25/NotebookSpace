# Retrieval Evaluation Benchmark

> **Evaluation Rules**:
> - Labels are fixed before any retrieval is run and are never edited after seeing results.
> - The strict metric (expected file and page) is the headline evaluation standard.
> - No "lenient" rescoring of the synthetic set.
> - MRR is capped at rank 5 (a miss outside the top 5 counts as 0, i.e., $1/\text{rank} = 0$).

This directory contains the automated retrieval and answer-grounding evaluation benchmark for NotebookSpace across both synthetic course documents and a real published textbook corpus.

---

## 1. Synthetic Corpus Benchmark Results

Evaluated on **35 questions** (N=27 answerable spanning factual baseline, paraphrased, multi-chunk/multi-page, conflicting updates, near-duplicate wording, and keyword distractor queries, plus N=8 absent-fact questions) over 7 course documents from `docs/sample_docs` (23 chunks).

| Metric | Hybrid Search (Cosine + Keyword Boost) | No Boost (Pure Vector Cosine) | Notes |
| :--- | :---: | :---: | :--- |
| **Corpus Chunks** | 23 | 23 | 7 sample syllabus, assignment, and lecture documents |
| **Top-5 Coverage of Corpus** | **21.7%** (5 / 23) | **21.7%** (5 / 23) | Evaluating top-5 candidates inspects ~22% of corpus |
| **Hit@1 (Top-1 Hit Rate)** | **59.3%** (16 / 27) | **59.3%** (16 / 27) | Ranks target passage at rank 1 |
| **Hit@3 (Top-3 Hit Rate)** | **92.6%** (25 / 27) | **92.6%** (25 / 27) | Ranks target passage in top 3 |
| **Hit@5 (Top-5 Hit Rate)** | **100.0%** (27 / 27) | **100.0%** (27 / 27) | Target passage retrieved in all top-5 candidates |
| **Mean Reciprocal Rank (MRR)** | **0.751** | **0.751** | Average reciprocal rank of first hit ($1/\text{rank}$) |
| **Absent-Fact Abstention Accuracy** | **100.0%** (8 / 8) | **100.0%** (8 / 8) | 8/8 abstained on `gemini-3.5-flash-lite`; 8/8 on `gemini-3.5-flash` |

### Models Tested on Absent Questions
The 8 absent questions on the synthetic corpus were evaluated against both models:
- **`gemini-3.5-flash-lite`**: 8/8 (100.0%) correctly abstained with reason `"not_found"`.
- **`gemini-3.5-flash`**: 8/8 (100.0%) correctly abstained with reason `"not_found"`.

### Metric Equality Between Hybrid and No-Boost on Synthetic Dataset
While Hybrid and No-Boost achieved identical aggregate metrics on this test set, **the keyword boost does alter ranking**:
- The keyword boost changed the top-5 candidate order on 9 of 27 answerable questions.
- Because the *first hit* for each of those questions was already ranked at position 1 (or position 2) by vector cosine similarity, the first-hit rank was unaffected, producing identical Hit@1/3/5 and MRR figures on this smaller corpus.
- A dedicated unit test in `tests/test_retrieval_map.py::test_keyword_boost_flips_ranking` verifies that the keyword boost flips candidate chunk rankings when a chunk with lower semantic cosine contains query key terms.

---

## 2. Real Textbook Corpus Benchmark Results

Evaluated on **36 questions** (N=30 answerable generated from sampled prose chunks with strict paraphrasing and exact substring assertions, plus N=6 absent-fact questions on verified unmentioned topics) over 4 consecutive chapters of an introductory computer science textbook.

### Real Corpus Attribution & Metadata
- **Book Title**: *Introduction to Python Programming*
- **Authors**: Udayan Das (Saint Mary's College of California), Aubrey Lawson (Wiley), Chris Mayfield (James Madison University), Narges Norouzi (UC Berkeley)
- **License**: Creative Commons Attribution 4.0 International License (CC BY 4.0)
- **Source URL**: https://openstax.org/details/books/introduction-python-programming
- **Attribution**: "Access for free at openstax.org."
- **Chapters Ingested**:
  - `chapter_01_statements.pdf` (pages 17–46, 30 pages)
  - `chapter_02_expressions.pdf` (pages 47–76, 30 pages)
  - `chapter_03_objects.pdf` (pages 77–94, 18 pages)
  - `chapter_04_decisions.pdf` (pages 95–124, 30 pages)
  - Total: **108 pages / 108 chunks** (prose-heavy introductory chapters prior to the Answer Key and Index).

### Performance Metrics Table

| Metric | Hybrid Search (Cosine + Keyword Boost) | No Boost (Pure Vector Cosine) | Delta | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Total Chunks in Corpus** | 108 | 108 | — | 4 chapters extracted with pypdf |
| **Top-5 Coverage of Corpus** | **4.6%** (5 / 108) | **4.6%** (5 / 108) | — | Selective retrieval regime (~4.6% vs ~21.7% on synthetic) |
| **Hit@1 (Top-1 Hit Rate)** | **36.7%** (11 / 30) | **36.7%** (11 / 30) | 0.0% | Strict target file and page match |
| **Hit@3 (Top-3 Hit Rate)** | **53.3%** (16 / 30) | **53.3%** (16 / 30) | 0.0% | Strict target in top 3 |
| **Hit@5 (Top-5 Hit Rate)** | **56.7%** (17 / 30) | **53.3%** (16 / 30) | **+3.4%** | Target in top 5 (Keyword boost promotes target into top 5) |
| **Mean Reciprocal Rank (MRR)** | **0.442** | **0.433** | **+0.009** | Average reciprocal rank of first hit ($1/\text{rank}$) |
| **Absent-Fact Abstention Accuracy** | **100.0%** (6 / 6) | **100.0%** (6 / 6) | 0.0% | All 6 absent queries correctly abstained (`not_found`) |

### Benchmark Construction Methodology (Set A)
1. **Prose Chunk Filtering**: Chunks were filtered to skip code listings, exercises, review questions, and chunks with fewer than 60 words of prose (57 valid prose chunks out of 108).
2. **Seed 42 Sampling**: 30 chunks were sampled using `random.Random(42)`.
3. **Paraphrase Enforcement**: Any question that copied $\ge 5$ consecutive words from its source chunk was rejected and regenerated by the model (4 questions rejected and regenerated; 0 dropped chunks).
4. **Verbatim Ground Truth**: Every `gold_answer` was asserted to be an exact verbatim substring of the source chunk text (`assert gold_ans in chunk["text"]`).
5. **Absent Question Verification**: 6 topics (Decorators, C Extensions & Ctypes, Packaging & PyPI, Multiprocessing & GIL, Dataclasses, Asyncio & Coroutines) were verified by scanning all 108 chunk texts to guarantee zero occurrences of their identifying terms.
6. **Spot Check**: 15 randomly chosen question-chunk pairs are documented in `evals/spot_check.md`.

### Real Corpus Set B Rules (Fixed BEFORE Generation and Retrieval)
To eliminate structural clues and ensure uniquely discriminating benchmark queries, Set B (`questions_real_b.json`) enforces the following strict generation rules with random seed 43:
- **Rule (a) Chunk Filtering**: Skip chunks containing practice exercises, checkpoint questions, chapter outlines, tables of contents, or section headings only (33 valid prose chunks out of 108).
- **Rule (b) Meta-Language Prohibition**: Reject any generated question containing the words: `exercise`, `section`, `outline`, `chapter`, `practice`, `"concepts in practice"`, or `hint`.
- **Rule (c) Corpus-Unique Ground Truth String**: The `gold_answer` must be at least 4 characters (`len(gold_ans) >= 4`) and appear (case-insensitive exact string match) in **exactly ONE chunk** across the entire corpus. If it appears in more than one chunk, reject the question and regenerate.
- **Rule (d) 5-Consecutive-Word Copy Prohibition**: Reject any question copying 5 or more consecutive words from its source chunk; ask the model to regenerate.
- **Rule (e) Absent Question Verification**: 30 answerable and 6 absent questions, with absent topics strictly verified absent by string search across all corpus chunks. All questions generated before running retrieval.
- **Audit Logging**: Recorded counts of candidates rejected under each rule.
- **Spot Check**: 15 randomly chosen question-chunk pairs are documented in `evals/spot_check_b.md`.

#### Set B Performance Metrics Table

| Metric | Hybrid Search (Cosine + Keyword Boost) | No Boost (Pure Vector Cosine) | Delta | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Total Chunks in Corpus** | 108 | 108 | — | 4 chapters extracted with pypdf |
| **Top-5 Coverage of Corpus** | **4.6%** (5 / 108) | **4.6%** (5 / 108) | — | Selective retrieval regime (~4.6%) |
| **Hit@1 (Top-1 Hit Rate)** | **46.7%** (14 / 30) | **46.7%** (14 / 30) | 0.0% | Strict target file and page match |
| **Hit@3 (Top-3 Hit Rate)** | **63.3%** (19 / 30) | **60.0%** (18 / 30) | **+3.3%** | Strict target in top 3 (boost promotes target on `rq_b_12`) |
| **Hit@5 (Top-5 Hit Rate)** | **73.3%** (22 / 30) | **73.3%** (22 / 30) | 0.0% | Strict target in top 5 |
| **Mean Reciprocal Rank (MRR)** | **0.561** | **0.558** | **+0.003** | Reciprocal rank of first hit ($1/\text{rank}$) |
| **Absent-Fact Abstention Accuracy** | **100.0%** (6 / 6) | **100.0%** (6 / 6) | 0.0% | All 6 absent queries correctly abstained (`not_found`) |

#### Set B Methodological Notes & Audit Observations
- **Shared Absent Questions**: The 6 absent-fact questions are shared between Set A and Set B, so their 6/6 (100%) abstain result represents one evaluated result, not two independent measurements.
- **Generation Search Strategy**: Set B generation switched to unique-candidate-phrase hints after many Rule (c) rejections (43 candidates rejected for non-unique gold answers).
- **Chunk Qualification**: Only 33 of 108 chunks qualified under Rule (a), and some numbered-question text (for example `rq_b_02`, `rq_b_13`) still got through in chunks with surrounding prose.

#### Set B Generation Audit Log
- **Valid Prose Chunks Identified**: 33 (rejected 75 chunks under Rule a)
- **Candidates Rejected under Rule (b)** [Meta-words]: 8
- **Candidates Rejected under Rule (c)** [Gold answer < 4 chars]: 3
- **Candidates Rejected under Rule (c)** [Gold answer not corpus-unique]: 43
- **Candidates Rejected under Rule (d)** [5+ consecutive words copied]: 6
- **Chunks Dropped after 10 Failed Attempts**: 3
- **Successfully Generated Answerable Questions**: 30 / 30

### Raw Cosine Separation Analysis
- **Synthetic Corpus**:
  - Answerable (N=27): Min 0.379, Mean **0.558**, Max 0.648
  - Absent (N=8): Min 0.208, Mean **0.400**, Max 0.645
  - Separation Gap: 0.158
- **Real Corpus Set A (Seed 42)**:
  - Answerable (N=30): Min 0.269, Mean **0.492**, Max 0.688
  - Absent (N=6): Min 0.114, Mean **0.298**, Max 0.411
  - Separation Gap: **0.194**
- **Real Corpus Set B (Seed 43)**:
  - Answerable (N=30): Min 0.285, Mean **0.498**, Max 0.692
  - Absent (N=6): Min 0.114, Mean **0.298**, Max 0.411
  - Separation Gap: **0.200**

---

## 3. Comprehensive Experimental Matrix (Set × Configuration)

> **Statistical Note**: On a 30-question benchmark set (or 27 questions on synthetic), differences of 2 questions or fewer (≤ 6.7%) are within sampling noise. Only empirically measured outcomes are recorded below. All evaluations enforce strict file and page matching against gold labels fixed before retrieval. MRR is capped at rank 5 ($1/\text{rank} = 0$ for misses outside top 5).

### Matrix Results Table

| Dataset / Set | Embedding Model (384-dim) | Reranker (Cross-Encoder) | Hit@1 | Hit@3 | Hit@5 | MRR | Added Latency (Median / P95) | Peak RSS |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Synthetic** (N=27) | `all-MiniLM-L6-v2` (Default) | None (Hybrid) | 59.3% (16/27) | 92.6% (25/27) | 100.0% (27/27) | 0.751 | — | 357.2 MB |
| **Synthetic** (N=27) | `all-MiniLM-L6-v2` (Default) | `ms-marco-MiniLM-L-6-v2` | 74.1% (20/27) | 96.3% (26/27) | 100.0% (27/27) | 0.853 | 273.0 ms / 466.8 ms | 465.7 MB |
| **Synthetic** (N=27) | `bge-small-en-v1.5` | None (Hybrid) | 59.3% (16/27) | 88.9% (24/27) | 96.3% (26/27) | 0.737 | — | 418.3 MB |
| **Synthetic** (N=27) | `bge-small-en-v1.5` | `ms-marco-MiniLM-L-6-v2` | 74.1% (20/27) | 96.3% (26/27) | 96.3% (26/27) | 0.846 | 270.8 ms / 320.7 ms | 658.9 MB |
| **Real Set A** (N=30) | `all-MiniLM-L6-v2` (Default) | None (Hybrid) | 36.7% (11/30) | 53.3% (16/30) | 56.7% (17/30) | 0.442 | — | 357.2 MB |
| **Real Set A** (N=30) | `all-MiniLM-L6-v2` (Default) | `ms-marco-MiniLM-L-6-v2` | 56.7% (17/30) | 73.3% (22/30) | 80.0% (24/30) | 0.658 | 992.2 ms / 1245.1 ms | 943.8 MB |
| **Real Set A** (N=30) | `bge-small-en-v1.5` | None (Hybrid) | 50.0% (15/30) | 73.3% (22/30) | 80.0% (24/30) | 0.632 | — | 418.3 MB |
| **Real Set A** (N=30) | `bge-small-en-v1.5` | `ms-marco-MiniLM-L-6-v2` | 63.3% (19/30) | 83.3% (25/30) | 86.7% (26/30) | 0.734 | 720.3 ms / 808.0 ms | 1141.5 MB |
| **Real Set B** (N=30) | `all-MiniLM-L6-v2` (Default) | None (Hybrid) | 46.7% (14/30) | 63.3% (19/30) | 73.3% (22/30) | 0.561 | — | 357.2 MB |
| **Real Set B** (N=30) | `all-MiniLM-L6-v2` (Default) | `ms-marco-MiniLM-L-6-v2` | 50.0% (15/30) | 80.0% (24/30) | 83.3% (25/30) | 0.653 | 889.0 ms / 1368.4 ms | 1002.6 MB |
| **Real Set B** (N=30) | `bge-small-en-v1.5` | None (Hybrid) | 50.0% (15/30) | 76.7% (23/30) | 93.3% (28/30) | 0.655 | — | 418.3 MB |
| **Real Set B** (N=30) | `bge-small-en-v1.5` | `ms-marco-MiniLM-L-6-v2` | 53.3% (16/30) | 86.7% (26/30) | 86.7% (26/30) | 0.694 | 751.1 ms / 1134.4 ms | 1018.4 MB |

---

## Running the Benchmarks

Both benchmarks can be executed using the evaluation harness:

```bash
# Run synthetic corpus benchmark (default)
.venv/bin/python evals/run_retrieval_eval.py --corpus synthetic

# Run synthetic with cross-encoder reranker
.venv/bin/python evals/run_retrieval_eval.py --corpus synthetic --rerank

# Run real textbook corpus benchmark (Set A)
.venv/bin/python evals/run_retrieval_eval.py --corpus real --set a

# Run real textbook corpus benchmark (Set B)
.venv/bin/python evals/run_retrieval_eval.py --corpus real --set b

# Run real textbook benchmark with cross-encoder reranker
.venv/bin/python evals/run_retrieval_eval.py --corpus real --set b --rerank

# Run with alternative 384-dim embedding model
.venv/bin/python evals/run_retrieval_eval.py --corpus real --set b --embedding-model "BAAI/bge-small-en-v1.5" --rerank

# Build / regenerate real benchmark questions (Set B)
.venv/bin/python evals/build_real_eval.py --set b
```
