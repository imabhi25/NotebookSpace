# Evaluation Protocol and Methodology

This document outlines the evaluation principles, datasets, and execution protocols used to measure retrieval and question-answering performance across course documents.

## Evaluation Philosophy

The primary objective of the evaluation pipeline is honest and transparent error analysis. Rather than optimizing for vanity scores, the system is designed to expose failure modes:
- Where retrieval misses relevant passages.
- Where language models hallucinate answers for unsupported questions.
- Where citations point to incorrect pages.
- Where document conflicts are either missed or falsely reported.

## Core Protocols

### 1. Labels Written Before Results
Ground truth annotations—including target files, page numbers, and conflict expectations—are written and frozen before inspecting model outputs. Annotators inspect the extracted raw text directly via `tools/dump_pages.py` to ensure expectations align with what the parser and chunker ingest. Labels are never retroactively modified to accommodate model mistakes.

### 2. Tuning Set Separate from Test Set
To prevent overfitting:
- **Test Set (`evaluation/questions.json`)**: The authoritative benchmark dataset. It is strictly held out and never used to tune prompt templates, adjust chunking parameters, or calibrate similarity thresholds.
- **Tuning Set (`evaluation/tuning_questions.json`)**: A separate dataset used exclusively for development, prompt engineering, and hyperparameter exploration.

Structural integrity and schema validity for both datasets are enforced via `tools/validate_questions.py`.

### 3. Baseline First
Evaluation begins with a plain vector retrieval baseline using top-k similarity search. Any subsequent enhancements (such as rerankers, keyword matching, or hybrid search) must be evaluated against this recorded baseline under identical test conditions. If a proposed technique does not demonstrate a clear reduction in concrete failure modes, it is not adopted.

## Metrics Defined

Every evaluation run records the following metrics:

- **Retrieval Hit Rate (top-3 and top-5)**: Measures whether at least one ground-truth source page is present among the top retrieved chunks for answerable queries.
- **Citation Accuracy**: Measures whether cited pages correspond directly to labelled source pages supporting the claim.
- **Unsupported-Answer Rate**: Measures how frequently the system attempts to answer a question that cannot be answered from the provided documents instead of properly abstaining.
- **Abstention on Answerable Questions**: Measures false refusals where valid answers existed in the documents but the system abstained.
- **Conflict Detection Rate**: Measures the system's ability to identify conflicting facts across distinct documents and cite all opposing sources.
- **False-Positive Conflict Rate**: Measures how often spurious conflicts are reported for non-conflicting documents.
- **Latency and Cost Tracking**: Records median (p50) and tail (p95) execution latency, input and output token consumption, and projected cost per batch of questions.

## Failure Reporting

Aggregating metrics alone can conceal recurring failure patterns. Every evaluation execution records and surfaces the worst failure cases per question category:
- Single-page lookups
- Multi-page synthesis
- Unsupported questions
- Conflicting document assertions

Each failure record includes:
- **Question**: The exact query submitted.
- **Expected**: Ground-truth target pages or required abstention.
- **Retrieved Pages**: Passages surfaced by vector search.
- **Model Answer**: The answer and citations produced by the model.
- **Failure Reason**: Specific cause of failure (e.g. wrong page cited, hallucinated response, missed conflict).

## Running Evaluations

Evaluations are executed via `evaluation/run_answer_eval.py`.

To ensure every benchmark run is identifiable and reproducible, runs against the test set require an explicit label:

```bash
# Evaluating the test set with an explicit label and Markdown output
python evaluation/run_answer_eval.py --questions evaluation/questions.json --label baseline --markdown

# Evaluating the tuning set during development
python evaluation/run_answer_eval.py --questions evaluation/tuning_questions.json --label prompt_exp_v1
```

Evaluation artifacts are stored in `evaluation/results/`:
- `<label>_<timestamp>.json`: Complete machine-readable results, summary rates, and full failure dumps.
- `<label>_<timestamp>.md`: Formatted Markdown report summarizing metrics and detailing the worst failure cases per category.
