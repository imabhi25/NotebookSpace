import json
import logging
import re
from typing import Any, Sequence
from uuid import UUID
from db.connection import get_connection
from ingestion.chunker import Chunk

logger = logging.getLogger("course_assistant.db.notebook_store")


def _escape_like(term: str) -> str:
    """Escape LIKE wildcards so a term such as "max_len" or "50%" matches literally."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ============================================================================
# USER & SESSION OPERATIONS
# ============================================================================

def create_user(email: str, password_hash: str, db_url: str | None = None) -> dict[str, Any]:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (email, password_hash)
                    VALUES (%s, %s)
                    RETURNING id, email, created_at;
                    """,
                    (email.lower().strip(), password_hash),
                )
                row = cur.fetchone()
                return {"id": str(row[0]), "email": row[1], "created_at": row[2].isoformat()}


def get_user_by_email(email: str, db_url: str | None = None) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, password_hash, created_at FROM users WHERE email = %s;",
                (email.lower().strip(),),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": str(row[0]),
                "email": row[1],
                "password_hash": row[2],
                "created_at": row[3].isoformat(),
            }


def get_user_by_id(user_id: str | UUID, db_url: str | None = None) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, created_at FROM users WHERE id = %s;",
                (str(user_id),),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": str(row[0]),
                "email": row[1],
                "created_at": row[2].isoformat(),
            }


def create_session(user_id: str | UUID, token: str, expires_at: Any, db_url: str | None = None) -> None:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO sessions (token, user_id, expires_at)
                    VALUES (%s, %s, %s);
                    """,
                    (token, str(user_id), expires_at),
                )


def get_session(token: str, db_url: str | None = None) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.token, s.user_id, s.expires_at, u.email
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = %s AND s.expires_at > CURRENT_TIMESTAMP;
                """,
                (token,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "token": row[0],
                "user_id": str(row[1]),
                "expires_at": row[2].isoformat(),
                "email": row[3],
            }


def delete_session(token: str, db_url: str | None = None) -> None:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("DELETE FROM sessions WHERE token = %s;", (token,))


# ============================================================================
# SUBJECT (NOTEBOOK) OPERATIONS
# ============================================================================

def create_subject(
    user_id: str | UUID,
    name: str,
    course_code: str | None = None,
    description: str | None = None,
    settings: dict[str, Any] | None = None,
    db_url: str | None = None,
) -> dict[str, Any]:
    default_settings = {"response_length": "default", "response_style": "general"}
    merged_settings = {**default_settings, **(settings or {})}
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO subjects (user_id, name, course_code, description, settings)
                    VALUES (%s, %s, %s, %s, %s::jsonb)
                    RETURNING id, name, course_code, description, is_archived, settings, created_at, updated_at;
                    """,
                    (
                        str(user_id),
                        name.strip(),
                        course_code.strip() if course_code else None,
                        description.strip() if description else None,
                        json.dumps(merged_settings),
                    ),
                )
                row = cur.fetchone()
                return {
                    "id": str(row[0]),
                    "name": row[1],
                    "course_code": row[2],
                    "description": row[3],
                    "is_archived": row[4],
                    "settings": row[5] if isinstance(row[5], dict) else json.loads(row[5]),
                    "created_at": row[6].isoformat(),
                    "updated_at": row[7].isoformat(),
                    "source_count": 0,
                }


def get_subjects_for_user(
    user_id: str | UUID,
    include_archived: bool = False,
    search: str | None = None,
    sort_by: str = "updated_at",
    db_url: str | None = None,
) -> list[dict[str, Any]]:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            query = """
                SELECT 
                    s.id,
                    s.name,
                    s.course_code,
                    s.description,
                    s.is_archived,
                    s.settings,
                    s.created_at,
                    s.updated_at,
                    COUNT(src.id)::int AS source_count
                FROM subjects s
                LEFT JOIN sources src ON s.id = src.subject_id AND src.status != 'failed'
                WHERE s.user_id = %s
            """
            params: list[Any] = [str(user_id)]

            if not include_archived:
                query += " AND s.is_archived = FALSE"

            if search and search.strip():
                query += " AND (s.name ILIKE %s OR s.course_code ILIKE %s OR s.description ILIKE %s)"
                s_pattern = f"%{_escape_like(search.strip())}%"
                params.extend([s_pattern, s_pattern, s_pattern])

            query += " GROUP BY s.id, s.name, s.course_code, s.description, s.is_archived, s.settings, s.created_at, s.updated_at"

            if sort_by == "name":
                query += " ORDER BY s.name ASC"
            elif sort_by == "created_at":
                query += " ORDER BY s.created_at DESC"
            else:
                query += " ORDER BY s.updated_at DESC"

            cur.execute(query, tuple(params))
            rows = cur.fetchall()

            return [
                {
                    "id": str(r[0]),
                    "name": r[1],
                    "course_code": r[2],
                    "description": r[3],
                    "is_archived": r[4],
                    "settings": r[5] if isinstance(r[5], dict) else json.loads(r[5]),
                    "created_at": r[6].isoformat(),
                    "updated_at": r[7].isoformat(),
                    "source_count": r[8],
                }
                for r in rows
            ]


def get_subject_by_id(
    user_id: str | UUID,
    subject_id: str | UUID,
    db_url: str | None = None,
) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    s.id,
                    s.name,
                    s.course_code,
                    s.description,
                    s.is_archived,
                    s.settings,
                    s.created_at,
                    s.updated_at,
                    COUNT(src.id)::int AS source_count
                FROM subjects s
                LEFT JOIN sources src ON s.id = src.subject_id AND src.status != 'failed'
                WHERE s.id = %s AND s.user_id = %s
                GROUP BY s.id, s.name, s.course_code, s.description, s.is_archived, s.settings, s.created_at, s.updated_at;
                """,
                (str(subject_id), str(user_id)),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": str(row[0]),
                "name": row[1],
                "course_code": row[2],
                "description": row[3],
                "is_archived": row[4],
                "settings": row[5] if isinstance(row[5], dict) else json.loads(row[5]),
                "created_at": row[6].isoformat(),
                "updated_at": row[7].isoformat(),
                "source_count": row[8],
            }


