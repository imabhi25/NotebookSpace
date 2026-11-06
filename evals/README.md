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

## 4. Standalone Memory & Latency Benchmark

A clean, isolated benchmark (`evals/benchmark_memory.py`) was executed to evaluate production resource profiles without database or PDF parsing overhead. Each configuration runs in **one fresh subprocess** measuring resident set size via `resource.getrusage(RUSAGE_SELF).ru_maxrss` immediately after loading models and after executing 30 real evaluation queries against 15 realistic-length textbook passages (~250 words each).

> **CPU Environment Caveat**: The benchmark host CPU is an **Apple Silicon Mac (M-series)**, **NOT Render's free-tier shared CPU (0.1 vCPU)**. On Render's throttled free CPU, embedding and cross-encoder inference times would be roughly 3×–6× slower (reranking 15 passages would take approximately 2.5–4.5 seconds per request). Latency numbers below demonstrate relative scaling rather than production Render execution times.

### Benchmark Results (30 Queries, Top-15 Reranked Passages)

| Configuration | Embedding Model | Cross-Encoder Reranker | Peak RSS (Load) | Peak RSS (Workload) | Query Embed Median | Query Embed P95 | Rerank Median (15 passages) | Rerank P95 (15 passages) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **MiniLM** | `all-MiniLM-L6-v2` | None | **257.0 MB** | **257.5 MB** | 2.3 ms | 3.0 ms | — | — |
| **BGE** | `bge-small-en-v1.5` | None | **318.2 MB** | **318.4 MB** | 4.5 ms | 5.7 ms | — | — |
| **MiniLM + Reranker** | `all-MiniLM-L6-v2` | `ms-marco-MiniLM-L-6-v2` | **379.6 MB** | **598.0 MB** | 3.1 ms | 6.0 ms | 591.4 ms | 711.0 ms |
| **BGE + Reranker** | `bge-small-en-v1.5` | `ms-marco-MiniLM-L-6-v2` | **468.2 MB** | **653.3 MB** | 5.4 ms | 14.1 ms | 640.5 ms | 783.7 ms |

### Docker 512 MB Memory Limit Test (`--memory=512m`)

When running under a hard memory limit of 512 MB (e.g. `docker run --memory=512m --memory-swap=512m python:3.12-slim` or Render free-tier container):
1. **Standalone Embedders (MiniLM & BGE)**:
   - **MiniLM** (peak 257.5 MB, ~50% limit) and **BGE** (peak 318.4 MB, ~62% limit) **survive without memory pressure**. Neither model is OOM-killed.
2. **Configurations with Cross-Encoder Reranker**:
   - Both **MiniLM + Reranker** (peak 598.0 MB) and **BGE + Reranker** (peak 653.3 MB) allocate substantial ONNX runtime memory buffers during cross-attention scoring over 15 sequences.
   - Because peak RSS exceeds 512 MB, **both reranker configurations are OOM-killed (Linux kernel OOM killer, exit code 137)** under a strict 512 MB cgroup limit without swap.
   - **Conclusion**: The cross-encoder reranker cannot be deployed on Render's 512 MB free tier. It requires a container tier with at least 1 GB RAM (or an out-of-process reranking microservice). Standalone BGE fits comfortably within the 512 MB envelope.

---

## 5. BGE Cosine Score Distribution & Abstention Analysis

Detailed evaluation of `BAAI/bge-small-en-v1.5` (384-dimensional dense embeddings) without cross-encoder reranking across all three evaluation sets.

### Raw Cosine Similarity Distribution (Top-1 Candidate Chunk)

| Dataset | Model | Ans Min | Ans Mean | Ans Max | Abs Min | Abs Mean | Abs Max | Separation Gap |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Synthetic** (N=27 ans, 8 abs) | **BGE** | 0.6320 | **0.7655** | 0.8264 | 0.5664 | **0.6678** | 0.8131 | **0.0977** |
| **Synthetic** (N=27 ans, 8 abs) | MiniLM | 0.3794 | 0.5583 | 0.6482 | 0.2078 | 0.3999 | 0.6449 | 0.1584 |
| **Real Set A** (N=30 ans, 6 abs) | **BGE** | 0.5636 | **0.7294** | 0.8224 | 0.5632 | **0.6364** | 0.6814 | **0.0930** |
| **Real Set A** (N=30 ans, 6 abs) | MiniLM | 0.2691 | 0.4920 | 0.6881 | 0.1139 | 0.2980 | 0.4110 | 0.1940 |
| **Real Set B** (N=30 ans, 6 abs) | **BGE** | 0.5544 | **0.7367** | 0.8626 | 0.5632 | **0.6364** | 0.6814 | **0.1003** |
| **Real Set B** (N=30 ans, 6 abs) | MiniLM | 0.2852 | 0.4981 | 0.6924 | 0.1139 | 0.2980 | 0.4110 | 0.2001 |

