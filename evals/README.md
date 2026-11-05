# Retrieval Evaluation Benchmark

This directory contains the automated retrieval and answer-grounding evaluation benchmark for NotebookSpace.

## Benchmark Results

Evaluated on **35 questions** (N=27 answerable spanning factual baseline, paraphrased, multi-chunk/multi-page, conflicting updates, near-duplicate wording, and keyword distractor queries, plus N=8 absent-fact questions). Measured with gemini-2.5-flash-lite on a synthetic corpus.

| Metric | Hybrid Search (Cosine + Keyword Boost) | No Boost (Pure Vector Cosine) | Notes |
| :--- | :---: | :---: | :--- |
| **Hit@1 (Top-1 Hit Rate)** | **59.3%** (16 / 27) | **59.3%** (16 / 27) | Ranks target passage at rank 1 |
| **Hit@3 (Top-3 Hit Rate)** | **92.6%** (25 / 27) | **92.6%** (25 / 27) | Ranks target passage in top 3 |
| **Hit@5 (Top-5 Hit Rate)** | **100.0%** (27 / 27) | **100.0%** (27 / 27) | Target passage retrieved in all top-5 candidates |
| **Mean Reciprocal Rank (MRR)** | **0.751** | **0.751** | Average reciprocal rank of first hit ($1/\text{rank}$) |
| **Absent-Fact Abstention Accuracy** | **100.0%** (8 / 8) | **100.0%** (8 / 8) | Correctly abstained with reason `"not_found"` |

### Metric Equality Between Hybrid and No-Boost on this Dataset
While Hybrid and No-Boost achieved identical aggregate metrics on this test set, **the keyword boost does alter ranking**:
- The keyword boost changed the top-5 order on 8 of 24 answerable questions but never changed the rank of the first correct passage, so the aggregate metrics matched.
- When including the 3 new distractor questions (`q33`–`q35`), 9 of 27 answerable questions had top-5 candidate order changes between Hybrid and No-Boost.
- Because the *first hit* for each of those questions was already ranked at position 1 (or position 2) by vector cosine similarity, the first-hit rank was unaffected, producing identical Hit@1/3/5 and MRR figures.
- A dedicated unit test in `tests/test_retrieval_map.py::test_keyword_boost_flips_ranking` verifies that the keyword boost flips candidate chunk rankings when a chunk with lower semantic cosine contains query key terms.

---

## Evaluation Dataset Breakdown

The benchmark evaluates 35 questions across 7 categories:
1. **Factual Baseline (`q01`–`q12`)**: Direct factual questions with terminology matching the documents.
2. **Paraphrased (`q13_para`–`q15_para`)**: Questions using synonyms and natural phrasing without quoting document vocabulary.
3. **Multi-Chunk / Multi-Page (`q16_multi`–`q18_multi`)**: Questions requiring synthesis across multiple pages or between syllabus and update announcements.
4. **Conflicting Sources (`q19_conf`–`q20_conf`)**: Questions specifically testing whether updated policies/dates in announcements are retrieved over superseded syllabus entries.
5. **Near-Duplicate Wording (`q21_dup`–`q24_dup`)**: Questions discriminating between similar assignments (Assignment 1 key-value store vs Assignment 2 Raft consensus).
6. **Absent-Fact Questions (`q25_abs`–`q32_abs`)**:
   - 4 Out-of-Domain (`q25_abs`–`q28_abs`): PyTorch on Assignment 3, AWS GPU compute credits, presentation dress code, campus meal plan.
   - 4 Vocabulary-Sharing (`q29_abs`–`q32_abs`): Questions mimicking course policy language that do not exist in the documents (penalty-free grace days, grade re-evaluation deadline, maximum group size, midterm extra credit for Raft).
7. **Keyword Distractor Questions (`q33_distractor_policy`–`q35_distractor_rubric`)**:
   - Answerable questions featuring common words like `"policy"` or `"code"` that also appear in irrelevant chunks, testing whether the flat +0.30 boost hurts retrieval. The 3 distractor questions were chosen after probing about 9 candidates:
     - `q33_distractor_policy` (*"What is the policy on sharing code solutions or discussing algorithms with classmates?"*): Target is `syllabus.pdf` p.4 (academic integrity). The word `"policy"` also appears in `announcement_update.pdf` p.1/p.2 and `assignment_2.pdf` p.4. `assignment_2.pdf` p.4 received +0.30 for matching `['policy', 'code']` and was promoted into top 5 (displacing `syllabus.pdf` p.3), but the target `syllabus.pdf` p.4 remained rank #1.
     - `q34_distractor_code` (*"What programming code standard and C++20 conventions must be followed for the exam technical scope?"*): Target is `exam_guide.pdf` p.2 (programming standard). Irrelevant chunk `lecture_schedule.pdf` p.1 matched `['programming', 'standard', 'code', 'exam']` and held rank #1 in both hybrid and no-boost, while target `exam_guide.pdf` p.2 remained at rank #2 in both.
     - `q35_distractor_rubric` (*"What is the grading policy and point breakdown for clean code formatting and comments in Assignment 1?"*): Target is `assignment_1.pdf` p.3 (code style rubric). Irrelevant chunk `assignment_2.pdf` p.4 matched `['grading', 'policy', 'breakdown', 'code', 'point', 'Assignment']` taking rank #2 (score 0.814), right behind the target at rank #1 (score 0.864).
   - Finding: The flat +0.30 boost promoted distractor chunks within non-target top-5 slots but did not degrade the target passage's first-hit rank.

---

## Important Benchmark Notes

1. **Synthetic Corpus**: The underlying corpus indexes 7 course documents from `docs/sample_docs` (`announcement_update.pdf`, `assignment_1.pdf`, `assignment_2.pdf`, `exam_guide.pdf`, `lecture_schedule.pdf`, `syllabus.pdf`, `tutorial_02_arrays.pdf`).
2. **Author-Written Questions**: All 35 questions were written by the author to reflect realistic university course queries.
3. **Vocabulary-Sharing Absent Questions Added Post-Initial Run**: The initial 16-question set only contained out-of-domain absent queries (`q13`–`q16`). Four vocabulary-sharing absent questions (`q29_abs`–`q32_abs`) were subsequently added to rigorously test whether the system relies solely on vector similarity or properly validates grounded support.
4. **Raw Cosine Separation Limit**:
   - **Answerable Questions (N=27)**: Raw cosine similarity range: **0.379** (min) to **0.648** (max), mean **0.558**.
   - **Absent Questions (N=8)**: Raw cosine similarity range: **0.208** (min) to **0.645** (max), mean **0.400**.
   - **Critical finding**: Raw cosine alone **cannot separate vocabulary-sharing absent questions from answerable ones**. For example, `q30_abs` (*"What is the deadline for submitting grade re-evaluation requests following the midterm examination?"*) scores a raw cosine of **0.645**, higher than the mean for answerable questions (**0.558**), because the words *"grade"*, *"midterm"*, and *"examination"* have high vector proximity to the course text.
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