def update_subject(
    user_id: str | UUID,
    subject_id: str | UUID,
    name: str | None = None,
    course_code: str | None = None,
    description: str | None = None,
    is_archived: bool | None = None,
    settings: dict[str, Any] | None = None,
    db_url: str | None = None,
) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                # Fetch current subject
                cur.execute(
                    "SELECT name, course_code, description, is_archived, settings FROM subjects WHERE id = %s AND user_id = %s;",
                    (str(subject_id), str(user_id)),
                )
                curr = cur.fetchone()
                if not curr:
                    return None

                new_name = name.strip() if name is not None else curr[0]
                new_course_code = course_code.strip() if course_code is not None else curr[1]
                new_description = description.strip() if description is not None else curr[2]
                new_archived = is_archived if is_archived is not None else curr[3]
                curr_settings = curr[4] if isinstance(curr[4], dict) else json.loads(curr[4])
                new_settings = {**curr_settings, **(settings or {})}

                cur.execute(
                    """
                    UPDATE subjects
                    SET name = %s,
                        course_code = %s,
                        description = %s,
                        is_archived = %s,
                        settings = %s::jsonb,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND user_id = %s;
                    """,
                    (
                        new_name,
                        new_course_code,
                        new_description,
                        new_archived,
                        json.dumps(new_settings),
                        str(subject_id),
                        str(user_id),
                    ),
                )
                cur.execute(
                    """
                    SELECT 
                        s.id,
                        s.name,
                        s.course_code,
                        s.description,
                        s.is_archived,
                        s.settings,
                        s.created_at,
                        s.updated_at,
                        COUNT(src.id)::int AS source_count
                    FROM subjects s
                    LEFT JOIN sources src ON s.id = src.subject_id AND src.status != 'failed'
                    WHERE s.id = %s AND s.user_id = %s
                    GROUP BY s.id, s.name, s.course_code, s.description, s.is_archived, s.settings, s.created_at, s.updated_at;
                    """,
                    (str(subject_id), str(user_id)),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return {
                    "id": str(row[0]),
                    "name": row[1],
                    "course_code": row[2],
                    "description": row[3],
                    "is_archived": row[4],
                    "settings": row[5] if isinstance(row[5], dict) else json.loads(row[5]),
                    "created_at": row[6].isoformat(),
                    "updated_at": row[7].isoformat(),
                    "source_count": int(row[8]),
                }


def delete_subject(
    user_id: str | UUID,
    subject_id: str | UUID,
    db_url: str | None = None,
) -> bool:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM subjects WHERE id = %s AND user_id = %s;",
                    (str(subject_id), str(user_id)),
                )
                return cur.rowcount > 0


# ============================================================================
# SOURCE MANAGEMENT OPERATIONS
# ============================================================================

