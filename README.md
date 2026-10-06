# Course-Document Assistant

A retrieval-augmented pipeline for querying course documents (syllabi, lecture notes, assignments, and course outlines).

## Week 1 Overview
- Page-by-page PDF parsing with metadata preservation (`file_name`, `page_number`).
- In-page text chunking strictly constrained to page boundaries (chunks never span pages).
- Local embedding generation via `sentence-transformers` (`all-MiniLM-L6-v2`, 384 dimensions).
- PostgreSQL 16 vector storage using `pgvector` with idempotent document ingestion.
- Plain top-k vector similarity retrieval.
- FastAPI endpoint `POST /search`.
- Retrieval quality evaluation suite reporting Top-3 and Top-5 page hit rates.

---

## Prerequisites
- Python 3.12+
- PostgreSQL 16 with the `pgvector` extension enabled

---

## Setup & Installation

1. Clone repository and create a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your PostgreSQL credentials
   ```

3. Run database migrations:
   ```bash
   python db/migrate.py
   ```

---

## Usage

### 1. Ingest Course Documents (PDFs)
To ingest sample course PDFs into the vector store:

Using the CLI:
```bash
python -m ingestion.ingest sample.pdf
```

Via the API endpoint:
```bash
curl -X POST http://localhost:8000/upload \
  -F "file=@sample.pdf"
```

Or programmatically in Python:
```python
from ingestion.pipeline import ingest_pdf
ingest_pdf("sample.pdf")
```

### 2. Run the FastAPI Server
Start the API service:
```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Query the Retrieval Endpoint (`POST /search`)
Perform a vector similarity search:
```bash
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"question": "When is the midterm exam?", "k": 5}'
```

Response format:
```json
{
  "query": "When is the midterm exam?",
  "results": [
    {
      "file_name": "syllabus.pdf",
      "page_number": 3,
      "text": "The midterm exam is scheduled for November 12th...",
      "similarity_score": 0.8421
    }
  ]
}
```

---

## Evaluation Benchmark
To run the retrieval evaluation against `evaluation/questions.json`:
```bash
python evaluation/run_retrieval_eval.py
```
This evaluates the retrieval quality over answerable questions and outputs:
- Top-3 Retrieval Recall (Recall@3)
- Top-5 Retrieval Recall (Recall@5)
- Breakdown of misses with expected vs. retrieved pages

---

## Answering

### Environment Variables
Configure the LLM provider and answering thresholds in `.env`:
- `LLM_PROVIDER`: Provider name (e.g. `gemini` for Google Gemini free tier, or `fake` for testing).
- `LLM_MODEL`: Model identifier (e.g. `gemini-2.5-flash`).
- `LLM_API_KEY`: API key for the selected provider.
- `SUPPORT_MIN_SCORE`: Minimum retrieval similarity score threshold for the pre-check (default: `0.25`).
- `PRICE_PER_1M_INPUT`: Input token pricing per 1M tokens for cost estimation (default: `0.0`).
- `PRICE_PER_1M_OUTPUT`: Output token pricing per 1M tokens for cost estimation (default: `0.0`).

### Query the Answering Endpoint (`POST /ask`)
Generate an answer with validated citations and support checks:
```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "When is the midterm exam?", "k": 5}'
```

Response format:
```json
{
  "answer": "The midterm exam is scheduled for November 12th [syllabus.pdf p.3].",
  "citations": [
    {
      "file": "syllabus.pdf",
      "page": 3
    }
  ],
  "abstained": false,
  "abstain_reason": null,
  "retrieved": [...],
  "tokens": {
    "input": 320,
    "output": 45,
    "total": 365
  },
  "latency": 0.8521
}
```

### Run Answer Evaluation
Run the answer evaluation benchmark across question types:
```bash
python evaluation/run_answer_eval.py
```
This evaluates questions in `evaluation/questions.json`, logs metrics per question type (`single_page`, `multi_page`, `not_in_documents`, `conflicting`), measures latency (p50/p95) and token costs, writes results to `evaluation/results/answers_<timestamp>.json`, and prints diagnostic failure details.

---

## Web Interface

The web interface is a React application built with TypeScript and Vite. It provides an interface for asking questions, viewing answers with clickable citation chips, side-by-side conflict comparisons, a live document passage viewer, and PDF document uploads.

### Running Backend and Frontend Together

1. **Start the Backend API Service:**
   Ensure your virtual environment is active and database migrations are applied, then start the server:
   ```bash
   uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   The backend runs on port 8000 (`http://localhost:8000`). By default, CORS allows requests from `http://localhost:5173` and any origins specified in the `ALLOWED_ORIGINS` environment variable.

2. **Start the Frontend Development Server:**
   From the repository root:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The frontend runs on port 5173 (`http://localhost:5173`).

### Frontend Environment Variables
- `VITE_API_BASE_URL`: Base URL for the FastAPI backend (defaults to `http://localhost:8000`). Documented in `.env.example`.

---

## Running Tests

### Backend Tests
Run the pytest test suite:
```bash
pytest
```

### Frontend Tests
Run Vitest tests in the frontend directory:
```bash
cd frontend
npm test
```

