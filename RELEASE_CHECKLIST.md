# Release Readiness Checklist

## 1. Deployment Configuration Review

- **Target Architecture**:
  - Database: Neon Serverless PostgreSQL (with `pgvector` extension)
  - Backend: Render Web Service (FastAPI running on Python 3.12)
  - Frontend: Netlify Static Site (React 18 + TypeScript + Vite)

- **Render Backend Configuration (`render.yaml`)**:
  - Build command installs dependencies and pre-caches the FastEmbed ONNX embedding model:
    `pip install -r requirements.txt && FASTEMBED_CACHE_PATH=.cache/fastembed python -c "from ingestion.embedder import get_embedding_model; get_embedding_model()"`
  - Start command runs Uvicorn on dynamic port:
    `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
  - Declared environment variables: `FASTEMBED_CACHE_PATH`, `DATABASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `ALLOWED_ORIGINS`, `DEMO_MODE`, `DEMO_ASK_PER_MINUTE`.

- **Netlify Frontend Configuration (`netlify.toml` and `frontend/public/_redirects`)**:
  - `netlify.toml` specifies build parameters (`base = "frontend"`, `publish = "dist"`, `command = "npm run build"`), build environment (`NODE_VERSION = "20"`), and SPA rewrites (`/* -> /index.html 200`).
  - `frontend/public/_redirects` contains `/* /index.html 200` and is copied by Vite into `dist/_redirects` during build.
  - `.netlify/` local CLI and cache directory is explicitly ignored in `.gitignore`.

---

## 2. Public-Demo Guardrails Verification

- **Backend Enforcement (`DEMO_MODE=true`)**:
  - `POST /upload`: Returns HTTP 403 Forbidden with message "Upload is disabled in demo mode."
  - `POST /ask`: Enforces per-IP rate limiting (default 10 requests per 60-second window, configured by `DEMO_ASK_PER_MINUTE`).
  - IP extraction reads the last comma-separated value of `X-Forwarded-For` (the trusted hop added by the reverse proxy) or `request.client.host`, preventing forged header spoofing.
- **Frontend Presentation (`VITE_DEMO_MODE=true`)**:
  - Upload PDF controls in the sidebar are disabled and labelled "Upload disabled in the public demo".
  - Informational note displayed: "Public demo: sample documents, questions are rate-limited".
  - Header displays a "Public demo" indicator badge.
- **CORS and Origin Configuration**:
  - Backend restricts CORS to `allowed_origins` (defaults to local development, extended via `ALLOWED_ORIGINS` environment variable). In production, this must match the public Netlify frontend URL (e.g. `https://<site-name>.netlify.app`).
  - Frontend routes all API requests through `VITE_API_BASE_URL`, which must point to the public Render backend URL (e.g. `https://<service-name>.onrender.com`).
- **Secret Isolation**:
  - `LLM_API_KEY` is loaded and accessed exclusively on the backend in `answering/llm.py`. Zero API keys or sensitive variables are referenced in frontend source code or prefixed with `VITE_`.

---

## 3. Reproducibility and Corpus Distinction

- **Corpus Separation**:
  - **Synthetic Benchmark Corpus (`docs/sample_docs/`)**: 6 generated PDFs (22 pages total: `syllabus.pdf`, `assignment_1.pdf`, `announcement_update.pdf`, `assignment_2.pdf`, `exam_guide.pdf`, `lecture_schedule.pdf`). All pages include the prominent visual header: `"SYNTHETIC SAMPLE DOCUMENT - not a real course"`. All 60 frozen benchmark questions in `evaluation/questions.json` target strictly these 6 files.
  - **Private Course Materials (`data/`, `unused_docs/`)**: 16 local files from historical courses. Kept strictly local, ignored via `.gitignore` (`data/`, `*.pdf`), and not referenced by the evaluation dataset.
- **Generator Verification**:
  - Script: `tools/make_sample_docs.py`
  - Re-generation verification in an isolated temporary directory confirmed:
    - All 6 filenames match the benchmark corpus.
    - All 22 pages match extracted text 100% byte-for-byte.
    - Note on binary hashes: ReportLab inserts dynamic `/CreationDate` timestamps and random trailer `/ID` hashes on every compilation, causing raw file hashes to differ across builds despite identical text and page structures.
- **Core Pipeline Commands**:
  - Database migration: `python db/migrate.py`
  - Corpus ingestion: `python tools/seed_demo.py`
  - Backend execution: `uvicorn api.main:app --host 0.0.0.0 --port 8000`
  - Frontend execution: `npm --prefix frontend run dev`
  - Evaluation run: `.venv/bin/python evaluation/run_answer_eval.py --questions evaluation/questions.json --label baseline --markdown`

---

## 4. Public-Release Privacy and Secrets Audit

- **Check Results**: No findings from the checks performed.
- **Scope of Checks**:
  - Tracked file inspection: Verified zero PDF files and zero `data/` files are tracked in Git.
  - Pattern search in commit history: Grep search across all Git commits (`git rev-list --all`) for specific private course codes and instructor/author names.
  - Credential pattern scan: Regex search across commit history for API key patterns (`AIzaSy...`, `Bearer ...`) and non-local PostgreSQL connection strings.
  - University email metadata inspection: Git log author and committer analysis for institutional email domains.