def create_source(
    user_id: str | UUID,
    subject_id: str | UUID,
    title: str,
    file_name: str,
    source_type: str,
    source_url: str | None = None,
    file_hash: str | None = None,
    raw_content: str | None = None,
    status: str = "uploading",
    page_count: int = 1,
    word_count: int = 0,
    error_message: str | None = None,
    db_url: str | None = None,
) -> dict[str, Any]:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO sources (
                        subject_id, user_id, title, file_name, source_type, source_url,
                        file_hash, raw_content, status, error_message, page_count, word_count, version
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
                    RETURNING id, subject_id, user_id, title, file_name, source_type, source_url,
                              file_hash, status, error_message, page_count, word_count, version, created_at, updated_at;
                    """,
                    (
                        str(subject_id),
                        str(user_id),
                        title.strip(),
                        file_name.strip(),
                        source_type,
                        source_url,
                        file_hash,
                        raw_content,
                        status,
                        error_message,
                        page_count,
                        word_count,
                    ),
                )
                row = cur.fetchone()
                # Update subject's updated_at
                cur.execute(
                    "UPDATE subjects SET updated_at = CURRENT_TIMESTAMP WHERE id = %s;",
                    (str(subject_id),),
                )
                return {
                    "id": str(row[0]),
                    "subject_id": str(row[1]),
                    "user_id": str(row[2]),
                    "title": row[3],
                    "file_name": row[4],
                    "source_type": row[5],
                    "source_url": row[6],
                    "file_hash": row[7],
                    "status": row[8],
                    "error_message": row[9],
                    "page_count": row[10],
                    "word_count": row[11],
                    "version": row[12],
                    "created_at": row[13].isoformat(),
                    "updated_at": row[14].isoformat(),
                }


def check_duplicate_source(
    user_id: str | UUID,
    subject_id: str | UUID,
    file_name: str,
    file_hash: str | None = None,
    exclude_source_id: str | UUID | None = None,
    db_url: str | None = None,
) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            query = """
                SELECT id, title, file_name, status FROM sources
                WHERE subject_id = %s AND user_id = %s
                  AND (LOWER(file_name) = LOWER(%s) OR (file_hash IS NOT NULL AND file_hash = %s))
            """
            params: list[Any] = [str(subject_id), str(user_id), file_name.strip(), file_hash]
            if exclude_source_id:
                query += " AND id != %s"
                params.append(str(exclude_source_id))

            cur.execute(query, tuple(params))
            row = cur.fetchone()
            if not row:
                return None
            return {"id": str(row[0]), "title": row[1], "file_name": row[2], "status": row[3]}


def get_sources_for_subject(
    user_id: str | UUID,
    subject_id: str | UUID,
    search: str | None = None,
    db_url: str | None = None,
) -> list[dict[str, Any]]:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            query = """
                SELECT 
                    id, subject_id, user_id, title, file_name, source_type, source_url,
                    file_hash, status, error_message, page_count, word_count, version, created_at, updated_at
                FROM sources
                WHERE subject_id = %s AND user_id = %s
            """
            params: list[Any] = [str(subject_id), str(user_id)]
            if search and search.strip():
                query += " AND (title ILIKE %s OR file_name ILIKE %s)"
                pattern = f"%{_escape_like(search.strip())}%"
                params.extend([pattern, pattern])

            query += " ORDER BY created_at DESC;"
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

            return [
                {
                    "id": str(r[0]),
                    "subject_id": str(r[1]),
                    "user_id": str(r[2]),
                    "title": r[3],
                    "file_name": r[4],
                    "source_type": r[5],
                    "source_url": r[6],
                    "file_hash": r[7],
                    "status": r[8],
                    "error_message": r[9],
                    "page_count": r[10],
                    "word_count": r[11],
                    "version": r[12],
                    "created_at": r[13].isoformat(),
                    "updated_at": r[14].isoformat(),
                }
                for r in rows
            ]


def get_source_by_id(
    user_id: str | UUID,
    source_id: str | UUID,
    include_raw_content: bool = False,
    db_url: str | None = None,
) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cols = """
                id, subject_id, user_id, title, file_name, source_type, source_url,
                file_hash, status, error_message, page_count, word_count, version, created_at, updated_at
            """
            if include_raw_content:
                cols += ", raw_content"

            cur.execute(
                f"SELECT {cols} FROM sources WHERE id = %s AND user_id = %s;",
                (str(source_id), str(user_id)),
            )
            row = cur.fetchone()
            if not row:
                return None

            res = {
                "id": str(row[0]),
                "subject_id": str(row[1]),
                "user_id": str(row[2]),
                "title": row[3],
                "file_name": row[4],
                "source_type": row[5],
                "source_url": row[6],
                "file_hash": row[7],
                "status": row[8],
                "error_message": row[9],
                "page_count": row[10],
                "word_count": row[11],
                "version": row[12],
                "created_at": row[13].isoformat(),
                "updated_at": row[14].isoformat(),
            }
            if include_raw_content:
                res["raw_content"] = row[15]
            return res


def update_source_title(
    user_id: str | UUID,
    source_id: str | UUID,
    title: str,
    db_url: str | None = None,
) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE sources
                    SET title = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND user_id = %s
                    RETURNING id, subject_id, user_id, title, file_name, source_type, status, version, updated_at;
                    """,
                    (title.strip(), str(source_id), str(user_id)),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return {
                    "id": str(row[0]),
                    "subject_id": str(row[1]),
                    "user_id": str(row[2]),
                    "title": row[3],
                    "file_name": row[4],
                    "source_type": row[5],
                    "status": row[6],
                    "version": row[7],
                    "updated_at": row[8].isoformat(),
                }


def update_source_status(
    source_id: str | UUID,
    status: str,
    error_message: str | None = None,
    page_count: int | None = None,
    word_count: int | None = None,
    raw_content: str | None = None,
    version: int | None = None,
    file_hash: str | None = None,
    file_name: str | None = None,
    source_type: str | None = None,
    title: str | None = None,
    db_url: str | None = None,
) -> None:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                updates = ["status = %s", "error_message = %s", "updated_at = CURRENT_TIMESTAMP"]
                params: list[Any] = [status, error_message]

                if page_count is not None:
                    updates.append("page_count = %s")
                    params.append(page_count)
                if word_count is not None:
                    updates.append("word_count = %s")
                    params.append(word_count)
                if raw_content is not None:
                    updates.append("raw_content = %s")
                    params.append(raw_content)
                if version is not None:
                    updates.append("version = %s")
                    params.append(version)
                if file_hash is not None:
                    updates.append("file_hash = %s")
                    params.append(file_hash)
                if file_name is not None:
                    updates.append("file_name = %s")
                    params.append(file_name)
                if title is not None:
                    updates.append("title = %s")
                    params.append(title)
                if source_type is not None:
                    updates.append("source_type = %s")
                    params.append(source_type)

                params.append(str(source_id))
                query = f"UPDATE sources SET {', '.join(updates)} WHERE id = %s;"
                cur.execute(query, tuple(params))


def fail_stale_processing_sources(
    user_id: str | UUID,
    subject_id: str | UUID,
    max_age_minutes: int,
    db_url: str | None = None,
) -> int:
    """
    Ingestion runs inside the request that started it, so a source still marked
    "processing" long after that request must have been interrupted (for example by
    an API restart). Mark those as failed so the user can retry or remove them.
    """
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE sources
                    SET status = 'failed',
                        error_message = 'Processing was interrupted before it finished. Retry to process this source again.'
                    WHERE subject_id = %s AND user_id = %s AND status = 'processing'
                      AND updated_at < CURRENT_TIMESTAMP - make_interval(mins => %s);
                    """,
                    (str(subject_id), str(user_id), max_age_minutes),
                )
                return cur.rowcount


def delete_source(
    user_id: str | UUID,
    source_id: str | UUID,
    db_url: str | None = None,
) -> bool:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                # Chunks cascade delete automatically
                cur.execute(
                    "DELETE FROM sources WHERE id = %s AND user_id = %s RETURNING subject_id;",
                    (str(source_id), str(user_id)),
                )
                row = cur.fetchone()
                if row:
                    cur.execute(
                        "UPDATE subjects SET updated_at = CURRENT_TIMESTAMP WHERE id = %s;",
                        (str(row[0]),),
                    )
                    return True
                return False


def store_source_chunks(
    user_id: str | UUID,
    subject_id: str | UUID,
    source_id: str | UUID,
    source_version: int,
    chunks: Sequence[Chunk],
    embeddings: Sequence[list[float]],
    db_url: str | None = None,
) -> int:
    """Store chunks for a subject source. Replaces existing chunks for this source_id."""
    if len(chunks) != len(embeddings):
        raise ValueError(
            f"Chunks count ({len(chunks)}) does not match embeddings count ({len(embeddings)})"
        )

    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                # 1. Remove previous chunks for this source to prevent stale indexed content
                cur.execute("DELETE FROM chunks WHERE source_id = %s;", (str(source_id),))

                # 2. Insert new chunks
                if chunks:
                    chunk_records = [
                        (
                            str(source_id),
                            str(subject_id),
                            str(user_id),
                            chunk.file_name,
                            chunk.page_number,
                            chunk.chunk_index,
                            chunk.text,
                            embeddings[idx],
                            source_version,
                        )
                        for idx, chunk in enumerate(chunks)
                    ]

                    cur.executemany(
                        """
                        INSERT INTO chunks (
                            source_id, subject_id, user_id, file_name,
                            page_number, chunk_index, chunk_text, embedding, source_version
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector, %s);
                        """,
                        chunk_records,
                    )

    return len(chunks)


def get_source_passages(
    user_id: str | UUID,
    source_id: str | UUID,
    page_number: int | None = None,
    db_url: str | None = None,
) -> list[dict[str, Any]]:
    """Retrieve indexed chunks for a specific source and optional page number."""
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            query = """
                SELECT c.id, c.file_name, c.page_number, c.chunk_index, c.chunk_text, s.title
                FROM chunks c
                JOIN sources s ON c.source_id = s.id
                WHERE c.source_id = %s AND c.user_id = %s
            """
            params: list[Any] = [str(source_id), str(user_id)]
            if page_number is not None:
                query += " AND c.page_number = %s"
                params.append(page_number)

            query += " ORDER BY c.page_number ASC, c.chunk_index ASC;"
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

            return [
                {
                    "id": r[0],
                    "file_name": r[1],
                    "page_number": r[2],
                    "chunk_index": r[3],
                    "text": r[4],
                    "chunk_text": r[4],
                    "source_title": r[5],
                }
                for r in rows
            ]


# ============================================================================
# SCOPED VECTOR RETRIEVAL
# ============================================================================

def extract_key_terms(query: str) -> list[str]:
    terms = set()
    # Match equation patterns: "Eq. 3", "Eq 3", "Equation 3"
    for m in re.finditer(r'\b(Eq(?:uation)?\.?\s*\d+[a-zA-Z]?)\b', query, re.IGNORECASE):
        terms.add(m.group(1))

    # Match short terms, acronyms, or specific technical identifiers
    for word in re.findall(r'\b[A-Za-z0-9_\-\.\^\/]{2,}\b', query):
        clean_word = word.strip(".,;:?!")
        stop_words = {
            "what", "where", "when", "which", "who", "whom", "whose", "why", "how",
            "is", "are", "was", "were", "be", "been", "being",
            "have", "has", "had", "do", "does", "did",
            "the", "a", "an", "and", "or", "but", "if", "then", "else",
            "for", "of", "to", "in", "on", "at", "by", "from", "with", "about",
            "tell", "explain", "describe", "find", "give", "show", "summarize",
            "this", "that", "these", "those", "does", "some", "any",
        }
        if clean_word.lower() not in stop_words and len(clean_word) >= 2:
            terms.add(clean_word)
    return list(terms)


def search_scoped(
    question: str,
    user_id: str | UUID,
    subject_id: str | UUID,
    selected_source_ids: list[str | UUID],
    k: int = 5,
    db_url: str | None = None,
) -> list[dict[str, Any]]:
    """
    Search vector similarity scoped strictly to:
    - Current authenticated user
    - Active subject
    - Only user-selected sources that are 'ready'
    Combines semantic vector similarity with keyword/exact term matching for terms like 'Ksi' and 'Eq. 3'.
    """
    if not question.strip() or k <= 0 or not selected_source_ids:
        return []

    from ingestion.embedder import embed_text
    query_vector = embed_text(question)
    selected_ids_str = [str(s_id) for s_id in selected_source_ids]
    key_terms = extract_key_terms(question)

    results_by_id: dict[int, dict[str, Any]] = {}

    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            # 1. Semantic vector search (fetch up to max(k * 2, 8) candidates)
            cur.execute(
                """
                SELECT 
                    c.id,
                    c.source_id,
                    c.file_name,
                    c.page_number,
                    c.chunk_text,
                    c.chunk_index,
                    1 - (c.embedding <=> %s::vector) AS similarity_score,
                    s.title,
                    s.version,
                    s.updated_at
                FROM chunks c
                JOIN sources s ON c.source_id = s.id
                JOIN subjects sub ON s.subject_id = sub.id
                WHERE sub.user_id = %s
                  AND s.subject_id = %s
                  AND s.id = ANY(%s::uuid[])
                  AND s.status = 'ready'
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s;
                """,
                (
                    query_vector,
                    str(user_id),
                    str(subject_id),
                    selected_ids_str,
                    query_vector,
                    max(k * 2, 8),
                ),
            )
            for row in cur.fetchall():
                c_id, src_id, file_name, page_num, text, chunk_idx, score, s_title, s_version, s_updated = row
                results_by_id[c_id] = {
                    "id": c_id,
                    "source_id": str(src_id),
                    "file": s_title or file_name,
                    "file_name": file_name,
                    "title": s_title or file_name,
                    "page": page_num,
                    "page_number": page_num,
                    "text": text,
                    "chunk_text": text,
                    "chunk_index": chunk_idx,
                    "score": float(score),
                    "similarity_score": float(score),
                    "raw_cosine": float(score),
                    "source_version": s_version,
                    "upload_date": s_updated.isoformat() if hasattr(s_updated, "isoformat") else str(s_updated),
                    "matched_terms": [],
                }

            # 2. Exact keyword search for key terms (e.g. "Ksi", "Eq. 3")
            if key_terms:
                like_patterns = [f"%{_escape_like(term)}%" for term in key_terms]
                cur.execute(
                    """
                    SELECT 
                        c.id,
                        c.source_id,
                        c.file_name,
                        c.page_number,
                        c.chunk_text,
                        c.chunk_index,
                        1 - (c.embedding <=> %s::vector) AS similarity_score,
                        s.title,
                        s.version,
                        s.updated_at
                    FROM chunks c
                    JOIN sources s ON c.source_id = s.id
                    JOIN subjects sub ON s.subject_id = sub.id
                    WHERE sub.user_id = %s
                    AND s.subject_id = %s
                    AND s.id = ANY(%s::uuid[])
                    AND s.status = 'ready'
                    AND (c.chunk_text ILIKE ANY(%s))
                    ORDER BY c.embedding <=> %s::vector
                    LIMIT %s;
                    """,
                    (
                        query_vector,
                        str(user_id),
                        str(subject_id),
                        selected_ids_str,
                        like_patterns,
                        query_vector,
                        k * 2,
                    ),
                )
                for row in cur.fetchall():
                    c_id, src_id, file_name, page_num, text, chunk_idx, score, s_title, s_version, s_updated = row
                    if c_id not in results_by_id:
                        results_by_id[c_id] = {
                            "id": c_id,
                            "source_id": str(src_id),
                            "file": s_title or file_name,
                            "file_name": file_name,
                            "title": s_title or file_name,
                            "page": page_num,
                            "page_number": page_num,
                            "text": text,
                            "chunk_text": text,
                            "chunk_index": chunk_idx,
                            "score": float(score),
                            "similarity_score": float(score),
                            "raw_cosine": float(score),
                            "source_version": s_version,
                            "upload_date": s_updated.isoformat() if hasattr(s_updated, "isoformat") else str(s_updated),
                            "matched_terms": [],
                        }

    # 3. Hybrid scoring: check which chunks contain key terms
    for res in results_by_id.values():
        chunk_text_lower = res["text"].lower()
        matched = [t for t in key_terms if t.lower() in chunk_text_lower]
        res["matched_terms"] = matched
        if matched:
            # Boost score so short terms and equations pass minimum score threshold
            boosted = max(res["score"] + 0.30, 0.40)
            res["score"] = min(1.0, boosted)
            res["similarity_score"] = res["score"]
            # res["raw_cosine"] keeps the unboosted similarity; "score" is the final boosted one.

    # 4. Rank by score descending and take top k
    ranked = sorted(results_by_id.values(), key=lambda x: x["score"], reverse=True)
    return ranked[:k]


# ============================================================================
# CONVERSATION & MESSAGE OPERATIONS
# ============================================================================

def create_conversation(
    user_id: str | UUID,
    subject_id: str | UUID,
    title: str = "New Conversation",
    db_url: str | None = None,
) -> dict[str, Any]:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO conversations (subject_id, user_id, title)
                    VALUES (%s, %s, %s)
                    RETURNING id, subject_id, user_id, title, created_at, updated_at;
                    """,
                    (str(subject_id), str(user_id), title.strip()),
                )
                row = cur.fetchone()
                return {
                    "id": str(row[0]),
                    "subject_id": str(row[1]),
                    "user_id": str(row[2]),
                    "title": row[3],
                    "created_at": row[4].isoformat(),
                    "updated_at": row[5].isoformat(),
                    "message_count": 0,
                }


