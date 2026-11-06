# Retrieval Evaluation Benchmark

> **Evaluation Rules**:
> - Labels are fixed before any retrieval is run and are never edited after seeing results.
> - The strict metric (expected file and page) is the headline evaluation standard.
> - No "lenient" rescoring of the synthetic set.

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

### Benchmark Construction Methodology
1. **Prose Chunk Filtering**: Chunks were filtered to skip code listings, exercises, review questions, and chunks with fewer than 60 words of prose (57 valid prose chunks out of 108).
2. **Seed 42 Sampling**: 30 chunks were sampled using `random.Random(42)`.
3. **Paraphrase Enforcement**: Any question that copied $\ge 5$ consecutive words from its source chunk was rejected and regenerated by the model (4 questions rejected and regenerated; 0 dropped chunks).
4. **Verbatim Ground Truth**: Every `gold_answer` was asserted to be an exact verbatim substring of the source chunk text (`assert gold_ans in chunk["text"]`).
5. **Absent Question Verification**: 6 topics (Decorators, C Extensions & Ctypes, Packaging & PyPI, Multiprocessing & GIL, Dataclasses, Asyncio & Coroutines) were verified by scanning all 108 chunk texts to guarantee zero occurrences of their identifying terms.
6. **Spot Check**: 15 randomly chosen question-chunk pairs are documented in `evals/spot_check.md`.

### Raw Cosine Separation Analysis
- **Synthetic Corpus**:
  - Answerable (N=27): Min 0.379, Mean **0.558**, Max 0.648
  - Absent (N=8): Min 0.208, Mean **0.400**, Max 0.645
  - Separation Gap: 0.158
- **Real Corpus**:
  - Answerable (N=30): Min 0.269, Mean **0.492**, Max 0.688
  - Absent (N=6): Min 0.114, Mean **0.298**, Max 0.411
  - Separation Gap: **0.194**

---

## Running the Benchmarks

Both benchmarks can be executed using the evaluation harness:

```bash
# Run synthetic corpus benchmark (default)
.venv/bin/python evals/run_retrieval_eval.py --corpus synthetic

# Run real textbook corpus benchmark
.venv/bin/python evals/run_retrieval_eval.py --corpus real

# Build / regenerate real benchmark questions
.venv/bin/python evals/build_real_eval.py
```
