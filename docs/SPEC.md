# NotebookSpace: Project Spec

A web app where you upload course documents, ask questions, and get answers that cite the exact file and page, or say "not found" when the documents don't support an answer. Its main deliverable is a published evaluation that shows where it fails.

## Goal and scope

**It will:**
- Accept PDFs of syllabi, lecture notes and slides, and index them by page.
- Answer a question with a short answer plus the file and page numbers it came from.
- Refuse to answer when the retrieved pages don't support one, and say what is missing.
- Flag when two documents disagree (for example, a syllabus and a later announcement giving different due dates), and show both sources.
- Ship a written evaluation covering bad retrieval, unsupported answers, conflicting documents, latency and cost per question.

**It will not:**
- Handle scanned images or handwriting in version 1 (text-based PDFs only).
- Have accounts, sharing or multi-user permissions. One user, one workspace.
- Use fine-tuning. The work is in retrieval, prompting and measurement.

**Public demo rule:** the public demo uses a sample set of openly licensed course notes, not university material. Private course documents are used only for the evaluation, and only aggregate numbers are published.

## How it works

Every answer follows the same path, and each step is logged so the evaluation can say which step failed.

1. **Upload and parse.** Extract text page by page, keeping file name and page number with every piece of text.
2. **Chunk.** Split each page into passages of roughly 200 to 400 words with a small overlap, never crossing a page boundary.
3. **Embed and store.** Store vectors in PostgreSQL with pgvector, next to file, page and upload date.
4. **Retrieve.** Fetch the top passages by vector similarity. This plain retrieval is the baseline; nothing fancier is added until the evaluation shows it helps.
5. **Check support.** Decide whether the retrieved passages contain the answer. If not, abstain and say what was searched.
6. **Answer with citations.** The model answers only from the retrieved passages and cites file and page for each claim. An answer with no valid citation is rejected.
7. **Detect conflicts.** If passages from different documents give different values for the same fact, show both with sources and dates, and do not pick one silently.

Backend: FastAPI. Frontend: React, with the answer on the left and the cited pages on the right.

## Evaluation plan

About 60 hand-written questions over two or three document sets, labelled in advance with the correct file and page (or "no answer").

| Question type | Count | Correct means |
|---|---|---|
| Answerable from one page | 25 | Correct answer, cited page is the labelled one |
| Answerable only by combining two pages | 10 | Correct answer, both labelled pages cited |
| Not answered anywhere in the documents | 15 | The system abstains instead of guessing |
| Documents disagree | 10 | Both sources shown and the conflict named |

**Metrics**, each reported with the failures behind it:
- **Retrieval hit rate:** how often the labelled page appears in the top 3 and top 5.
- **Citation accuracy:** how often each cited page supports the claim next to it.
- **Unsupported-answer rate:** how often the system answers a "not in the documents" question anyway.
- **Abstention on answerable questions:** how often it refuses when the answer was available.
- **Conflict detection:** how many disagreeing-document questions are flagged.
- **Latency and cost:** median and 95th-percentile seconds per question, and dollars per 100 questions.

**Baseline first:** run plain vector retrieval and record every number. Add keyword search, hybrid search or a reranker only if a specific failure points to it, and report before and after. If a change doesn't help, say so.

**Honesty rules:** labels are written before any results are seen; the 60 questions are never used to tune prompts (write 10 extra questions for tuning); the write-up includes at least five concrete failed examples.

## Stack and cost

| Part | Choice |
|---|---|
| Database | PostgreSQL with pgvector (Neon free tier) |
| Backend | FastAPI |
| Frontend | React and TypeScript on Vercel |
| Embeddings | Small open-source model run locally (sentence-transformers) |
| Answer model | One hosted language model via API, with a hard spending cap |
| Tests and CI | pytest, Vitest, GitHub Actions |

Keeping spend near zero: run the full evaluation locally, cache repeated answers, record tokens per question from day one, and set a hard monthly limit before the first API call.

## Milestones

| Week | Build | Done when |
|---|---|---|
| 1 | PDF parsing with page numbers, chunking, pgvector storage, plain retrieval, labelled test set | Retrieval hit rate measured on the full test set |
| 2 | Answer generation with citations, support check, abstention | Unsupported-answer rate and citation accuracy measured |
| 3 | Conflict detection, React interface | All four question types scored |
| 4 | Evaluation write-up with failures, deployment, README | A stranger can run it and read the results |

If week 1 or 2 runs long, shrink the conflict test set before cutting the evaluation.

## Risks

- **PDF parsing is messy.** Test the parser on real files before building on top of it.
- **Labelling takes time.** It is the core of the project; do it first, in small batches.
- **A model that sounds sure but is wrong.** This is what the unsupported-answer metric measures; a bad number is a finding.
- **Cost creep.** Hard cap and token logging from the first call.

## Resume claims

Only claim what the evaluation measured, using the real numbers.