def get_conversations_for_subject(
    user_id: str | UUID,
    subject_id: str | UUID,
    db_url: str | None = None,
) -> list[dict[str, Any]]:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    c.id, c.subject_id, c.user_id, c.title, c.created_at, c.updated_at,
                    COUNT(m.id)::int AS message_count
                FROM conversations c
                LEFT JOIN messages m ON c.id = m.conversation_id
                WHERE c.subject_id = %s AND c.user_id = %s
                GROUP BY c.id, c.subject_id, c.user_id, c.title, c.created_at, c.updated_at
                ORDER BY c.updated_at DESC;
                """,
                (str(subject_id), str(user_id)),
            )
            rows = cur.fetchall()
            return [
                {
                    "id": str(r[0]),
                    "subject_id": str(r[1]),
                    "user_id": str(r[2]),
                    "title": r[3],
                    "created_at": r[4].isoformat(),
                    "updated_at": r[5].isoformat(),
                    "message_count": r[6],
                }
                for r in rows
            ]


def get_conversation_by_id(
    user_id: str | UUID,
    conversation_id: str | UUID,
    db_url: str | None = None,
) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, subject_id, user_id, title, created_at, updated_at
                FROM conversations
                WHERE id = %s AND user_id = %s;
                """,
                (str(conversation_id), str(user_id)),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": str(row[0]),
                "subject_id": str(row[1]),
                "user_id": str(row[2]),
                "title": row[3],
                "created_at": row[4].isoformat(),
                "updated_at": row[5].isoformat(),
            }