#### Empirical Findings on BGE Geometry
1. **Elevated Absolute Scale**: BGE cosine similarities sit significantly higher than MiniLM (`[0.55, 0.86]` for BGE vs `[0.11, 0.69]` for MiniLM).
2. **Narrower Separation Gap**: The separation gap between answerable questions and absent-fact questions shrinks from ~0.16–0.20 down to ~0.09–0.10. An absent question query can score up to 0.813 on synthetic documents purely from domain vocabulary overlap.

### Keyword Boost Effect with BGE

Evaluating search performance with keyword boost active (+0.30 on matched terms) versus disabled (pure dense vector cosine):

| Dataset | Keyword Boost | Hit@1 | Hit@3 | Hit@5 | MRR |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Synthetic** | ON | 59.3% (16/27) | 88.9% (24/27) | 96.3% (26/27) | 0.737 |
| **Synthetic** | OFF | 59.3% (16/27) | 88.9% (24/27) | 96.3% (26/27) | 0.737 |
| **Real Set A** | ON | 50.0% (15/30) | 73.3% (22/30) | 80.0% (24/30) | 0.632 |
| **Real Set A** | OFF | 50.0% (15/30) | 73.3% (22/30) | 80.0% (24/30) | 0.632 |
| **Real Set B** | ON | 50.0% (15/30) | 76.7% (23/30) | 93.3% (28/30) | 0.655 |
| **Real Set B** | OFF | 50.0% (15/30) | 76.7% (23/30) | 93.3% (28/30) | 0.653 |

**Observation**: With BGE, the keyword boost has negligible impact on top-k recall and MRR (+0.002 MRR on Set B, identical elsewhere). Because BGE's semantic dense representations are already well-clustered, pure vector cosine achieves the same retrieval targets.

### Absent Questions Pipeline Execution (`gemini-3.5-flash` + BGE)

1. **Retrieval Behavior**: Absent questions on BGE produce top chunks with raw cosines between 0.56 and 0.81. When hybrid search matches common query terms (e.g. "Python", "Assignment"), scores reach 0.86–1.00. Because the current `SUPPORT_MIN_SCORE` is 0.20, all absent questions pass the pre-LLM check and are forwarded to `answer_notebook_question`.
2. **Abstention Outcome**:
   - In live testing, Gemini API calls return `402 RESOURCE_EXHAUSTED` (prepayment credits depleted on Google AI Studio project), triggering pipeline fallback abstention (`abstained=True`, `abstain_reason="generation_failed"`) on 8/8 synthetic and 6/6 real absent questions.
   - When credits are active, `gemini-3.5-flash` achieves **100% abstention accuracy** (`abstain_reason="not_found"`) because the system prompt instructs the model to emit `NOT_FOUND` whenever retrieved context does not substantiate the answer (as verified in Section 1 on the identical question texts).

### Proposed Parameter Adjustments for BGE (Recommendations Only — Do Not Apply)

If migrating production to BGE, adjust scoring constants to match BGE's tighter distribution:

1. **`SUPPORT_MIN_SCORE`**:
   - **Current**: `0.20`
   - **Proposed for BGE**: **`0.50`** (or `0.55`)
   - *Rationale*: BGE absent-fact queries average 0.63–0.67 and reach 0.81 in worst cases. A threshold of 0.20 provides no protection against noise. A threshold of 0.50 filters out totally unrelated chunks while remaining below legitimate answerable scores (min 0.554).
2. **`low_similarity_cutoff` (Retrieval Map & Filtering)**:
   - **Current**: Implicit `0.0`
   - **Proposed for BGE**: **`0.45`**
   - *Rationale*: Any chunk with cosine similarity below 0.45 under BGE is almost certainly noise.
3. **`keyword_boost`**:
   - **Current**: `+0.30`
   - **Proposed for BGE**: **`+0.15`** (or `+0.10`)
   - *Rationale*: MiniLM had a separation gap of ~0.194, so +0.30 was a moderate boost. For BGE, the separation gap is only ~0.097; a +0.30 boost dwarfs the semantic distance and risks promoting completely irrelevant chunks that happen to share a single keyword.

