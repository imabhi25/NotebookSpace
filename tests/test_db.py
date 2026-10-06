import pytest
from db.connection import get_connection, get_database_url
from db.migrate import run_migrations


def test_migrations_and_tables():
    """Verify that migrations can run and verify table structure."""
    applied = run_migrations()
    assert isinstance(applied, list)

    with get_connection() as conn:
        with conn.cursor() as cur:
            # Check documents table
            cur.execute("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'documents';
            """)
            doc_cols = {row[0]: row[1] for row in cur.fetchall()}
            assert "file_name" in doc_cols
            assert "upload_date" in doc_cols

            # Check chunks table
            cur.execute("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'chunks';
            """)
            chunk_cols = {row[0]: row[1] for row in cur.fetchall()}
            assert "file_name" in chunk_cols
            assert "page_number" in chunk_cols
            assert "chunk_text" in chunk_cols
            assert "embedding" in chunk_cols
            assert "upload_date" in chunk_cols
