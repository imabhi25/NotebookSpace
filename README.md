# NotebookSpace — Subject-Based Study Notebook

A subject-based study notebook inspired by Gemini Notebook / NotebookLM, built on top of the Course-Document Assistant.
Create independent course subjects, ingest syllabi, slides, and web materials, and select active sources for retrieval.
Engage in multi-turn conversations with verified citations, inspect 2D PCA retrieval scoring, and capture answers as personal study notes.

**Live app:** [https://notebookspace.vercel.app](https://notebookspace.vercel.app) (frontend on Vercel · backend API on Render)

[![Watch Desktop Demo](docs/media/01-desktop-qa-citation-highlight.png)](docs/media/demo-desktop.mp4)
*Desktop Q&A walkthrough with citation highlight — click screenshot to watch demo clip (`docs/media/demo-desktop.mp4`).*

![Desktop Retrieval Inspector and 2D PCA Projection](docs/media/02-desktop-retrieval.png)
*Desktop Retrieval tab: 2D PCA embedding projection, query point, raw cosine, and final score ranking.*

![Dark Mode Sample Notebook with Retrieval Inspector](docs/media/04-desktop-dark-retrieval.png)
*Dark mode sample notebook with right-panel Retrieval inspector.*

## Core Capabilities

- **Subject Management**: Each subject functions as an isolated notebook with its own materials, conversations, source selections, and study notes. Create, edit, search, sort, archive, restore, and delete subjects with persistent URLs (`/` for dashboard, `/subject/:id` for workspace).
- **One-click guest sample notebook**: On an empty dashboard, guests can create a sample notebook with one click. The sample is pre-seeded with a short labelled **Sample** Q&A so the first open shows a worked example; a new user question still runs real retrieval against the sample source. This guest sample path is separate from the legacy public demo workspace (`/demo`).
- **Source Management**: Ingest materials via PDF upload (with scanned PDF detection/warning), TXT and Markdown files, pasted text with custom titles, or public webpage URLs (with SSRF protection against internal/private IPs). Track status: uploading, processing, ready, or failed. Rename, delete, retry, or replace sources without stale index leakage.
- **Source Selection & Boundary Isolation**: Checkbox controls allow selective context targeting (Select all / Clear). Retrieval strictly isolates embeddings by authenticated user and active subject; deselected sources are never searched, and cross-subject queries return honest abstentions.
- **Conversational Chat**: Multi-turn chat with conversation history expansion. Support for follow-up questions, multiline input (Enter sends, Shift+Enter newline), configurable response length (concise, default, detailed) and response style (general, learning-guide), copy answers, and starter questions generated from ready sources.
- **Grounded Answers & Citations**: Responses are grounded strictly in selected documents with mathematical notation (KaTeX) and formatted Markdown. Compact inline citation chips `[document.pdf p.N]` can be clicked to open the side inspector and highlight the matching passage in document context (one card per activation).
- **Retrieval inspector**: The right-hand panel includes a **Retrieval** tab that shows an approximate 2D PCA scatter of the notebook’s chunks, the query point, and top-k passages with **raw cosine** similarity and a **final score** after a heuristic keyword boost. Passages in the ranked list are selectable so you can inspect different hits. The PCA projection is approximate (not a faithful embedding-space map). Any “Low similarity” hint is a heuristic only—not a calibrated confidence score.
- **Conflicting Document Handling**: When multiple sources state conflicting facts (e.g. updated syllabus vs earlier announcement), both documents are explicitly cited and highlighted.
- **Saved Study Notes**: Save any helpful answer to study notes with full citation lineage, or compose and edit personal study notes within the subject.
- **Persistence & Security**: PostgreSQL schema with migrations for users, sessions, subjects, sources, chunks, conversations, messages, and notes. Password hashing with PBKDF2-HMAC-SHA256, session token authorization, and complete server-side ownership verification.
- **Legacy public demo**: The older public demo workspace (`/demo`) remains available with disabled uploads and rate limiting for portfolio testing. Prefer the one-click guest sample on the empty dashboard for a quick live walkthrough on the current product.

## Screenshots & demo clip

Captions describe what each frame actually shows (not the original capture filename).

1. [Desktop Q&A with citation highlight](docs/media/01-desktop-qa-citation-highlight.png) (`docs/media/01-desktop-qa-citation-highlight.png`) — late-policy answer with citation opening the highlighted `syllabus.pdf` p.2 passage.
2. [Desktop Retrieval plot and ranked passages](docs/media/02-desktop-retrieval.png) (`docs/media/02-desktop-retrieval.png`) — detail panel shows the selected lower-ranked hit: Page 1 / Chunk 0, raw 0.128, final 0.128. **Not** a rank-1 selection shot.
3. [Desktop Retrieval rank #2 selected](docs/media/03-desktop-retrieval-rank2-selected.png) (`docs/media/03-desktop-retrieval-rank2-selected.png`) — Page 1, raw/final 0.128, Low similarity.
4. [Desktop dark mode sample notebook](docs/media/04-desktop-dark-retrieval.png) (`docs/media/04-desktop-dark-retrieval.png`) — Notes tab empty state visible in this frame.
5. [Narrow-viewport Retrieval scorecard](docs/media/05-mobile-retrieval-scorecard-scrolled.png) (`docs/media/05-mobile-retrieval-scorecard-scrolled.png`) — ~390px-wide CSS emulation (not a physical-device test): **rank #1** selected — Page 2, raw 0.561, final 0.861, matched terms `policy` / `late` / `submission`.

Demo clip: [demo-desktop.mp4](docs/media/demo-desktop.mp4) — warm-backend desktop session (visible flow / privacy banner / legibility). Exact model string is not claimed from the clip.


## What It Measures

The primary deliverable of this project is an honest, empirical evaluation of where retrieval and language models succeed and fail. The system measures retrieval hit rate across top passages, citation accuracy, unsupported-answer rates on unanswerable queries, false abstention on answerable questions, conflict detection precision when documents disagree, as well as latency percentiles and token costs.

There are **two established evaluation suites and one pending real-corpus extension** in this repository—do not conflate them:

1. **Answer / labelling suite (`evaluation/`)** — the older 60-question frozen benchmark and labelling tools documented in [evaluation/README.md](evaluation/README.md) and [evaluation/RESULTS.md](evaluation/RESULTS.md).
2. **Retrieval suite (`evals/`)** — a **35-question synthetic-corpus** retrieval benchmark (hit@1/3/5, MRR, keyword-boost on/off, abstain; 23 chunks, strict scoring, top-5 covers ~22% of chunks). Methodology and reported synthetic numbers live in [evals/README.md](evals/README.md). Run with:
   ```bash
   .venv/bin/python evals/run_retrieval_eval.py
   ```
3. **OpenStax real-corpus eval (`evals/`, eval-v2)** — **PENDING / not run**. Planned work uses a CC BY 4.0 OpenStax *Introduction to Python Programming* source under `evals/corpus_real_src/` and chapter PDFs under `evals/corpus_real/`. No real-corpus metrics are claimed here until that run completes.

---

## Architecture & Stack

- **Backend**: FastAPI with PostgreSQL and `pgvector` extension (hosted on [Render](https://render.com); database commonly on Neon free tier).
- **Frontend**: React + TypeScript + Vite (hosted on [Vercel](https://vercel.com); live at [notebookspace.vercel.app](https://notebookspace.vercel.app/)).
- **Embeddings**: `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional dense vectors, cached via FastEmbed ONNX runtime).
- **LLM**: Google Gemini (the live app runs on the Gemini API free tier with gemini-3.5-flash-lite (about 15 requests per minute and 500 requests per day), so it can return a temporary "unavailable" message when the daily limit is reached).
- **Security**: The LLM API key lives strictly on the backend environment; it is never exposed in frontend code, any `VITE_` variables, or the browser.
- **Deployed API features**: The live Render backend exposes endpoints used by the sample notebook and Retrieval tab (including sample-notebook creation and retrieval-map data). The Vercel frontend alone is not enough for those two features—the backend must be deployed (it is, on the current live site).
- **Public Demo Guardrails**: Demo mode (`DEMO_MODE=true`) disables document uploads (returns 403), enforces IP-based rate limiting on `/ask` (default 10 questions/minute), and pre-seeds only openly licensed synthetic course documents. This applies to the legacy `/demo` path; the one-click guest sample uses the normal product APIs on the live backend.

---

## Quickstart

### Local Setup

1. **Clone the repository and set up Python environment:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Set DATABASE_URL and LLM_API_KEY in .env
   ```

3. **Run database migrations:**
   ```bash
   python db/migrate.py
   ```

4. **Seed sample course documents:**
   ```bash
   python tools/seed_demo.py
   ```

5. **Start backend API:**
   ```bash
   uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
   ```

6. **Start frontend development server:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Docker Setup

Build and run the containerized backend:

```bash
# Build the Docker image
docker build -t course-assistant .

# Run the container
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql://user:password@host:port/dbname" \
  -e LLM_API_KEY="your_api_key" \
  -e LLM_MODEL="gemini-3.5-flash-lite" \
  course-assistant
```

---

## Deployment

The application is designed for free-tier cloud deployment:

- **Database (Neon)**: Provision a free PostgreSQL database with the `pgvector` extension enabled on [Neon](https://neon.tech). Apply migrations using `python db/migrate.py` or by pointing `DATABASE_URL` during startup.
- **Backend (Render)**: Deploy the FastAPI application as a free Web Service on [Render](https://render.com) using `render.yaml` or the Dockerfile. Configure environment variables in the Render dashboard:
  - `DATABASE_URL`: Connection string to your Neon database.
  - `LLM_API_KEY`: Google Gemini API key.
  - `LLM_MODEL`: `gemini-3.5-flash-lite` (the live app runs on the Gemini API free tier with gemini-3.5-flash-lite (about 15 requests per minute and 500 requests per day), so it can return a temporary "unavailable" message when the daily limit is reached).
  - `ALLOWED_ORIGINS`: Comma-separated list of allowed frontend URLs (include `https://notebookspace.vercel.app` and any preview URLs).
  - `DEMO_MODE`: `true` when you want the legacy demo upload prohibition and rate limiting.
  - `DEMO_ASK_PER_MINUTE`: `10`.
  - Keep the service warm enough for guest sample creation and the Retrieval map endpoints; cold starts on free tier can take tens of seconds.
- **Frontend (Vercel)**: Deploy the `frontend/` app to [Vercel](https://vercel.com). Point the production project at this repository’s frontend build, set `VITE_API_BASE_URL` (read from `import.meta.env` in `frontend/src/api.ts`; there is no `frontend/.env.example` in this tree) to the Render backend URL, and use [notebookspace.vercel.app](https://notebookspace.vercel.app/) as the live site. SPA client-side routes are handled by the Vercel/frontend routing config checked into the repo—do not rely on the older Netlify-only setup for production.

---

## Public Demo Mode (legacy `/demo`)

For the older public portfolio demonstration path:
1. Seed the synthetic course documents using `python tools/seed_demo.py`. These documents include deliberate, verifiable conflicts between the syllabus and update announcements (due dates, late submission penalty, and exam dates).
2. Set `DEMO_MODE=true` on the Render backend service. This:
   - Forbids `/upload` endpoint calls with HTTP 403 Forbidden.
   - Enforces per-IP rate limiting on `/ask` calls (preventing quota exhaustion).
   - Serves only synthetic documents.
3. Optionally surface demo badges in the frontend when demo mode is enabled.

For a quick live walkthrough of the **current** product (sample notebook, citations, Retrieval tab), use the one-click guest sample on an empty dashboard at [notebookspace.vercel.app](https://notebookspace.vercel.app/) instead of `/demo`.

---

## Evaluation & Labelling Tools

### Answer / labelling suite (`evaluation/`)

Specialized tooling for ground-truth labelling and the older answer-eval suite:

- **Page Dumper (`tools/dump_pages.py`)**:
  Extracts text page by page with delimiters to inspect exact text ingested by the parser:
  ```bash
  python tools/dump_pages.py docs/sample_docs/
  ```

- **Question Validator (`tools/validate_questions.py`)**:
  Verifies question schemas, checks page bounds against physical documents, and ensures clean test-set formatting:
  ```bash
  python tools/validate_questions.py
  ```

- **Evaluation Runner (`evaluation/run_answer_eval.py`)**:
  Executes the evaluation suite and outputs JSON and Markdown reports with failure breakdowns:
  ```bash
  python evaluation/run_answer_eval.py --questions evaluation/questions.json --label baseline --markdown
  ```

- **Sample Document Generator & Seeder (`tools/make_sample_docs.py`, `tools/seed_demo.py`)**:
  Generates synthetic course documents with intentional cross-document conflicts and seeds the database.

### Baseline Evaluation Results (Partial Baseline & Full Retrieval Audit)

The 60-question frozen benchmark was evaluated on an isolated database containing 6 synthetic course documents (22 physical pages). Complete per-question records are saved in `evaluation/results/partial_baseline_results.json`, with full accounting, error analyses, and retrieval metrics documented in [evaluation/RESULTS.md](evaluation/RESULTS.md).

#### 1. Full Retrieval Evaluation (All 60 Questions, No LLM Calls)
- **Overall Top-3 Any-Source Recall:** 38 / 45 (84.4%)
- **Overall Top-5 Any-Source Recall:** 42 / 45 (93.3%)
- **Single-Page Top-5 Recall (`single_page`):** 22 / 25 (88.0%)
- **Multi-Page All-Required-Sources Recall (`multi_page`):** 7 / 10 (70.0%)
- **Conflicting All-Required-Sources Recall (`conflicting`):** 9 / 10 (90.0%)

#### 2. Partial Generation Evaluation (14 Questions Completed)
- **Status:** 14 / 60 completed (`s1` through `s14`), 1 / 60 halted on API quota (`s15`), 45 / 60 unattempted.
- **Answered Rate:** 14 / 14 (100.0%)
- **Any Expected Page Cited:** 13 / 14 (92.9%)
- **Per-Citation Support Precision:** 16 / 16 (100.0%)
- **Fact Correctness Match:** 13 / 14 (92.9%)
- **Claim Support (Assistant Manual Review):** 14 / 14 (100.0%)
- **Untested Categories:** `multi_page` (0/10), `conflicting` (0/10), and `not_in_documents` (0/15) are marked not evaluated.
- **Inference Latency (p50 / p95):** 3.64s / 18.33s (measured model HTTP duration; excludes 8.0s per-question pacing delay).

### Retrieval suite (`evals/`) — synthetic 35-question benchmark

Evaluated on the synthetic course corpus (7 documents, 23 chunks, 35 questions: 27 answerable spanning factual, paraphrased, multi-page, conflicting, near-duplicate, and keyword distractor queries, plus 8 absent-fact queries). Evaluated with strict scoring (target passage must match expected document and page; top-5 candidates cover about 22% of the 23 corpus chunks). Full methodology and per-category breakdowns live in [evals/README.md](evals/README.md).

| Metric | Hybrid Search (Cosine + Keyword Boost) | Pure Vector Cosine (No Boost) | Description |
| :--- | :---: | :---: | :--- |
| **Hit@1** | **59.3%** (16 / 27) | **59.3%** (16 / 27) | Expected target passage ranked at #1 |
| **Hit@3** | **92.6%** (25 / 27) | **92.6%** (25 / 27) | Target passage in top 3 |
| **Hit@5** | **100.0%** (27 / 27) | **100.0%** (27 / 27) | Target passage in top 5 (~22% corpus coverage) |
| **MRR** | **0.751** | **0.751** | Mean reciprocal rank of first hit ($1/\text{rank}$) |
| **Abstention Accuracy** | **100.0%** (8 / 8) | **100.0%** (8 / 8) | 8/8 (measured with gemini-3.5-flash-lite; the live app runs on the Gemini API free tier with gemini-3.5-flash-lite (about 15 requests per minute and 500 requests per day), so it can return a temporary "unavailable" message when the daily limit is reached) |

*Note: Hybrid search changes top-5 candidate ordering on 9 of 27 answerable questions without displacing the first correct hit, yielding identical first-hit aggregate metrics. See [evals/README.md](evals/README.md) for full benchmark documentation.*

### OpenStax real-corpus eval — PENDING

Real-document chapter ingestion and `run_retrieval_eval.py --corpus real` are **PENDING / not run**. Do not treat synthetic `evals/` numbers as OpenStax results. When that work lands, metrics and a spot-check write-up will be added under `evals/` and summarized here.

---

## Running Tests

Backend and frontend unit/integration tests live under `tests/` and `frontend/`. Run them with the project’s usual commands:

```bash
pytest
```

```bash
cd frontend
npm test
```

End-to-end journey verification (when available in this checkout):

```bash
PYTHONPATH=. python tests/verify_e2e_journey.py
```

Exact current test counts change as suites grow; see CI on the branch under test rather than hard-coding a number here.