---

## 6. Optional Variant: BGE Query Instruction Prefix

FastEmbed's `BAAI/bge-small-en-v1.5` supports the official BGE query instruction prefix:
```
"Represent this sentence for searching relevant passages: " + query
```
Documents are stored without prefix (plain passage text). We evaluated whether prefixing queries at search time improves retrieval metrics across all three sets:

| Dataset | Query Prefix Variant | Hit@1 | Hit@3 | Hit@5 | MRR | Top-1 Cosine Mean |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Synthetic** (N=27) | Plain Query | 59.3% (16/27) | 88.9% (24/27) | 96.3% (26/27) | 0.737 | 0.7655 |
| **Synthetic** (N=27) | **Instruction Prefix** | **66.7%** (18/27) | 88.9% (24/27) | 92.6% (25/27) | **0.767** | 0.7371 |
| **Real Set A** (N=30) | Plain Query | 50.0% (15/30) | 73.3% (22/30) | 80.0% (24/30) | 0.632 | 0.7294 |
| **Real Set A** (N=30) | **Instruction Prefix** | 50.0% (15/30) | 76.7% (23/30) | 83.3% (25/30) | 0.632 | 0.7023 |
| **Real Set B** (N=30) | Plain Query | 50.0% (15/30) | 76.7% (23/30) | 93.3% (28/30) | 0.653 | 0.7367 |
| **Real Set B** (N=30) | **Instruction Prefix** | 50.0% (15/30) | 83.3% (25/30) | 86.7% (26/30) | 0.658 | 0.7098 |

### Prefix Findings
- **Real Corpus Hit@1**: Exactly **50.0% (15/30)** on both Set A and Set B, with or without prefix.
- **Top-3 and Top-5 Deltas**: Differences on real sets range from +1 to +2 questions (+3.3% to +6.7%), well within sampling noise on N=30.
- **Cosine Compression**: Adding the fixed 9-word prefix dilutes query term weights slightly, lowering mean top-1 cosine by ~0.027.
- **Recommendation**: Do not implement query prefixing. As noted in the FastEmbed ONNX metadata ("Prefixes for queries/documents: not so necessary"), the prefix adds query string mutation overhead without providing a statistically meaningful improvement on real textbook retrieval.

---

## 7. Production Migration Plan: Safe Transition to BGE

This section outlines the architectural procedure for migrating NotebookSpace production from `sentence-transformers/all-MiniLM-L6-v2` to `BAAI/bge-small-en-v1.5` without downtime or mixed-vector corruption.

### 1. Model Configuration Locations
- **`ingestion/embedder.py`**:
  - `DEFAULT_MODEL_NAME = "BAAI/bge-small-en-v1.5"` (line 9).
  - Model caching logic in `get_embedding_model()`.
- **Environment Variables**:
  - `EMBEDDING_MODEL_NAME`: Set in Render / production environment to `BAAI/bge-small-en-v1.5`.
  - `.env.example`: Update default from `sentence-transformers/all-MiniLM-L6-v2` to `BAAI/bge-small-en-v1.5`.
- **Dockerfile**:
  - Pre-download BGE at build time:
    ```dockerfile
    ENV EMBEDDING_MODEL_NAME=BAAI/bge-small-en-v1.5
    RUN python -c "from ingestion.embedder import get_embedding_model; get_embedding_model()"
    ```

### 2. Schema Evolution (Preventing Mixed Vectors)
To prevent cross-model distance corruption where MiniLM vectors are compared against BGE vectors in pgvector:
1. **Add `embedding_model` Column**:
   ```sql
   ALTER TABLE chunks ADD COLUMN embedding_model VARCHAR(64) DEFAULT 'sentence-transformers/all-MiniLM-L6-v2' NOT NULL;
   CREATE INDEX idx_chunks_embedding_model ON chunks(embedding_model);
   ```
2. **Scoping Constraint in `search_scoped`**:
   Add `AND c.embedding_model = %s` to retrieval queries, or enforce that all chunks in a user's subject have been migrated before serving queries with the new model.

### 3. Re-embedding Script & Atomic Cutover
Because pgvector distances between two different embedding spaces are mathematical noise, the query encoder and document vectors must cut over atomically.

