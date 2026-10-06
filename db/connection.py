import os
from contextlib import contextmanager
from typing import Generator
import psycopg
from dotenv import load_dotenv
from pgvector.psycopg import register_vector

load_dotenv()


def get_database_url() -> str:
    """Return the database connection URL from environment variables."""
    url = os.getenv("DATABASE_URL")
    if url:
        return url

    user = os.getenv("DB_USER", "postgres")
    password = os.getenv("DB_PASSWORD", "postgres")
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    dbname = os.getenv("DB_NAME", "course_assistant")

    if password:
        return f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
    return f"postgresql://{user}@{host}:{port}/{dbname}"


@contextmanager
def get_connection(db_url: str | None = None) -> Generator[psycopg.Connection, None, None]:
    """Context manager for obtaining a database connection with pgvector registered."""
    url = db_url or get_database_url()
    conn = psycopg.connect(url)
    try:
        # Register pgvector type handlers for this connection
        register_vector(conn)
        yield conn
    finally:
        conn.close()