- **Limitations of Checks**:
  - The checks performed are pattern-based and heuristic; they do not constitute mathematical proof of complete privacy or absence of all possible sensitive strings.
  - Obfuscated, encrypted, or non-indexed binary data were not scanned.
  - Local untracked files outside Git tracking were not evaluated beyond filename matching.
- **University Email Metadata Identified**:
  - Git commit author/committer history contains 17 early commits referencing `<OLD_UNIVERSITY_EMAIL>`.
  - Zero instances of `<OLD_UNIVERSITY_EMAIL>` were found inside committed source file content.
- **History Cleanup Plan (To be executed prior to public release)**:
  1. Use `git-filter-repo` to rewrite commit author and committer metadata across every branch and tag intended for publication:
     `git-filter-repo --mailmap <mailmap-file>`
     Mapping `<OLD_UNIVERSITY_EMAIL>` to the public GitHub identity (`imabhi25 <imabhi25@users.noreply.github.com>`).
  2. Keep any eventual mailmap file containing the real address strictly outside tracked files (e.g. in `.git/` or a temporary uncommitted path).
  3. Verify clean history across all branches and tags intended for publication using:
     `git log --branches --tags --format="%an <%ae> | %cn <%ce>" | sort -u`
  4. Run an automated secret scan (`gitleaks detect` or `trufflehog`) across all refs prior to publication.
  5. Perform this rewrite only after baseline evaluation completes, preserving active branch hashes during evaluation.

---

## 5. Concrete Release Blockers

1. **Baseline Evaluation Incomplete**: 14 of 60 questions evaluated. The run is paused awaiting the upstream Gemini free-tier quota reset at `2026-10-11T00:00:00Z`. The final evaluation report cannot be completed until all 60 questions have final recorded outcomes.
2. **University Email Metadata in Git History**: 17 commits contain `<OLD_UNIVERSITY_EMAIL>` in author/committer metadata and require rewrite across all public branches/tags via `git-filter-repo`.
3. **Cloud Infrastructure Provisioning**: Neon PostgreSQL database, Render backend web service, and Netlify static site project must be created and linked.
4. **CORS and Base URL Binding**: `ALLOWED_ORIGINS` on Render and `VITE_API_BASE_URL` on Netlify must be populated with production deployment domain names.

---

## 6. Required Environment Variables (Names Only)

### Backend (Render Web Service)
- `DATABASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `ALLOWED_ORIGINS`
- `DEMO_MODE`
- `DEMO_ASK_PER_MINUTE`
- `FASTEMBED_CACHE_PATH`

### Frontend (Netlify Site)
- `VITE_API_BASE_URL`
- `VITE_DEMO_MODE`

---

## 7. Dashboard Settings and Deployment Steps

### 1. Database (Neon)
- **Dashboard Action**: Create a free PostgreSQL 15+ database project on Neon.
- **Extensions**: Enable `vector` extension:
  `CREATE EXTENSION IF NOT EXISTS vector;`
- **Migrations & Seeding**: From local shell:
  ```bash
  DATABASE_URL=<neon-url> python db/migrate.py
  DATABASE_URL=<neon-url> python tools/seed_demo.py
  ```

### 2. Backend (Render)
- **Service Type**: Web Service
- **Runtime**: Python 3
- **Build Command**:
  `pip install -r requirements.txt && FASTEMBED_CACHE_PATH=.cache/fastembed python -c "from ingestion.embedder import get_embedding_model; get_embedding_model()"`
- **Start Command**:
  `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
  - `DATABASE_URL`: Connection string from Neon.
  - `LLM_API_KEY`: Google Gemini API key.
  - `LLM_MODEL`: `gemini-3.5-flash` (or configured client model).
  - `ALLOWED_ORIGINS`: Production Netlify site URL (e.g. `https://<site-name>.netlify.app`).
  - `DEMO_MODE`: `true`
  - `DEMO_ASK_PER_MINUTE`: `10`
  - `FASTEMBED_CACHE_PATH`: `.cache/fastembed`

### 3. Frontend (Netlify)
- **Base Directory**: `frontend`
- **Build Command**: `npm run build`
- **Publish Directory**: `dist` (relative to base directory `frontend`, resolves to `frontend/dist`)
- **Environment Variables**:
  - `NODE_VERSION`: `20`
  - `VITE_API_BASE_URL`: URL of the deployed Render backend service (e.g. `https://<service-name>.onrender.com`).
  - `VITE_DEMO_MODE`: `true`
- **Redirects**: Handled by `netlify.toml` and `frontend/public/_redirects` (`/* -> /index.html 200`).

### 4. End-to-End Verification
- **Health Check**: `GET https://<service-name>.onrender.com/health` returns `{"status": "ok"}`.
- **Demo Upload Guardrail**: `POST https://<service-name>.onrender.com/upload` returns HTTP 403 Forbidden.
- **Demo Rate Limiting**: Exceeding 10 questions/minute from an IP returns HTTP 429 Too Many Requests.
- **Frontend Verification**:
  - Document sidebar lists 6 synthetic documents with chunk counts.
  - Upload PDF button is disabled with "Upload disabled in the public demo".
  - Asking questions queries the backend and displays interactive citations.
  - Conflict questions trigger conflict banner and claims comparison.
