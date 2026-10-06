-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table to track uploaded files
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    file_name TEXT NOT NULL UNIQUE,
    file_hash TEXT,
    upload_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Chunks table to store text chunks, metadata, and embeddings
CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(384),
    upload_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for filtering by file and page
CREATE INDEX IF NOT EXISTS idx_chunks_file_page ON chunks (file_name, page_number);

-- HNSW index for vector cosine similarity search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);
