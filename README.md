# NotebookSpace — Subject-Based Study Notebook

A subject-based study notebook inspired by Gemini Notebook / NotebookLM, built on top of the Course-Document Assistant.
Create independent course subjects, ingest syllabi, slides, and web materials, and select active sources for retrieval.
Engage in multi-turn conversations with verified citations, inspect 2D PCA retrieval scoring, and capture answers as personal study notes in an inline WYSIWYG studio.

**Live app:** [https://notebookspace.vercel.app](https://notebookspace.vercel.app) (frontend on Vercel · backend API on Render)

[![Watch Desktop Demo](docs/media/01-desktop-qa-citation-highlight.png)](docs/media/demo-desktop.mp4)
*Desktop Q&A walkthrough with citation highlight — click screenshot to watch demo clip (`docs/media/demo-desktop.mp4`).*

![Desktop Retrieval Inspector and 2D PCA Projection](docs/media/02-desktop-retrieval.png)
*Desktop Retrieval tab: 2D PCA embedding projection, query point, raw cosine, and final score ranking.*

![Dark Mode Sample Notebook with Retrieval Inspector](docs/media/04-desktop-dark-retrieval.png)
*Dark mode sample notebook with right-panel Retrieval inspector.*

---

## Core Capabilities

- **3-Column Workspace & Responsive Layout**:
  - **Left Rail (Sources)**: Source management and context toggle list, collapsible into a compact 52px vertical icon rail or expandable with resizable custom panel widths.
  - **Center Column (Chat & Composer)**: Conversational multi-turn chat stream with pinned composer, starter suggestion chips, configurable answer style (concise, default, detailed), and math notation rendering via KaTeX.
  - **Right Panel (Study Inspector)**: Tabbed workspace offering a Citation & Evidence viewer, interactive 2D PCA Retrieval debugger, and inline WYSIWYG Note Studio.
- **Subject Management**: Each subject functions as an isolated notebook with its own materials, conversations, source selections, and study notes. Create, edit, search, sort, archive, restore, and delete subjects with persistent client-side routing (`/` for dashboard, `/subject/:id` for workspace).
- **One-Click Guest Sample Notebook**: Instant onboarding on an empty dashboard—guests can spin up a pre-seeded sample course notebook in one click, complete with sample sources and grounded Q&A, backed by live retrieval.
- **Source Management & Multi-Format Ingestion**: Ingest course materials via PDF upload (with automatic scanned-page detection and OCR warnings), plain text (.txt), Markdown (.md), pasted text snippets, and public web articles fetched securely with server-side SSRF validation.
- **Boundary Isolation & Context Filtering**: Strict tenant and subject separation. Individual source checkboxes enable surgical context selection (`Select all` / `Clear`); unselected sources are never retrieved, and cross-subject queries return honest abstentions.
- **Hybrid Retrieval with Score Inspectability**:
  - Dense semantic retrieval using `sentence-transformers/all-MiniLM-L6-v2` embeddings (384 dimensions) executed locally via FastEmbed ONNX runtime and stored in PostgreSQL using `pgvector`.
  - Tunable hybrid reranking combining cosine similarity and lexical keyword matching (`alpha` weight slider).
  - Interactive 2D PCA scatter plot mapping query position against chunk clusters, paired with rank-movement indicators and raw vs. boosted score breakdowns.
- **Grounded Answers & Citation Lineage**: Responses are grounded strictly in selected documents with mathematical notation (KaTeX) and formatted Markdown. Compact inline citation chips `[document.pdf p.N]` open the side inspector to highlight matching passages in full context.
- **Conflicting Document Handling**: When multiple sources state conflicting facts (e.g. updated syllabus vs earlier announcement), both documents are explicitly cited and highlighted.
- **Inline WYSIWYG Note Studio**:
  - Rich document editor directly embedded into the right study panel.
  - Formatting toolbar supporting headers (H1–H3), bold, italic, inline code, blockquotes, unordered/ordered lists, horizontal rules, and link insertion.
  - One-click answer-to-note capture with full citation provenance preserved.
  - Defense-in-depth HTML sanitization (`noteHtml.ts`) utilizing DOMParser whitelist rules to block script execution, unsafe URI schemes (`javascript:`, `data:`), and malicious attributes.
- **Google Modern Web Guidance Implementations**:
  - **CSS Container Queries (`@container`)**: Adaptive component layout adjustments across dynamic panel widths and responsive card viewports.
  - **CSS Anchor Positioning (`position-anchor`, `position-area`)**: Precise tooltip and tab indicator placement that automatically repositions and flips near viewport and panel boundaries.
  - **Fluid Animations (`@starting-style`)**: Smooth entry and exit transitions for floating popovers, menus, and modal dialogs upon DOM insertion.
  - **Strict Security Headers & SSRF Protection**: Comprehensive Content Security Policy (`default-src 'self'`, inline theme hash whitelisting, frame-ancestors 'none') and SSRF validation for external URL ingestion.

---

## Screenshots & Demo Clip

Captions describe what each frame actually shows (not the original capture filename).

1. [Desktop Q&A with citation highlight](docs/media/01-desktop-qa-citation-highlight.png) (`docs/media/01-desktop-qa-citation-highlight.png`) — late-policy answer with citation opening the highlighted `syllabus.pdf` p.2 passage.
2. [Desktop Retrieval plot and ranked passages](docs/media/02-desktop-retrieval.png) (`docs/media/02-desktop-retrieval.png`) — detail panel shows the selected lower-ranked hit: Page 1 / Chunk 0, raw 0.128, final 0.128.
3. [Desktop Retrieval rank #2 selected](docs/media/03-desktop-retrieval-rank2-selected.png) (`docs/media/03-desktop-retrieval-rank2-selected.png`) — Page 1, raw/final 0.128, Low similarity.
4. [Desktop dark mode sample notebook](docs/media/04-desktop-dark-retrieval.png) (`docs/media/04-desktop-dark-retrieval.png`) — Notes tab empty state visible in this frame.
5. [Narrow-viewport Retrieval scorecard](docs/media/05-mobile-retrieval-scorecard-scrolled.png) (`docs/media/05-mobile-retrieval-scorecard-scrolled.png`) — ~390px-wide CSS emulation: **rank #1** selected — Page 2, raw 0.561, final 0.861, matched terms `policy` / `late` / `submission`.

Demo clip: [demo-desktop.mp4](docs/media/demo-desktop.mp4) — warm-backend desktop session (visible flow / privacy banner / legibility).

---

## Architecture & Stack

- **Backend**: FastAPI (Python 3.12) running under Uvicorn, structured logging, PBKDF2-HMAC-SHA256 password hashing, and session token authentication.
- **Frontend**: React 18, TypeScript, Vite, Geist and Inter variable typography, KaTeX for mathematical expressions, and Lucide icons.
- **Vector Database**: PostgreSQL with the `pgvector` extension (hosted on Neon free tier), managed via custom schema migrations in `db/migrate.py`.
- **Embeddings**: `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional dense vectors) executed on the backend via FastEmbed ONNX runtime.
- **LLM Grounding**: Google Gemini (`gemini-3.5-flash-lite` / `gemini-3.5-flash`) via the official Gemini API SDK.
- **Security Boundaries**:
  - **Content Security Policy**: Enforces `default-src 'self'`, inline theme script hash validation (`sha256-PbmCJEYtl8MflCHWhasAsf3s2xYU9NhuEMaTM+8UnI4=`), `frame-ancestors 'none'`, and `object-src 'none'`.
  - **SSRF Defense**: Validates external webpage URLs prior to ingestion, forbidding RFC 1918 private ranges, loopback addresses (`127.0.0.1`), link-local IPs, and metadata endpoints.
  - **XSS Sanitization**: WYSIWYG notes run through strict DOMParser whitelist filtering, rejecting `<script>`, `<iframe>`, `SVG`, event handlers (`onload`, `onerror`), and unsafe URI protocols.
  - **API Key Protection**: The LLM API key lives strictly on the backend environment; it is never exposed in frontend code, any `VITE_` variables, or the browser.

---

## Empirical Evaluation Benchmarks

The primary deliverable of this project is an honest, empirical evaluation of where retrieval and language models succeed and fail. The system measures retrieval hit rate across top passages, citation accuracy, unsupported-answer rates on unanswerable queries, false abstention on answerable questions, conflict detection precision when documents disagree, as well as latency percentiles and token costs.

This repository establishes three evaluation suites:

1. **Answer & Labelling Suite (`evaluation/`)**: The 60-question frozen benchmark and ground-truth labelling tools documented in [evaluation/README.md](evaluation/README.md) and [evaluation/RESULTS.md](evaluation/RESULTS.md).
2. **Synthetic Retrieval Suite (`evals/`)**: A 35-question benchmark across 7 synthetic documents (23 chunks) measuring Hit@1/3/5, MRR, hybrid keyword-boost, and absent-fact abstention.
3. **OpenStax Real-Corpus Benchmark (`evals/`)**: An empirical evaluation on 4 chapters (108 pages / 108 chunks) of an introductory college textbook (*Introduction to Python Programming*, CC BY 4.0), evaluating two independent sets (Set A: seed 42, Set B: seed 43 with corpus-unique ground truth strings and meta-word filtering).

### 1. Answer & Labelling Suite (`evaluation/`)

Specialized tooling for ground-truth labelling and the 60-question frozen evaluation suite:

- **Page Dumper (`tools/dump_pages.py`)**: Extracts text page by page with delimiters to inspect exact text ingested by the parser.
- **Question Validator (`tools/validate_questions.py`)**: Verifies question schemas, checks page bounds against physical documents, and ensures clean test-set formatting.
- **Evaluation Runner (`evaluation/run_answer_eval.py`)**: Executes the evaluation suite and outputs JSON and Markdown reports with failure breakdowns.
- **Sample Document Generator & Seeder (`tools/make_sample_docs.py`, `tools/seed_demo.py`)**: Generates synthetic course documents with intentional cross-document conflicts and seeds the database.

#### Baseline Evaluation Results (Partial Baseline & Full Retrieval Audit)

The 60-question frozen benchmark was evaluated on an isolated database containing 6 synthetic course documents (22 physical pages). Complete per-question records are saved in `evaluation/results/partial_baseline_results.json`, with full accounting, error analyses, and retrieval metrics documented in [evaluation/RESULTS.md](evaluation/RESULTS.md).

##### Full Retrieval Evaluation (All 60 Questions, No LLM Calls)
- **Overall Top-3 Any-Source Recall:** 38 / 45 (84.4%)
- **Overall Top-5 Any-Source Recall:** 42 / 45 (93.3%)
- **Single-Page Top-5 Recall (`single_page`):** 22 / 25 (88.0%)
- **Multi-Page All-Required-Sources Recall (`multi_page`):** 7 / 10 (70.0%)
- **Conflicting All-Required-Sources Recall (`conflicting`):** 9 / 10 (90.0%)

##### Partial Generation Evaluation (14 Questions Completed)
- **Status:** 14 / 60 completed (`s1` through `s14`), 1 / 60 halted on API quota (`s15`), 45 / 60 unattempted.
- **Answered Rate:** 14 / 14 (100.0%)
- **Any Expected Page Cited:** 13 / 14 (92.9%)
- **Per-Citation Support Precision:** 16 / 16 (100.0%)
- **Fact Correctness Match:** 13 / 14 (92.9%)
- **Claim Support (Assistant Manual Review):** 14 / 14 (100.0%)
- **Untested Categories:** `multi_page` (0/10), `conflicting` (0/10), and `not_in_documents` (0/15) are marked not evaluated.
- **Inference Latency (p50 / p95):** 3.64s / 18.33s (measured model HTTP duration; excludes 8.0s per-question pacing delay).

### 2. Synthetic Retrieval Suite (`evals/`)

Evaluated on the synthetic course corpus (7 documents, 23 chunks, 35 questions: 27 answerable spanning factual, paraphrased, multi-page, conflicting, near-duplicate, and keyword distractor queries, plus 8 absent-fact queries). Evaluated with strict scoring (target passage must match expected document and page; top-5 candidates cover about 22% of the 23 corpus chunks). Full methodology and per-category breakdowns live in [evals/README.md](evals/README.md).

| Metric | Hybrid Search (Cosine + Keyword Boost) | Pure Vector Cosine (No Boost) | Description |
| :--- | :---: | :---: | :--- |
| **Hit@1** | **59.3%** (16 / 27) | **59.3%** (16 / 27) | Expected target passage ranked at #1 |
| **Hit@3** | **92.6%** (25 / 27) | **92.6%** (25 / 27) | Target passage in top 3 |
| **Hit@5** | **100.0%** (27 / 27) | **100.0%** (27 / 27) | Target passage in top 5 (~22% corpus coverage) |
| **MRR** | **0.751** | **0.751** | Mean reciprocal rank of first hit ($1/\text{rank}$) |
| **Abstention Accuracy** | **100.0%** (8 / 8) | **100.0%** (8 / 8) | Evaluated with `gemini-3.5-flash-lite` and `gemini-3.5-flash` |

*Note: Hybrid search changes top-5 candidate ordering on 9 of 27 answerable questions without displacing the first correct hit. See [evals/README.md](evals/README.md) for full benchmark documentation.*

### 3. OpenStax Real-Corpus Benchmark (`evals/`)

Evaluated on 4 consecutive chapters of OpenStax *Introduction to Python Programming* (pages 17–124, 108 total chunks / pages; top-5 candidates represent a selective 4.6% corpus coverage). Full methodology, generation audit logs, and spot checks live in [evals/README.md](evals/README.md), [evals/spot_check.md](evals/spot_check.md), and [evals/spot_check_b.md](evals/spot_check_b.md).

#### Performance Metrics Table

| Metric | Set A Hybrid (Seed 42) | Set A Pure Vector | Set B Hybrid (Seed 43) | Set B Pure Vector | Notes |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Total Chunks in Corpus** | 108 | 108 | 108 | 108 | 4 chapters extracted with pypdf |
| **Top-5 Coverage of Corpus** | **4.6%** (5 / 108) | **4.6%** (5 / 108) | **4.6%** (5 / 108) | **4.6%** (5 / 108) | Selective retrieval regime |
| **Hit@1 (Top-1 Hit Rate)** | **36.7%** (11 / 30) | **36.7%** (11 / 30) | **46.7%** (14 / 30) | **46.7%** (14 / 30) | Strict target file and page match |
| **Hit@3 (Top-3 Hit Rate)** | **53.3%** (16 / 30) | **53.3%** (16 / 30) | **63.3%** (19 / 30) | **60.0%** (18 / 30) | +3.3% boost gain on Set B |
| **Hit@5 (Top-5 Hit Rate)** | **56.7%** (17 / 30) | **53.3%** (16 / 30) | **73.3%** (22 / 30) | **73.3%** (22 / 30) | +3.4% boost gain on Set A |
| **Mean Reciprocal Rank (MRR)**| **0.442** | **0.433** | **0.561** | **0.558** | Reciprocal rank of first hit ($1/\text{rank}$) |
| **Absent-Fact Abstention** | **100.0%** (6 / 6) | **100.0%** (6 / 6) | **100.0%** (6 / 6) | **100.0%** (6 / 6) | Zero hallucination on unmentioned topics |

#### Cosine Separation Analysis
- **Synthetic Corpus**: Answerable mean **0.558** vs. Absent mean **0.400** (Separation gap: **0.158**)
- **Real Corpus Set A**: Answerable mean **0.492** vs. Absent mean **0.298** (Separation gap: **0.194**)
- **Real Corpus Set B**: Answerable mean **0.498** vs. Absent mean **0.298** (Separation gap: **0.200**)

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

The application is designed for cloud deployment:

- **Database (Neon)**: Provision a PostgreSQL database with the `pgvector` extension enabled on [Neon](https://neon.tech). Apply migrations using `python db/migrate.py` or by pointing `DATABASE_URL` during startup.
- **Backend (Render)**: Deploy the FastAPI application as a Web Service on [Render](https://render.com) using `render.yaml` or Docker:
  - `DATABASE_URL`: Connection string to your Neon database.
  - `LLM_API_KEY`: Google Gemini API key.
  - `LLM_MODEL`: `gemini-3.5-flash-lite` (or `gemini-3.5-flash`).
  - `ALLOWED_ORIGINS`: Comma-separated list of allowed frontend URLs (e.g., `https://notebookspace.vercel.app`).
- **Frontend (Vercel)**: Deploy the `frontend/` directory to [Vercel](https://vercel.com). Configure `VITE_API_BASE_URL` to point to the Render backend URL. Client-side routes are managed through `frontend/vercel.json`.

---

## Test Suite & Verification

The repository maintains full automated test coverage across both frontend and backend suites:

### Frontend Test Suite (Vitest)

The frontend test suite includes **300 passing tests** across 31 test files, validating components, layout transitions, keyboard interactions, WYSIWYG note sanitization, and security headers:

```bash
cd frontend
npm test
```

To run type checking and production build verification:

```bash
cd frontend
npm run build
```

### Backend Test Suite (Pytest)

The backend test suite covers API routing, authentication, session isolation, document chunking, ONNX embeddings, and retrieval mapping:

```bash
pytest
```

To execute the notebook and workspace integration tests:

```bash
pytest tests/test_notebook.py
```

### End-to-End Verification

To verify complete end-to-end user and guest journeys:

```bash
PYTHONPATH=. python tests/verify_e2e_journey.py
PYTHONPATH=. python tests/verify_guest_journey.py
```
