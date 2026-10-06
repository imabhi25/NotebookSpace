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
```bash
python -m ingestion.ingest sample.pdf
```
Or via Python:
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

## Running Tests
Run the test suite:
```bash
pytest
```
