# NotebookSpace

_An independent student project, not affiliated with Google or NotebookLM._

A retrieval-augmented assistant for querying course documents (syllabi, lecture notes, assignments, and announcements) with verified page-level citations, explicit abstention for unsupported questions, and automated conflict detection between documents.

## What It Measures

The primary deliverable of this project is an honest, empirical evaluation of where retrieval and language models succeed and fail. The system measures retrieval hit rate across top passages, citation accuracy, unsupported-answer rates on unanswerable queries, false abstention on answerable questions, conflict detection precision when documents disagree, as well as latency percentiles and token costs. Full evaluation methodology, datasets, and protocols are documented in [evaluation/README.md](evaluation/README.md).

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
  -e LLM_MODEL="gemini-2.5-flash" \
  course-assistant
```

---

## Deployment

The application is structured for deployment across modern cloud platforms:

- **Database (Neon)**: Provision a PostgreSQL database with the `pgvector` extension enabled on Neon. Apply migrations using `python db/migrate.py`.
- **Backend (Render)**: Deploy the FastAPI application as a web service using `render.yaml` or Docker. Configure environment variables in the Render dashboard (`DATABASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `ALLOWED_ORIGINS`, `DEMO_MODE`).
- **Frontend (Vercel)**: Deploy the `frontend/` directory as a Single Page Application on Vercel. Set the build command to `npm run build`, output directory to `dist`, and define `VITE_API_BASE_URL` pointing to the deployed Render backend URL.

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
  python tools/validate_questions.py evaluation/questions.json
  ```

- **Evaluation Runner (`evaluation/run_answer_eval.py`)**:
  Executes the evaluation suite and outputs JSON and Markdown reports with failure breakdowns:
  ```bash
  python evaluation/run_answer_eval.py --questions evaluation/questions.json --label baseline --markdown
  ```

- **Sample Document Generator & Seeder (`tools/make_sample_docs.py`, `tools/seed_demo.py`)**:
  Generates synthetic course documents with intentional cross-document conflicts and seeds the database.

---

## Running Tests

Run backend tests:
```bash
pytest
```

Run frontend tests:
```bash
cd frontend
npm test
```
