# Course-Document Assistant Specification

## 1. System Overview
The Course-Document Assistant is an intelligent retrieval and question-answering system designed to assist students and instructors with course materials (course outlines, syllabi, lecture slides, assignments, and reference documents).

## 2. Multi-Week Roadmap

### Week 1: Ingestion, Vector Storage & Retrieval Quality Benchmark
- **Goal**: End-to-end pipeline to ingest PDFs, parse text page-by-page, chunk with page boundary constraints, embed with a local open-source model, store in PostgreSQL using pgvector with idempotent uploads, perform plain top-k vector similarity retrieval, and measure retrieval quality with an evaluation benchmark.
- **Answer Generation**: None in Week 1. Focus strictly on retrieval accuracy and pipeline correctness.

### Later Weeks (Future Scope)
- **Week 2+**: Grounded answer generation with LLMs, explicit inline page citations, conflict resolution, guardrails for out-of-domain / not-in-document queries, and UI / chat interface.

---

## 3. Week 1 Architectural Specification

### 3.1 Technology Stack
- **Language**: Python 3.12
- **API Framework**: FastAPI
- **Database**: PostgreSQL 16 with the `pgvector` extension
- **Database Driver**: `psycopg` (v3) / `psycopg2`
- **Embeddings**: Local open-source model via `sentence-transformers` (`all-MiniLM-L6-v2`, 384 dimensions). Zero paid API calls.
- **Testing**: `pytest`
- **CI/CD**: GitHub Actions with PostgreSQL 16 + pgvector service container.

### 3.2 Ingestion & Parsing
- **PDF Extraction**: Extract text per page using `pypdf`.
- **Page Metadata**: Every extracted record retains `(file_name, page_number, text)`. Pages are 1-indexed.
- **Empty Pages**: Handled gracefully without errors.

### 3.3 Chunking Strategy
- **Page Boundaries**: A chunk must **never** span two pages. Each chunk belongs strictly to a single page.
- **Chunk Size**: Approximately 200–400 words per chunk.
- **Overlap**: Small word overlap (e.g., 30–50 words) between consecutive chunks on the same page.
- **Metadata Retention**: Every chunk preserves `file_name` and `page_number`.

### 3.4 Storage & Idempotency
- **Database Schema**: Managed via sequential migrations (`db/migrations/001_...sql`, etc.) executed by `db/migrate.py`.
- **Tables**:
  - `documents`: Tracks uploaded documents (`id`, `file_name`, `file_hash`, `upload_date`).
  - `chunks`: Stores chunk content and embeddings (`id`, `document_id`, `file_name`, `page_number`, `chunk_index`, `chunk_text`, `embedding vector(384)`, `created_at`).
- **Idempotency**: Re-uploading the same file replaces previous chunks transactionally or updates without duplication.

### 3.5 Retrieval Engine
- **Method**: Plain top-k vector similarity search using vector cosine distance (`<=>`).
- **Constraints**: No keyword search, hybrid search, or reranking in Week 1.
- **Search Output**: Top-k matching chunks with `file_name`, `page_number`, `chunk_text`, and `similarity_score` (`1 - cosine_distance`).
- **API**: `POST /search` accepting `question` and `k`.

---

## 4. Evaluation Design

### 4.1 Question Dataset (`evaluation/questions.json`)
The evaluation dataset consists of categorized test questions formatted as follows:
- `id`: Unique identifier (string or integer).
- `question`: Natural language question string.
- `type`: One of:
  - `single_page`: The answer is found entirely on a single page of a single document.
  - `multi_page`: The answer requires information from two or more pages or documents.
  - `not_in_documents`: The answer is not present in the ingested documents.
  - `conflicting`: The ingested documents contain contradictory information regarding the question.
- `expected_sources`: List of expected source targets `{"file": "<file_name>", "page": <page_number>}`. For `not_in_documents`, this list must be empty (`[]`).

### 4.2 Metrics & Evaluation Protocol
The retrieval evaluation script (`evaluation/run_retrieval_eval.py`):
1. Filters for answerable questions (`type != 'not_in_documents'`).
2. Queries the retrieval engine with `k=5`.
3. Measures:
   - **Top-3 Retrieval Recall (Recall@3 / Hit@3)**: Fraction of answerable questions for which at least one expected page appears within the top 3 retrieved chunks.
   - **Top-5 Retrieval Recall (Recall@5 / Hit@5)**: Fraction of answerable questions for which at least one expected page appears within the top 5 retrieved chunks.
4. Identifies misses and logs detailed diagnostic output including question text, expected sources, and retrieved pages.

### 4.3 Labeling Rules
- Expected sources must always match the exact filename and 1-indexed page number of the source PDF.
- A question labeled `not_in_documents` must have `expected_sources: []`.
- Multi-page and conflicting questions must list all relevant pages that contain the pertinent evidence.