def update_conversation_title(
    user_id: str | UUID,
    conversation_id: str | UUID,
    title: str,
    db_url: str | None = None,
) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE conversations
                    SET title = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND user_id = %s
                    RETURNING id, subject_id, user_id, title, created_at, updated_at;
                    """,
                    (title.strip(), str(conversation_id), str(user_id)),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return {
                    "id": str(row[0]),
                    "subject_id": str(row[1]),
                    "user_id": str(row[2]),
                    "title": row[3],
                    "created_at": row[4].isoformat(),
                    "updated_at": row[5].isoformat(),
                }


def delete_conversation(
    user_id: str | UUID,
    conversation_id: str | UUID,
    db_url: str | None = None,
) -> bool:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM conversations WHERE id = %s AND user_id = %s;",
                    (str(conversation_id), str(user_id)),
                )
                return cur.rowcount > 0


def delete_message(
    user_id: str | UUID,
    message_id: str | UUID,
    conversation_id: str | UUID | None = None,
    role: str | None = None,
    db_url: str | None = None,
) -> bool:
    query = "DELETE FROM messages WHERE id = %s AND user_id = %s"
    params: list[Any] = [str(message_id), str(user_id)]
    if conversation_id is not None:
        query += " AND conversation_id = %s"
        params.append(str(conversation_id))
    if role is not None:
        query += " AND role = %s"
        params.append(role)
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(query + ";", tuple(params))
                return cur.rowcount > 0


def save_message(
    user_id: str | UUID,
    conversation_id: str | UUID,
    role: str,
    content: str,
    model: str | None = None,
    citations: list[dict[str, Any]] | None = None,
    conflicts: list[dict[str, Any]] | None = None,
    conflict_detected: bool = False,
    abstained: bool = False,
    abstain_reason: str | None = None,
    retrieved: list[dict[str, Any]] | None = None,
    selected_source_ids: list[str] | None = None,
    source_versions: dict[str, int] | None = None,
    tokens: dict[str, int] | None = None,
    latency: float = 0.0,
    db_url: str | None = None,
) -> dict[str, Any]:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO messages (
                        conversation_id, user_id, role, content, model,
                        citations, conflicts, conflict_detected, abstained, abstain_reason,
                        retrieved, selected_source_ids, source_versions, tokens, latency
                    )
                    VALUES (
                        %s, %s, %s, %s, %s,
                        %s::jsonb, %s::jsonb, %s, %s, %s,
                        %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s
                    )
                    RETURNING id, conversation_id, user_id, role, content, model,
                              citations, conflicts, conflict_detected, abstained, abstain_reason,
                              retrieved, selected_source_ids, source_versions, tokens, latency, created_at;
                    """,
                    (
                        str(conversation_id),
                        str(user_id),
                        role,
                        content,
                        model,
                        json.dumps(citations or []),
                        json.dumps(conflicts or []),
                        conflict_detected,
                        abstained,
                        abstain_reason,
                        json.dumps(retrieved or []),
                        json.dumps(selected_source_ids or []),
                        json.dumps(source_versions or {}),
                        json.dumps(tokens or {"input": 0, "output": 0, "total": 0}),
                        latency,
                    ),
                )
                row = cur.fetchone()
                # Update conversation updated_at
                cur.execute(
                    "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = %s;",
                    (str(conversation_id),),
                )
                return {
                    "id": str(row[0]),
                    "conversation_id": str(row[1]),
                    "user_id": str(row[2]),
                    "role": row[3],
                    "content": row[4],
                    "model": row[5],
                    "citations": row[6] if isinstance(row[6], list) else json.loads(row[6]),
                    "conflicts": row[7] if isinstance(row[7], list) else json.loads(row[7]),
                    "conflict_detected": row[8],
                    "abstained": row[9],
                    "abstain_reason": row[10],
                    "retrieved": row[11] if isinstance(row[11], list) else json.loads(row[11]),
                    "selected_source_ids": row[12] if isinstance(row[12], list) else json.loads(row[12]),
                    "source_versions": row[13] if isinstance(row[13], dict) else json.loads(row[13]),
                    "tokens": row[14] if isinstance(row[14], dict) else json.loads(row[14]),
                    "latency": row[15],
                    "created_at": row[16].isoformat(),
                }


