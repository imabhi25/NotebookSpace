# Retrieval Evaluation Benchmark

This directory contains the automated retrieval and answer-grounding evaluation benchmark for NotebookSpace.

## Benchmark Results

Evaluated on **32 questions** (24 answerable spanning factual baseline, paraphrased, multi-chunk/multi-page, conflicting updates, and near-duplicate wording, plus 8 absent-fact questions).

| Metric | Hybrid Search (Cosine + Keyword Boost) | No Boost (Pure Vector Cosine) | Notes |
| :--- | :---: | :---: | :--- |
| **Hit@1 (Top-1 Hit Rate)** | **58.3%** (14 / 24) | **58.3%** (14 / 24) | Ranks target passage at rank 1 |
| **Hit@3 (Top-3 Hit Rate)** | **91.7%** (22 / 24) | **91.7%** (22 / 24) | Ranks target passage in top 3 |
| **Hit@5 (Top-5 Hit Rate)** | **100.0%** (24 / 24) | **100.0%** (24 / 24) | Target passage retrieved in all top-5 candidates |
| **Mean Reciprocal Rank (MRR)** | **0.741** | **0.741** | Average reciprocal rank of first hit ($1/\text{rank}$) |
| **Absent-Fact Abstention Accuracy** | **100.0%** (8 / 8) | **100.0%** (8 / 8) | Correctly abstained with reason `"not_found"` |

### Metric Equality Between Hybrid and No-Boost on this Dataset
While Hybrid and No-Boost achieved identical aggregate metrics (Hit@1/3/5 and MRR = 0.741) on this particular 24-question test set, **the keyword boost does alter ranking**.
- In 8 out of 24 answerable questions, the top-5 candidate ordering differed between Hybrid and No-Boost (e.g., intermediate chunks swapping ranks or entering the top 5 due to keyword matches).
- Because the *first hit* for each of those 8 questions was already ranked at position 1 by both models, the first-hit rank was unaffected, producing identical Hit@1/3/5 and MRR figures.
- A dedicated unit test in `tests/test_retrieval_map.py::test_keyword_boost_flips_ranking` verifies that the keyword boost flips candidate chunk rankings when a chunk with lower semantic cosine contains query key terms.

---

## Evaluation Dataset Breakdown

The benchmark evaluates 32 questions across 6 categories:
1. **Factual Baseline (`q01`–`q12`)**: Direct factual questions with terminology matching the documents.
2. **Paraphrased (`q13_para`–`q15_para`)**: Questions using synonyms and natural phrasing without quoting document vocabulary.
3. **Multi-Chunk / Multi-Page (`q16_multi`–`q18_multi`)**: Questions requiring synthesis across multiple pages or between syllabus and update announcements.
4. **Conflicting Sources (`q19_conf`–`q20_conf`)**: Questions specifically testing whether updated policies/dates in announcements are retrieved over superseded syllabus entries.
5. **Near-Duplicate Wording (`q21_dup`–`q24_dup`)**: Questions discriminating between similar assignments (Assignment 1 key-value store vs Assignment 2 Raft consensus).
6. **Absent-Fact Questions (`q25_abs`–`q32_abs`)**:
   - 4 Out-of-Domain (`q25_abs`–`q28_abs`): PyTorch on Assignment 3, AWS GPU compute credits, presentation dress code, campus meal plan.
   - 4 Vocabulary-Sharing (`q29_abs`–`q32_abs`): Questions mimicking course policy language that do not exist in the documents (penalty-free grace days, grade re-evaluation deadline, maximum group size, midterm extra credit for Raft).

---

## Important Benchmark Notes

1. **Synthetic Corpus**: The underlying corpus of 5 PDF documents (`syllabus.pdf`, `assignment_1.pdf`, `assignment_2.pdf`, `announcement_update.pdf`, `exam_guide.pdf`) was synthetically generated via `evals/make_sample_docs.py` using ReportLab.
2. **Author-Written Questions**: All 32 questions were written by the author to reflect realistic university course queries.
3. **Vocabulary-Sharing Absent Questions Added Post-Initial Run**: The initial 16-question set only contained out-of-domain absent queries (`q13`–`q16`). Four vocabulary-sharing absent questions (`q29_abs`–`q32_abs`) were subsequently added to rigorously test whether the system relies solely on vector similarity or properly validates grounded support.
4. **Raw Cosine Separation Limit**:
   - **Answerable Questions**: Raw cosine similarity range: **0.379** (min) to **0.648** (max), mean **0.565**.
   - **Absent Questions**: Raw cosine similarity range: **0.208** (min) to **0.645** (max), mean **0.400**.
   - **Critical finding**: Raw cosine alone **cannot separate vocabulary-sharing absent questions from answerable ones**. For example, `q30_abs` (*"What is the deadline for submitting grade re-evaluation requests following the midterm examination?"*) scores a raw cosine of **0.645**, higher than the mean for answerable questions (**0.565**), because the words *"grade"*, *"midterm"*, and *"examination"* have high vector proximity to the course text.
   - Therefore, vector thresholding alone is insufficient; downstream LLM grounded evidence verification is required to detect absent facts.
5. **Model Used**: The evaluation was executed using Google Gemini **`gemini-2.5-flash-lite`** via `GeminiLLMClient`.
6. **Cache Usage (`.cache/llm`)**:
   - On the initial run of absent questions, real live API calls were made to Google's Generative Language API, returning `{"supported": false, "answer": "NOT_FOUND"}`.
   - These model responses were serialized to `.cache/llm/<hash>.json`. On subsequent evaluation runs, the responses were read from `.cache/llm` to avoid duplicate API latency and quota consumption.

---

## Running the Benchmark

To execute the full retrieval and answer-grounding evaluation benchmark:

```bash
.venv/bin/python evals/run_retrieval_eval.py
```