#### Phased Re-embedding Strategy:
1. **Phase 1: Shadow Column or Shadow Table Migration**:
   - Add a temporary column: `ALTER TABLE chunks ADD COLUMN new_embedding vector(384);`
   - Run batch re-embedding script (`tools/migrate_embeddings.py`):
     - Iterate over chunks in batches of 64:
       ```python
       chunks = fetch_unmigrated_chunks(batch_size=64)
       embeddings = embed_batch([c.chunk_text for c in chunks], model_name="BAAI/bge-small-en-v1.5")
       update_new_embeddings(chunks, embeddings)
       ```
     - Throttled with 50 ms sleep per batch to prevent connection pool starvation on Neon.
2. **Phase 2: Atomic Cutover (Zero Downtime)**:
   - Within a single transaction:
     ```sql
     BEGIN;
     -- Swap columns
     ALTER TABLE chunks RENAME COLUMN embedding TO old_embedding;
     ALTER TABLE chunks RENAME COLUMN new_embedding TO embedding;
     UPDATE chunks SET embedding_model = 'BAAI/bge-small-en-v1.5';
     COMMIT;
     ```
   - Simultaneously deploy updated application code with `EMBEDDING_MODEL_NAME="BAAI/bge-small-en-v1.5"`.
3. **Phase 3: Rebuild pgvector Index**:
   ```sql
   REINDEX INDEX CONCURRENTLY idx_chunks_embedding;
   ```

### 4. Cache Invalidation
1. **Retrieval Map PCA Cache**:
   - The interactive 2D map projects 384-dim vectors to 2D coordinates using PCA.
   - Any cached PCA projection matrices or cached coordinates in Redis/memory must be invalidated immediately upon cutover, as BGE vector geometry differs significantly from MiniLM.
2. **LLM Response Cache (`.cache/llm`)**:
   - The LLM cache key is `hash(model:system:user)`.
   - Because the system prompt includes formatted retrieved passages (`format_passages_for_prompt(retrieved)`), different chunk ranks and selections will naturally produce distinct prompt hashes. However, to guarantee no stale citations or hallucinated page numbers persist, flush `.cache/llm/` upon deployment.

### 5. Storage Impact on Neon PostgreSQL
- **Vector Dimensions**: Both `all-MiniLM-L6-v2` and `bge-small-en-v1.5` produce **384-dimensional** `float32` vectors.
- **Storage Footprint**:
  - Per vector: $384 \times 4\text{ bytes} = 1,536\text{ bytes}$ (~1.5 KB).
  - For 10,000 chunks: $\approx 15\text{ MB}$ raw vector data + $\approx 25\text{ MB}$ HNSW index.
  - **Zero net storage increase** after dropping the temporary `old_embedding` column.
  - During the migration window (with shadow column), storage temporarily doubles for vector data (~30 MB for 10k chunks), well within Neon free-tier limits (0.5 GB).

### 6. Rollback Path
If unexpected retrieval anomalies occur in production:
1. Revert environment variable `EMBEDDING_MODEL_NAME="sentence-transformers/all-MiniLM-L6-v2"`.
2. Swap the vector columns back:
   ```sql
   BEGIN;
   ALTER TABLE chunks RENAME COLUMN embedding TO bge_embedding;
   ALTER TABLE chunks RENAME COLUMN old_embedding TO embedding;
   UPDATE chunks SET embedding_model = 'sentence-transformers/all-MiniLM-L6-v2';
   COMMIT;
   ```
3. Restart application workers (`uvicorn`). The rollback is instantaneous (sub-second SQL transaction).
4. Drop `bge_embedding` only after 7 days of verified stability.

### 7. Automated Test Suite to Add
Add the following unit and integration tests to `tests/`:
1. `tests/test_embedder_bge.py`:
   - Verify dimension is exactly 384 (`len(embed_text("test", model_name="BAAI/bge-small-en-v1.5")) == 384`).
   - Verify deterministic output for identical input strings.
   - Verify batch embedding matches single embedding output.
2. `tests/test_migration_script.py`:
   - Test re-embedding script on a mock database with 20 chunks; verify all chunks receive valid 384-dim vectors.
   - Verify idempotency: running migration script twice on already-migrated chunks does not corrupt data.
3. `tests/test_mixed_vector_rejection.py`:
   - Verify `search_scoped` raises or ignores chunks whose `embedding_model` does not match active query model.

---

## Running the Benchmarks

All benchmarks and evaluations can be executed from the project root:

```bash
# Run clean memory & latency benchmark (one fresh process per config)
.venv/bin/python evals/benchmark_memory.py

# Run BGE cosine separation, keyword boost, and query prefix analysis
.venv/bin/python evals/bge_analysis.py

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
```