def get_messages_for_conversation(
    user_id: str | UUID,
    conversation_id: str | UUID,
    db_url: str | None = None,
) -> list[dict[str, Any]]:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    id, conversation_id, user_id, role, content, model,
                    citations, conflicts, conflict_detected, abstained, abstain_reason,
                    retrieved, selected_source_ids, source_versions, tokens, latency, created_at
                FROM messages
                WHERE conversation_id = %s AND user_id = %s
                ORDER BY created_at ASC;
                """,
                (str(conversation_id), str(user_id)),
            )
            rows = cur.fetchall()

            return [
                {
                    "id": str(r[0]),
                    "conversation_id": str(r[1]),
                    "user_id": str(r[2]),
                    "role": r[3],
                    "content": r[4],
                    "model": r[5],
                    "citations": r[6] if isinstance(r[6], list) else json.loads(r[6]),
                    "conflicts": r[7] if isinstance(r[7], list) else json.loads(r[7]),
                    "conflict_detected": r[8],
                    "abstained": r[9],
                    "abstain_reason": r[10],
                    "retrieved": r[11] if isinstance(r[11], list) else json.loads(r[11]),
                    "selected_source_ids": r[12] if isinstance(r[12], list) else json.loads(r[12]),
                    "source_versions": r[13] if isinstance(r[13], dict) else json.loads(r[13]),
                    "tokens": r[14] if isinstance(r[14], dict) else json.loads(r[14]),
                    "latency": r[15],
                    "created_at": r[16].isoformat(),
                }
                for r in rows
            ]


# ============================================================================
# NOTE OPERATIONS
# ============================================================================

def create_note(
    user_id: str | UUID,
    subject_id: str | UUID,
    title: str,
    content: str,
    is_saved_answer: bool = False,
    citations: list[dict[str, Any]] | None = None,
    db_url: str | None = None,
) -> dict[str, Any]:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO notes (
                        subject_id, user_id, title, content, is_saved_answer, citations
                    )
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                    RETURNING id, subject_id, user_id, title, content, is_saved_answer, citations, created_at, updated_at;
                    """,
                    (
                        str(subject_id),
                        str(user_id),
                        title.strip(),
                        content.strip(),
                        is_saved_answer,
                        json.dumps(citations or []),
                    ),
                )
                row = cur.fetchone()
                return {
                    "id": str(row[0]),
                    "subject_id": str(row[1]),
                    "user_id": str(row[2]),
                    "title": row[3],
                    "content": row[4],
                    "is_saved_answer": row[5],
                    "citations": row[6] if isinstance(row[6], list) else json.loads(row[6]),
                    "created_at": row[7].isoformat(),
                    "updated_at": row[8].isoformat(),
                }


