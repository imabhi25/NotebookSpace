# NotebookSpace — Subject-Based Study Notebook

A subject-based study notebook inspired by Gemini Notebook / NotebookLM, built on top of the Course-Document Assistant. Create independent course subjects, ingest syllabi, slides, notes, and web materials, select active sources, engage in multi-turn conversations with verified citations, and capture helpful answers as personal study notes.

## Core Capabilities

- **Subject Management**: Each subject functions as an isolated notebook with its own materials, conversations, source selections, and study notes. Create, edit, search, sort, archive, restore, and delete subjects with persistent URLs (`/` for dashboard, `/subject/:id` for workspace).
- **Source Management**: Ingest materials via PDF upload (with scanned PDF detection/warning), TXT and Markdown files, pasted text with custom titles, or public webpage URLs (with SSRF protection against internal/private IPs). Track status: uploading, processing, ready, or failed. Rename, delete, retry, or replace sources without stale index leakage.
- **Source Selection & Boundary Isolation**: Checkbox controls allow selective context targeting (Select all / Clear). Retrieval strictly isolates embeddings by authenticated user and active subject; deselected sources are never searched, and cross-subject queries return honest abstentions.
- **Conversational Chat**: Multi-turn chat with conversation history expansion. Support for follow-up questions, multiline input (Enter sends, Shift+Enter newline), configurable response length (concise, default, detailed) and response style (general, learning-guide), copy answers, and starter questions generated from ready sources.
- **Grounded Answers & Citations**: Responses are grounded strictly in selected documents with mathematical notation (KaTeX) and formatted Markdown. Compact inline citation chips `[document.pdf p.N]` can be clicked to open the side inspector panel displaying exact matching excerpts in document context.
- **Conflicting Document Handling**: When multiple sources state conflicting facts (e.g. updated syllabus vs earlier announcement), both documents are explicitly cited and highlighted.
- **Saved Study Notes**: Save any helpful answer to study notes with full citation lineage, or compose and edit personal study notes within the subject.
- **Persistence & Security**: PostgreSQL schema with migrations for users, sessions, subjects, sources, chunks, conversations, messages, and notes. Password hashing with PBKDF2-HMAC-SHA256, session token authorization, and complete server-side ownership verification.
- **Preserved Public Demo**: The public demo workspace (`/demo`) remains accessible with disabled uploads and rate limiting for portfolio testing.

## What It Measures

The primary deliverable of this project is an honest, empirical evaluation of where retrieval and language models succeed and fail. The system measures retrieval hit rate across top passages, citation accuracy, unsupported-answer rates on unanswerable queries, false abstention on answerable questions, conflict detection precision when documents disagree, as well as latency percentiles and token costs. Full evaluation methodology, datasets, and protocols are documented in [evaluation/README.md](evaluation/README.md).

---

## Architecture & Stack

- **Backend**: FastAPI with PostgreSQL and `pgvector` extension (hosted on Render and Neon free tier).
- **Frontend**: React + TypeScript + Vite (hosted on Netlify).
- **Embeddings**: `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional dense vectors, cached via FastEmbed ONNX runtime).
- **LLM**: Google Gemini (`gemini-3.5-flash` via the free-tier API).
- **Security**: The LLM API key lives strictly on the backend environment; it is never exposed in frontend code, any `VITE_` variables, or the browser.
- **Public Demo Guardrails**: Demo mode (`DEMO_MODE=true`) disables document uploads (returns 403), enforces IP-based rate limiting on `/ask` (default 10 questions/minute), and pre-seeds only openly licensed synthetic course documents.

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
  -e LLM_MODEL="gemini-3.5-flash" \
  course-assistant
```

---

## Deployment

The application is designed entirely for free-tier cloud deployment:

- **Database (Neon)**: Provision a free PostgreSQL database with the `pgvector` extension enabled on [Neon](https://neon.tech). Apply migrations using `python db/migrate.py` or by pointing `DATABASE_URL` during startup.
- **Backend (Render)**: Deploy the FastAPI application as a free Web Service on [Render](https://render.com) using `render.yaml` or the Dockerfile. Configure environment variables in the Render dashboard:
  - `DATABASE_URL`: Connection string to your Neon database.
  - `LLM_API_KEY`: Google Gemini API key.
  - `LLM_MODEL`: `gemini-3.5-flash`.
  - `ALLOWED_ORIGINS`: Comma-separated list of allowed frontend URLs (e.g. `https://your-app.netlify.app`).
  - `DEMO_MODE`: `true` (enables upload prohibition and rate limiting).
  - `DEMO_ASK_PER_MINUTE`: `10`.
- **Frontend (Netlify)**: Deploy the `frontend/` directory to [Netlify](https://www.netlify.com). Build settings are preconfigured via `netlify.toml`:
  - Base directory: `frontend`
  - Build command: `npm run build`
  - Publish directory: `frontend/dist`
  - Environment variable: `VITE_API_BASE_URL` pointing to the deployed Render backend URL.
  - SPA redirects are handled via `netlify.toml` and `frontend/public/_redirects`.

---

## Public Demo Mode

For a public portfolio demonstration:
1. Seed the synthetic course documents using `python tools/seed_demo.py`. These documents include deliberate, verifiable conflicts between the syllabus and update announcements (due dates, late submission penalty, and exam dates).
2. Set `DEMO_MODE=true` on the Render backend service. This:
   - Forbids `/upload` endpoint calls with HTTP 403 Forbidden.
   - Enforces per-IP rate limiting on `/ask` calls (preventing quota exhaustion).
   - Serves only synthetic documents.
3. Configure `VITE_DEMO_MODE=true` on Netlify to inform users that upload is disabled and show demo badges.

---

## Evaluation & Labelling Tools

The repository includes specialized tooling for ground-truth labelling and evaluation:

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

---

## Running Tests

Run backend unit and integration tests (84 tests):
```bash
pytest
```

Run frontend unit and component tests (33 tests):
```bash
cd frontend
npm test
```

Run complete 12-step end-to-end user journey verification:
```bash
PYTHONPATH=. python tests/verify_e2e_journey.py
```