def get_notes_for_subject(
    user_id: str | UUID,
    subject_id: str | UUID,
    search: str | None = None,
    db_url: str | None = None,
) -> list[dict[str, Any]]:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            query = """
                SELECT id, subject_id, user_id, title, content, is_saved_answer, citations, created_at, updated_at
                FROM notes
                WHERE subject_id = %s AND user_id = %s
            """
            params: list[Any] = [str(subject_id), str(user_id)]
            if search and search.strip():
                query += " AND (title ILIKE %s OR content ILIKE %s)"
                pattern = f"%{_escape_like(search.strip())}%"
                params.extend([pattern, pattern])

            query += " ORDER BY updated_at DESC;"
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

            return [
                {
                    "id": str(r[0]),
                    "subject_id": str(r[1]),
                    "user_id": str(r[2]),
                    "title": r[3],
                    "content": r[4],
                    "is_saved_answer": r[5],
                    "citations": r[6] if isinstance(r[6], list) else json.loads(r[6]),
                    "created_at": r[7].isoformat(),
                    "updated_at": r[8].isoformat(),
                }
                for r in rows
            ]


def get_note_by_id(
    user_id: str | UUID,
    note_id: str | UUID,
    db_url: str | None = None,
) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, subject_id, user_id, title, content, is_saved_answer, citations, created_at, updated_at
                FROM notes
                WHERE id = %s AND user_id = %s;
                """,
                (str(note_id), str(user_id)),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": str(row[0]),
                "subject_id": str(row[1]),
                "user_id": str(row[2]),
                "title": row[3],
                "content": row[4],
                "is_saved_answer": row[5],
                "citations": row[6] if isinstance(row[6], list) else json.loads(row[6]),
                "created_at": row[7].isoformat(),
                "updated_at": row[8].isoformat(),
            }


def update_note(
    user_id: str | UUID,
    note_id: str | UUID,
    title: str | None = None,
    content: str | None = None,
    db_url: str | None = None,
) -> dict[str, Any] | None:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT title, content FROM notes WHERE id = %s AND user_id = %s;",
                    (str(note_id), str(user_id)),
                )
                curr = cur.fetchone()
                if not curr:
                    return None

                new_title = title.strip() if title is not None else curr[0]
                new_content = content.strip() if content is not None else curr[1]

                cur.execute(
                    """
                    UPDATE notes
                    SET title = %s, content = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND user_id = %s
                    RETURNING id, subject_id, user_id, title, content, is_saved_answer, citations, created_at, updated_at;
                    """,
                    (new_title, new_content, str(note_id), str(user_id)),
                )
                row = cur.fetchone()
                return {
                    "id": str(row[0]),
                    "subject_id": str(row[1]),
                    "user_id": str(row[2]),
                    "title": row[3],
                    "content": row[4],
                    "is_saved_answer": row[5],
                    "citations": row[6] if isinstance(row[6], list) else json.loads(row[6]),
                    "created_at": row[7].isoformat(),
                    "updated_at": row[8].isoformat(),
                }


def delete_note(
    user_id: str | UUID,
    note_id: str | UUID,
    db_url: str | None = None,
) -> bool:
    with get_connection(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM notes WHERE id = %s AND user_id = %s;",
                    (str(note_id), str(user_id)),
                )
                return cur.rowcount > 0
