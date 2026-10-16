import asyncio
from collections import defaultdict
import hashlib
import io
import logging
import math
import os
import re
from pathlib import Path
import threading
import time
from typing import Any, List, Optional
from uuid import UUID

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, EmailStr, Field, field_validator

from answering.answer import answer_question
from answering.notebook_answer import answer_notebook_question
from api.auth import (
    DEMO_USER_EMAIL,
    create_guest_user_and_session,
    create_user_session,
    get_current_user,
    get_current_user_or_404,
    get_or_create_demo_user,
    hash_password,
    verify_password,
)
from db.notebook_store import (
    check_duplicate_source,
    create_conversation,
    create_note,
    create_source,
    create_subject,
    create_user,
    delete_conversation,
    delete_note,
    delete_session,
    delete_source,
    fail_stale_processing_sources,
    delete_subject,
    get_conversation_by_id,
    get_conversations_for_subject,
    get_messages_for_conversation,
    get_note_by_id,
    get_notes_for_subject,
    get_source_by_id,
    get_source_passages,
    get_sources_for_subject,
    get_subject_by_id,
    get_subjects_for_user,
    get_user_by_email,
    store_source_chunks,
    update_conversation_title,
    update_note,
    update_source_status,
    update_source_title,
    update_subject,
)
from db.retrieval import search
from db.store import get_all_documents, get_passages_for_page
from ingestion.chunker import chunk_pages
from ingestion.embedder import embed_batch
from ingestion.parsers import (
    fetch_and_parse_url,
    parse_pdf_source,
    parse_text_source,
)
from ingestion.pipeline import ingest_pdf

logger = logging.getLogger("course_assistant.api")

app = FastAPI(
    title="Course-Document Assistant & Study Notebook",
    description="Vector search retrieval, notebook management, and grounded conversational assistant.",
    version="2.0.0",
)

allowed_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
env_origins = os.getenv("ALLOWED_ORIGINS", "")
if env_origins:
    for orig in env_origins.split(","):
        cleaned = orig.strip()
        if cleaned and cleaned not in allowed_origins:
            allowed_origins.append(cleaned)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)

MAX_UPLOAD_SIZE_BYTES = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(50 * 1024 * 1024)))  # 50 MB for PDF
MAX_TEXT_SIZE_BYTES = int(os.getenv("MAX_TEXT_SIZE_BYTES", str(10 * 1024 * 1024)))      # 10 MB for TXT/MD

# Demo mode in-memory rate limiter tracking timestamps per IP
ask_rate_limit_history: dict[str, list[float]] = defaultdict(list)


def is_demo_mode() -> bool:
    if os.getenv("DEMO_MODE", "").lower() in ("true", "1", "yes"):
        return True
    if os.getenv("ENVIRONMENT", "").lower() == "production" and os.getenv("ALLOW_DEMO_UPLOADS", "").lower() not in ("true", "1"):
        return True
    return False


def is_demo_login_allowed() -> bool:
    """Shared writable demo login is strictly disabled in production.
    Anonymous visitors cannot obtain a writable demo session.
    Only enabled in local development if ALLOW_DEMO_LOGIN is explicitly 'true'."""
    env = os.getenv("ENVIRONMENT", os.getenv("ENV", "")).lower()
    if env in ("production", "prod"):
        return False
    return os.getenv("ALLOW_DEMO_LOGIN", "false").lower() in ("true", "1", "yes")


def get_demo_ask_limit() -> int:
    try:
        return int(os.getenv("DEMO_ASK_PER_MINUTE", "10"))
    except ValueError:
        return 10


RATE_LIMIT_WINDOW_SECONDS = 60.0


def get_client_ip(request: Request) -> str:
    """Client address used as the key for per-IP rate limiting.

    1. CF-Connecting-IP, when present. The Render deployment sits behind Cloudflare, which
       overwrites this header with the real client address, so it cannot be forged through
       the edge. Set TRUST_CF_CONNECTING_IP=false when the API is not behind Cloudflare.
    2. Otherwise the last X-Forwarded-For entry, which is the one appended by the nearest
       proxy. Earlier entries are client-supplied and must not be trusted.
    3. Otherwise the socket peer.

    Keying on the last X-Forwarded-For entry alone was not enough in production: behind two
    proxy layers that entry is the edge node, which changes between requests, so one client's
    requests were spread over several counters and the limit leaked.
    """
    if os.getenv("TRUST_CF_CONNECTING_IP", "true").lower() not in ("false", "0", "no"):
        edge_ip = request.headers.get("cf-connecting-ip", "").strip()
        if edge_ip:
            return edge_ip
    last_hop = request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
    if last_hop:
        return last_hop
    return request.client.host if request.client else "127.0.0.1"


def _enforce_rate_limit(history: dict[str, list[float]], key: str, limit: int, detail: str) -> None:
    """Sliding 60-second window. Raises 429 with a Retry-After header once the limit is reached."""
    now = time.time()
    timestamps = [ts for ts in history[key] if now - ts < RATE_LIMIT_WINDOW_SECONDS]
    if len(timestamps) >= limit:
        history[key] = timestamps
        oldest = timestamps[0] if timestamps else now
        retry_after = max(1, math.ceil(RATE_LIMIT_WINDOW_SECONDS - (now - oldest)))
        raise HTTPException(
            status_code=429,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )
    timestamps.append(now)
    history[key] = timestamps


def check_ask_rate_limit(client_ip: str) -> None:
    if not is_demo_mode():
        return
    limit = get_demo_ask_limit()
    _enforce_rate_limit(
        ask_rate_limit_history,
        client_ip,
        limit,
        f"Rate limit exceeded. Demo allows up to {limit} questions per minute.",
    )


user_ask_history: dict[str, list[float]] = defaultdict(list)


def check_user_ask_rate_limit(user_id: str, limit: int = 15) -> None:
    """Enforce rate limits per guest session to prevent model quota abuse."""
    _enforce_rate_limit(
        user_ask_history,
        user_id,
        limit,
        f"Rate limit exceeded. Portfolio deployment allows up to {limit} questions per minute.",
    )


def reset_rate_limits() -> None:
    """Helper for testing to clear in-memory rate limit counts."""
    ask_rate_limit_history.clear()
    user_ask_history.clear()


# Response settings a notebook may store. Anything else is rejected.
ALLOWED_SUBJECT_SETTINGS: dict[str, tuple[str, ...]] = {
    "response_length": ("concise", "default", "detailed"),
    "response_style": ("general", "learning-guide"),
}


def validate_subject_settings(settings: Any) -> Optional[dict[str, str]]:
    """Check response settings against the known schema.

    Returns the settings unchanged when valid, None when none were sent, and raises a
    400 naming the offending key or value otherwise.
    """
    if settings is None:
        return None
    if not isinstance(settings, dict):
        raise HTTPException(status_code=400, detail="Invalid settings: expected an object.")
    allowed_keys = ", ".join(ALLOWED_SUBJECT_SETTINGS)
    unknown = sorted(str(key) for key in settings if key not in ALLOWED_SUBJECT_SETTINGS)
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid settings: unknown setting {', '.join(unknown)}. Allowed settings: {allowed_keys}.",
        )
    for key, value in settings.items():
        allowed_values = ALLOWED_SUBJECT_SETTINGS[key]
        if not isinstance(value, str) or value not in allowed_values:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid settings: {key} must be one of {', '.join(allowed_values)}.",
            )
    return dict(settings)


# ============================================================================
# SCHEMAS
# ============================================================================

class RegisterRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=6)


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict[str, Any]


class SubjectCreateRequest(BaseModel):
    name: str = Field(..., max_length=200)
    course_code: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=2000)
    settings: Optional[Any] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Subject name cannot be empty or whitespace.")
        return s

    @field_validator("course_code", "description")
    @classmethod
    def validate_optional_text(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return v.strip() or None


class SubjectUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    course_code: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=2000)
    is_archived: Optional[bool] = None
    settings: Optional[Any] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if not s:
            raise ValueError("Subject name cannot be empty or whitespace.")
        return s


class SourcePasteRequest(BaseModel):
    title: str = Field(..., max_length=200)
    text: str = Field(..., max_length=500000)

    @field_validator("title", "text")
    @classmethod
    def validate_trimmed(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Field cannot be empty or whitespace.")
        return s


class SourceUrlRequest(BaseModel):
    url: str = Field(..., max_length=2048)
    title: Optional[str] = Field(default=None, max_length=200)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        s = v.strip()
        if len(s) < 5:
            raise ValueError("Invalid URL length.")
        return s


class SourceRenameRequest(BaseModel):
    title: str = Field(..., max_length=200)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Title cannot be empty or whitespace.")
        return s


class ConversationCreateRequest(BaseModel):
    title: Optional[str] = Field(default="New Conversation", max_length=200)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: Optional[str]) -> str:
        if not v or not v.strip():
            return "New Conversation"
        return v.strip()


class ConversationRenameRequest(BaseModel):
    title: str = Field(..., max_length=200)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Title cannot be empty or whitespace.")
        return s


class MessageSendRequest(BaseModel):
    question: str = Field(..., max_length=4000)
    selected_source_ids: list[str] = Field(default_factory=list)
    is_retry: bool = False
    retry_message_id: Optional[str] = None

    @field_validator("question")
    @classmethod
    def validate_question(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Question cannot be empty or whitespace.")
        return s


class NoteCreateRequest(BaseModel):
    title: str = Field(..., max_length=200)
    content: str = Field(..., max_length=100000)
    is_saved_answer: bool = False
    citations: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("title", "content")
    @classmethod
    def validate_text(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Field cannot be empty or whitespace.")
        return s


class NoteUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    content: Optional[str] = Field(default=None, max_length=100000)

    @field_validator("title", "content")
    @classmethod
    def validate_optional_text(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if not s:
            raise ValueError("Field cannot be empty or whitespace.")
        return s


# Legacy Models
class SearchRequest(BaseModel):
    question: str = Field(..., description="Query string to search for")
    k: int = Field(default=5, ge=1, le=50, description="Number of results to retrieve")


class SearchResultItem(BaseModel):
    file_name: str
    page_number: int
    text: str
    score: float
    chunk_index: int | None = None
    upload_date: str | None = None


class SearchResponse(BaseModel):
    query: str
    k: int
    results: List[SearchResultItem]


class CitationItem(BaseModel):
    file: str
    page: int


class ConflictClaim(BaseModel):
    file: str
    page: int
    value: str
    upload_date: str | None = None


class ConflictItem(BaseModel):
    topic: str
    claims: List[ConflictClaim]


class TokenUsage(BaseModel):
    input: int
    output: int
    total: int


class AskRequest(BaseModel):
    question: str = Field(..., description="Question to answer")
    k: int = Field(default=5, ge=1, le=50, description="Number of passages to retrieve")


class AskResponse(BaseModel):
    answer: str
    citations: List[CitationItem]
    conflicts: List[ConflictItem] = Field(default_factory=list)
    conflict_detected: bool = False
    abstained: bool
    abstain_reason: str | None = None
    retrieved: List[dict[str, Any]]
    tokens: TokenUsage
    latency: float
    model: str | None = Field(
        default=None,
        description="Configured client model identifier used for generation, or null if abstained before model invocation.",
    )


class UploadResponse(BaseModel):
    file_name: str
    chunks_stored: int
    message: str


class DocumentItem(BaseModel):
    file_name: str
    upload_date: str | None = None
    chunk_count: int


class PassageItem(BaseModel):
    file_name: str
    page_number: int
    chunk_index: int
    text: str
    chunk_text: str | None = None


# ============================================================================
# BASE HEALTH & LEGACY ENDPOINTS
# ============================================================================

@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/documents", response_model=List[DocumentItem])
def get_documents_endpoint():
    """List stored documents, their upload dates, and chunk counts."""
    return get_all_documents()


@app.get("/passages", response_model=List[PassageItem])
def get_passages_endpoint(
    file: str = Query(..., description="Document file name"),
    page: int = Query(..., ge=1, description="Page number"),
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    """Return chunks for a file and page that the caller is allowed to read.

    A signed-in caller sees their own sources, or the shared demo documents. No credentials,
    someone else's source and an unknown name all answer the same 404.
    """
    passages = get_passages_for_page(file_name=file, page_number=page, user_id=current_user["id"])
    if not passages:
        raise HTTPException(status_code=404, detail="Not found.")
    return passages


@app.post("/search", response_model=SearchResponse)
def search_endpoint(payload: SearchRequest):
    """Search stored course document chunks by vector similarity."""
    results = search(question=payload.question, k=payload.k)
    formatted = [
        SearchResultItem(
            file_name=r["file_name"],
            page_number=r["page_number"],
            text=r["text"],
            score=r["score"],
            chunk_index=r.get("chunk_index"),
            upload_date=r.get("upload_date"),
        )
        for r in results
    ]
    return SearchResponse(
        query=payload.question,
        k=payload.k,
        results=formatted,
    )


@app.post("/ask", response_model=AskResponse)
def ask_endpoint(payload: AskRequest, request: Request):
    """Answer a question using retrieved passages, citations, and support checks."""
    check_ask_rate_limit(get_client_ip(request))
    result = answer_question(question=payload.question, k=payload.k)
    return AskResponse(**result)


@app.post("/upload", response_model=UploadResponse)
async def upload_endpoint(
    file: UploadFile = File(...),
):
    """Upload and ingest a course PDF document (capped at configurable 50 MB; disabled in demo mode)."""
    if is_demo_mode():
        raise HTTPException(
            status_code=403,
            detail="Upload is disabled in demo mode.",
        )

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        content = await file.read()
        if len(content) > MAX_UPLOAD_SIZE_BYTES:
            limit_mb = MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"File size exceeds the {limit_mb} MB limit.",
            )

        async with _INGEST_SLOT:
            chunk_count = await run_in_threadpool(_ingest_pdf_locked, content, file.filename)
        return UploadResponse(
            file_name=file.filename,
            chunks_stored=chunk_count,
            message=f"Successfully ingested {chunk_count} chunk(s).",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process uploaded PDF '{file.filename}': {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An error occurred while processing the uploaded file.",
        )


# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@app.post("/auth/register", response_model=AuthResponse)
def register_endpoint(payload: RegisterRequest):
    email = payload.email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email address is required.")

    existing = get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    pw_hash = hash_password(payload.password)
    user = create_user(email=email, password_hash=pw_hash)
    token = create_user_session(user["id"])
    return AuthResponse(token=token, user=user)


@app.post("/auth/login", response_model=AuthResponse)
def login_endpoint(payload: LoginRequest):
    email = payload.email.lower().strip()
    if email == DEMO_USER_EMAIL.lower() and not is_demo_login_allowed():
        raise HTTPException(
            status_code=403,
            detail="Shared demo account login is disabled in production. Please register or sign in with your personal account.",
        )
    user = get_user_by_email(email)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_user_session(user["id"])
    return AuthResponse(token=token, user={"id": user["id"], "email": user["email"]})


@app.post("/auth/demo-login", response_model=AuthResponse)
def demo_login_endpoint():
    """Convenient instant sign-in with the demo account (disabled by default in production)."""
    if not is_demo_login_allowed():
        raise HTTPException(
            status_code=403,
            detail="Shared writable demo login is disabled in production. Please register or sign in with your own account.",
        )
    user = get_or_create_demo_user()
    token = create_user_session(user["id"])
    return AuthResponse(token=token, user={"id": user["id"], "email": user["email"]})


@app.get("/auth/config")
def auth_config_endpoint():
    """Return public authentication capability flags."""
    return {
        "allow_demo_login": is_demo_login_allowed(),
        "demo_mode": is_demo_mode(),
    }


@app.post("/auth/guest-session", response_model=AuthResponse)
def guest_session_endpoint():
    """Automatically creates an isolated private guest workspace session for this browser."""
    user, token = create_guest_user_and_session()
    return AuthResponse(token=token, user={"id": user["id"], "email": "Guest Workspace"})


@app.get("/auth/me")
def me_endpoint(current_user: dict[str, Any] = Depends(get_current_user)):
    return current_user


@app.post("/auth/logout")
def logout_endpoint(current_user: dict[str, Any] = Depends(get_current_user)):
    delete_session(current_user["token"])
    return {"message": "Successfully logged out."}


# ============================================================================
# SUBJECT MANAGEMENT ENDPOINTS
# ============================================================================

@app.get("/subjects")
def get_subjects_endpoint(
    include_archived: bool = Query(False),
    search: Optional[str] = Query(None),
    sort_by: str = Query("updated_at"),
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    return get_subjects_for_user(
        user_id=current_user["id"],
        include_archived=include_archived,
        search=search,
        sort_by=sort_by,
    )


@app.post("/subjects")
def create_subject_endpoint(
    payload: SubjectCreateRequest,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    settings = validate_subject_settings(payload.settings)
    existing = get_subjects_for_user(user_id=current_user["id"], include_archived=True)
    if len(existing) >= 10:
        raise HTTPException(
            status_code=400,
            detail="Portfolio deployment limit reached: maximum 10 subjects per guest workspace.",
        )
    return create_subject(
        user_id=current_user["id"],
        name=payload.name,
        course_code=payload.course_code,
        description=payload.description,
        settings=settings,
    )


@app.get("/subjects/{subject_id}")
def get_subject_endpoint(
    subject_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    subj = get_subject_by_id(user_id=current_user["id"], subject_id=subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return subj


@app.put("/subjects/{subject_id}")
def update_subject_endpoint(
    subject_id: str,
    payload: SubjectUpdateRequest,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    settings = validate_subject_settings(payload.settings)
    updated = update_subject(
        user_id=current_user["id"],
        subject_id=subject_id,
        name=payload.name,
        course_code=payload.course_code,
        description=payload.description,
        is_archived=payload.is_archived,
        settings=settings,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return updated


@app.delete("/subjects/{subject_id}")
def delete_subject_endpoint(
    subject_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    deleted = delete_subject(user_id=current_user["id"], subject_id=subject_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return {"message": "Subject successfully deleted."}


@app.post("/subjects/{subject_id}/archive")
def archive_subject_endpoint(
    subject_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    updated = update_subject(
        user_id=current_user["id"],
        subject_id=subject_id,
        is_archived=True,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return updated


@app.post("/subjects/{subject_id}/restore")
def restore_subject_endpoint(
    subject_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    updated = update_subject(
        user_id=current_user["id"],
        subject_id=subject_id,
        is_archived=False,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return updated


@app.get("/subjects/{subject_id}/starter-questions")
def get_starter_questions_endpoint(
    subject_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    subj = get_subject_by_id(user_id=current_user["id"], subject_id=subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")

    sources = get_sources_for_subject(user_id=current_user["id"], subject_id=subject_id)
    ready_sources = [s for s in sources if s["status"] == "ready"]

    # Never fabricate course details for an empty subject
    if not ready_sources:
        return []

    # Propose grounded starter questions tailored to the ready sources
    questions: list[str] = []
    titles = [s["title"] for s in ready_sources]

    has_syllabus = any("syllabus" in t.lower() for t in titles)
    has_exam = any("exam" in t.lower() or "guide" in t.lower() for t in titles)
    has_schedule = any("schedule" in t.lower() or "lecture" in t.lower() for t in titles)
    has_assignment = any("assignment" in t.lower() or "project" in t.lower() for t in titles)

    if has_syllabus:
        questions.append("What is the grading breakdown and policy outlined in the syllabus?")
    if has_exam:
        questions.append("What are the exam dates, rules, and allowed materials?")
    if has_schedule:
        questions.append("When and where does the class meet, and what is the weekly schedule?")
    if has_assignment:
        questions.append("What are the requirements and deadlines for the assignments?")

    # Fallback to general inquiries referencing the specific document titles
    if len(questions) < 3:
        for s in ready_sources:
            q = f"What are the main topics and concepts discussed in {s['title']}?"
            if q not in questions:
                questions.append(q)
            if len(questions) >= 3:
                break

    return questions[:4]


# ============================================================================
# SOURCE MANAGEMENT ENDPOINTS
# ============================================================================

# Parsing and embedding are CPU-heavy. On a small instance, running them on the event
# loop starves the health check and the host restarts the server mid-upload, so the
# async upload routes hand this work to a worker thread, and one file is ingested at a
# time. Re-entrant because the parse helpers below call _process_and_store_source.
# Async routes also wait for _INGEST_SLOT on the event loop before taking a worker
# thread, so queued uploads don't tie up the threadpool that sync routes share.
_INGEST_LOCK = threading.RLock()
_INGEST_SLOT = asyncio.Semaphore(1)


def _ingest_pdf_locked(content: bytes, file_name: str) -> int:
    with _INGEST_LOCK:
        return ingest_pdf(source=io.BytesIO(content), file_name=file_name)


def _parse_uploaded_pages(content: bytes, ext: str, file_name: str) -> list[tuple[str, int, str]]:
    if ext == ".pdf":
        return parse_pdf_source(source=io.BytesIO(content), file_name=file_name)
    return parse_text_source(content=content.decode("utf-8", errors="replace"), file_name=file_name)


def _parse_and_store_upload(
    user_id: str,
    subject_id: str,
    source_id: str,
    version: int,
    content: bytes,
    ext: str,
    file_name: str,
) -> None:
    with _INGEST_LOCK:
        pages = _parse_uploaded_pages(content, ext, file_name)
        _process_and_store_source(
            user_id=user_id,
            subject_id=subject_id,
            source_id=source_id,
            version=version,
            pages=pages,
        )


def _process_and_store_source(
    user_id: str,
    subject_id: str,
    source_id: str,
    version: int,
    pages: list[tuple[str, int, str]],
) -> None:
    with _INGEST_LOCK:
        chunks = chunk_pages(pages)
        chunk_texts = [c.text for c in chunks]
        embeddings = embed_batch(chunk_texts)
        store_source_chunks(
            user_id=user_id,
            subject_id=subject_id,
            source_id=source_id,
            source_version=version,
            chunks=chunks,
            embeddings=embeddings,
        )
        total_words = sum(c.word_count for c in chunks)
        full_content = "\n\n".join(f"--- Page {p[1]} ---\n{p[2]}" for p in pages)
        update_source_status(
            source_id=source_id,
            status="ready",
            page_count=len(pages),
            word_count=total_words,
            raw_content=full_content,
            version=version,
        )


def _stale_processing_minutes() -> int:
    try:
        return max(1, int(os.getenv("STALE_PROCESSING_MINUTES", "10")))
    except ValueError:
        return 10


_PAGE_MARKER = re.compile(r"^--- Page (\d+) ---\n", re.MULTILINE)


def _pages_from_saved_content(raw: str, file_name: str) -> list[tuple[str, int, str]]:
    """Rebuild pages from a source's saved text: either stored page blocks or the original pasted text."""
    parts = _PAGE_MARKER.split(raw)
    if len(parts) >= 3 and not parts[0].strip():
        pages = [
            (file_name, int(parts[i]), parts[i + 1].strip())
            for i in range(1, len(parts) - 1, 2)
            if parts[i + 1].strip()
        ]
        if pages:
            return pages
    return parse_text_source(content=raw, file_name=file_name)


@app.get("/subjects/{subject_id}/sources")
def get_sources_endpoint(
    subject_id: str,
    search: Optional[str] = Query(None),
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    subj = get_subject_by_id(user_id=current_user["id"], subject_id=subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")
    fail_stale_processing_sources(
        user_id=current_user["id"], subject_id=subject_id, max_age_minutes=_stale_processing_minutes()
    )
    return get_sources_for_subject(user_id=current_user["id"], subject_id=subject_id, search=search)


@app.post("/subjects/{subject_id}/sources/upload")
async def upload_source_endpoint(
    subject_id: str,
    file: UploadFile = File(...),
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    subj = get_subject_by_id(user_id=current_user["id"], subject_id=subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")

    existing_sources = get_sources_for_subject(user_id=current_user["id"], subject_id=subject_id)
    if len(existing_sources) >= 15:
        raise HTTPException(
            status_code=400,
            detail="Portfolio deployment limit reached: maximum 15 materials per subject.",
        )

    filename = file.filename or "uploaded_file"
    ext = Path(filename).suffix.lower()

    if ext not in (".pdf", ".txt", ".md", ".markdown"):
        raise HTTPException(
            status_code=400,
            detail="Unsupported format. Only PDF, TXT, and Markdown (.md) files are supported.",
        )

    content = await file.read()
    max_size = MAX_UPLOAD_SIZE_BYTES if ext == ".pdf" else MAX_TEXT_SIZE_BYTES
    if len(content) > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File exceeds maximum allowed size ({limit_mb} MB).")

    file_hash = hashlib.sha256(content).hexdigest()

    # Detect duplicates within subject
    dup = check_duplicate_source(
        user_id=current_user["id"],
        subject_id=subject_id,
        file_name=filename,
        file_hash=file_hash,
    )
    if dup:
        raise HTTPException(
            status_code=409,
            detail=f"A source with this name or content ('{dup['title']}') already exists in this subject.",
        )

    source_type = "pdf" if ext == ".pdf" else "markdown" if ext in (".md", ".markdown") else "txt"

    # Create source in 'processing' state
    src = create_source(
        user_id=current_user["id"],
        subject_id=subject_id,
        title=filename,
        file_name=filename,
        source_type=source_type,
        file_hash=file_hash,
        status="processing",
    )

    try:
        async with _INGEST_SLOT:
            await run_in_threadpool(
                _parse_and_store_upload,
                user_id=current_user["id"],
                subject_id=subject_id,
                source_id=src["id"],
                version=1,
                content=content,
                ext=ext,
                file_name=filename,
            )
        return get_source_by_id(user_id=current_user["id"], source_id=src["id"])
    except Exception as e:
        logger.error(f"Failed to ingest source {filename}: {e}", exc_info=True)
        update_source_status(source_id=src["id"], status="failed", error_message=str(e))
        return get_source_by_id(user_id=current_user["id"], source_id=src["id"])


@app.post("/subjects/{subject_id}/sources/paste")
def paste_source_endpoint(
    subject_id: str,
    payload: SourcePasteRequest,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    subj = get_subject_by_id(user_id=current_user["id"], subject_id=subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")

    existing_sources = get_sources_for_subject(user_id=current_user["id"], subject_id=subject_id)
    if len(existing_sources) >= 15:
        raise HTTPException(
            status_code=400,
            detail="Portfolio deployment limit reached: maximum 15 materials per subject.",
        )

    title = payload.title.strip()
    text = payload.text.strip()
    file_name = f"{title}.txt"
    file_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

    dup = check_duplicate_source(
        user_id=current_user["id"],
        subject_id=subject_id,
        file_name=file_name,
        file_hash=file_hash,
    )
    if dup:
        raise HTTPException(
            status_code=409,
            detail=f"A source with this name or content ('{dup['title']}') already exists in this subject.",
        )

    src = create_source(
        user_id=current_user["id"],
        subject_id=subject_id,
        title=title,
        file_name=file_name,
        source_type="pasted",
        file_hash=file_hash,
        raw_content=text,
        status="processing",
    )

    try:
        pages = parse_text_source(content=text, file_name=title)
        _process_and_store_source(
            user_id=current_user["id"],
            subject_id=subject_id,
            source_id=src["id"],
            version=1,
            pages=pages,
        )
        return get_source_by_id(user_id=current_user["id"], source_id=src["id"])
    except Exception as e:
        logger.error(f"Failed to ingest pasted source {title}: {e}", exc_info=True)
        update_source_status(source_id=src["id"], status="failed", error_message=str(e))
        return get_source_by_id(user_id=current_user["id"], source_id=src["id"])


@app.post("/subjects/{subject_id}/sources/url")
def url_source_endpoint(
    subject_id: str,
    payload: SourceUrlRequest,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    subj = get_subject_by_id(user_id=current_user["id"], subject_id=subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")

    existing_sources = get_sources_for_subject(user_id=current_user["id"], subject_id=subject_id)
    if len(existing_sources) >= 15:
        raise HTTPException(
            status_code=400,
            detail="Portfolio deployment limit reached: maximum 15 materials per subject.",
        )

    raw_url = payload.url.strip()
    placeholder_title = (payload.title or raw_url).strip()

    src = create_source(
        user_id=current_user["id"],
        subject_id=subject_id,
        title=placeholder_title,
        file_name=placeholder_title,
        source_type="url",
        source_url=raw_url,
        status="processing",
    )

    try:
        resolved_title, pages = fetch_and_parse_url(url=raw_url, title=payload.title)
        update_source_title(user_id=current_user["id"], source_id=src["id"], title=resolved_title)
        _process_and_store_source(
            user_id=current_user["id"],
            subject_id=subject_id,
            source_id=src["id"],
            version=1,
            pages=pages,
        )
        return get_source_by_id(user_id=current_user["id"], source_id=src["id"])
    except Exception as e:
        logger.error(f"Failed to fetch webpage source {raw_url}: {e}", exc_info=True)
        failure = str(e) or "Failed to fetch webpage."

    # A link that could not be added leaves nothing behind: no dead row, no slot used.
    delete_source(user_id=current_user["id"], source_id=src["id"])
    raise HTTPException(status_code=400, detail=failure)


@app.get("/subjects/{subject_id}/sources/{source_id}")
def get_source_detail_endpoint(
    subject_id: str,
    source_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    src = get_source_by_id(user_id=current_user["id"], source_id=source_id, include_raw_content=True)
    if not src or src["subject_id"] != subject_id:
        raise HTTPException(status_code=404, detail="Source not found.")

    passages = get_source_passages(user_id=current_user["id"], source_id=source_id)
    src["passages"] = passages
    return src


@app.put("/subjects/{subject_id}/sources/{source_id}")
def rename_source_endpoint(
    subject_id: str,
    source_id: str,
    payload: SourceRenameRequest,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    updated = update_source_title(
        user_id=current_user["id"],
        source_id=source_id,
        title=payload.title,
    )
    if not updated or updated["subject_id"] != subject_id:
        raise HTTPException(status_code=404, detail="Source not found.")
    return updated


@app.delete("/subjects/{subject_id}/sources/{source_id}")
def delete_source_endpoint(
    subject_id: str,
    source_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    deleted = delete_source(user_id=current_user["id"], source_id=source_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Source not found.")
    return {"message": "Source successfully deleted."}


@app.post("/subjects/{subject_id}/sources/{source_id}/retry")
def retry_source_endpoint(
    subject_id: str,
    source_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    fail_stale_processing_sources(
        user_id=current_user["id"], subject_id=subject_id, max_age_minutes=_stale_processing_minutes()
    )
    src = get_source_by_id(user_id=current_user["id"], source_id=source_id, include_raw_content=True)
    if not src or src["subject_id"] != subject_id:
        raise HTTPException(status_code=404, detail="Source not found.")

    # A source whose text was already saved can be processed again without the original file.
    if src["source_type"] != "url" and src["status"] == "failed" and (src.get("raw_content") or "").strip():
        try:
            update_source_status(source_id=source_id, status="processing", error_message=None)
            page_name = src["title"] if src["source_type"] == "pasted" else src["file_name"]
            pages = _pages_from_saved_content(src["raw_content"], page_name)
            _process_and_store_source(
                user_id=current_user["id"],
                subject_id=subject_id,
                source_id=source_id,
                version=src["version"],
                pages=pages,
            )
        except Exception as e:
            update_source_status(source_id=source_id, status="failed", error_message=str(e))
        return get_source_by_id(user_id=current_user["id"], source_id=source_id)

    if src["source_type"] == "url" and src.get("source_url"):
        try:
            update_source_status(source_id=source_id, status="processing", error_message=None)
            resolved_title, pages = fetch_and_parse_url(url=src["source_url"], title=src["title"])
            _process_and_store_source(
                user_id=current_user["id"],
                subject_id=subject_id,
                source_id=source_id,
                version=src["version"] + 1,
                pages=pages,
            )
            return get_source_by_id(user_id=current_user["id"], source_id=source_id)
        except Exception as e:
            update_source_status(source_id=source_id, status="failed", error_message=str(e))
            return get_source_by_id(user_id=current_user["id"], source_id=source_id)

    raise HTTPException(
        status_code=400,
        detail="This source has no saved text to retry from. For uploaded files, use Replace.",
    )


@app.post("/subjects/{subject_id}/sources/{source_id}/replace")
async def replace_source_endpoint(
    subject_id: str,
    source_id: str,
    file: UploadFile = File(...),
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    src = get_source_by_id(user_id=current_user["id"], source_id=source_id)
    if not src or src["subject_id"] != subject_id:
        raise HTTPException(status_code=404, detail="Source not found.")

    filename = file.filename or src["file_name"]
    ext = Path(filename).suffix.lower()
    if ext not in (".pdf", ".txt", ".md", ".markdown"):
        raise HTTPException(status_code=400, detail="Only PDF, TXT, and Markdown files are supported.")

    content = await file.read()
    max_size = MAX_UPLOAD_SIZE_BYTES if ext == ".pdf" else MAX_TEXT_SIZE_BYTES
    if len(content) > max_size:
        limit_mb = max_size // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"File exceeds maximum allowed size ({limit_mb} MB).")

    file_hash = hashlib.sha256(content).hexdigest()

    update_source_status(source_id=source_id, status="processing", error_message=None)

    def replace_locked() -> None:
        # Read the version under the lock so overlapping replacements of the same
        # source can't store one upload's chunks under the other's metadata.
        with _INGEST_LOCK:
            current = get_source_by_id(user_id=current_user["id"], source_id=source_id)
            new_version = current["version"] + 1
            _parse_and_store_upload(
                user_id=current_user["id"],
                subject_id=subject_id,
                source_id=source_id,
                version=new_version,
                content=content,
                ext=ext,
                file_name=filename,
            )
            update_source_status(
                source_id=source_id,
                status="ready",
                file_hash=file_hash,
                version=new_version,
                file_name=filename,
            )

    try:
        async with _INGEST_SLOT:
            await run_in_threadpool(replace_locked)
        return get_source_by_id(user_id=current_user["id"], source_id=source_id)
    except Exception as e:
        logger.error(f"Failed to replace source {source_id}: {e}", exc_info=True)
        update_source_status(source_id=source_id, status="failed", error_message=str(e))
        return get_source_by_id(user_id=current_user["id"], source_id=source_id)


# ============================================================================
# CONVERSATION & MESSAGE ENDPOINTS
# ============================================================================

@app.get("/subjects/{subject_id}/conversations")
def get_conversations_endpoint(
    subject_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    subj = get_subject_by_id(user_id=current_user["id"], subject_id=subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return get_conversations_for_subject(user_id=current_user["id"], subject_id=subject_id)


@app.post("/subjects/{subject_id}/conversations")
def create_conversation_endpoint(
    subject_id: str,
    payload: ConversationCreateRequest,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    subj = get_subject_by_id(user_id=current_user["id"], subject_id=subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")
    title = payload.title.strip() if payload.title else "New Conversation"
    return create_conversation(user_id=current_user["id"], subject_id=subject_id, title=title)


@app.get("/subjects/{subject_id}/conversations/{conversation_id}")
def get_conversation_endpoint(
    subject_id: str,
    conversation_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    conv = get_conversation_by_id(user_id=current_user["id"], conversation_id=conversation_id)
    if not conv or conv["subject_id"] != subject_id:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conv


@app.put("/subjects/{subject_id}/conversations/{conversation_id}")
def rename_conversation_endpoint(
    subject_id: str,
    conversation_id: str,
    payload: ConversationRenameRequest,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    updated = update_conversation_title(
        user_id=current_user["id"],
        conversation_id=conversation_id,
        title=payload.title,
    )
    if not updated or updated["subject_id"] != subject_id:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return updated


@app.delete("/subjects/{subject_id}/conversations/{conversation_id}")
def delete_conversation_endpoint(
    subject_id: str,
    conversation_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    deleted = delete_conversation(user_id=current_user["id"], conversation_id=conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"message": "Conversation successfully deleted."}


@app.get("/subjects/{subject_id}/conversations/{conversation_id}/messages")
def get_messages_endpoint(
    subject_id: str,
    conversation_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    conv = get_conversation_by_id(user_id=current_user["id"], conversation_id=conversation_id)
    if not conv or conv["subject_id"] != subject_id:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return get_messages_for_conversation(user_id=current_user["id"], conversation_id=conversation_id)


@app.post("/subjects/{subject_id}/conversations/{conversation_id}/messages")
def send_message_endpoint(
    subject_id: str,
    conversation_id: str,
    payload: MessageSendRequest,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    subj = get_subject_by_id(user_id=current_user["id"], subject_id=subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")

    conv = get_conversation_by_id(user_id=current_user["id"], conversation_id=conversation_id)
    if not conv or conv["subject_id"] != subject_id:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    check_user_ask_rate_limit(current_user["id"])

    settings = subj.get("settings", {})

    # Auto-rename "New Conversation" on first question
    if not payload.is_retry and conv["title"] == "New Conversation":
        new_title = payload.question.strip()[:40]
        if len(payload.question.strip()) > 40:
            new_title += "..."
        update_conversation_title(
            user_id=current_user["id"],
            conversation_id=conversation_id,
            title=new_title,
        )

    asst_msg = answer_notebook_question(
        question=payload.question,
        conversation_id=conversation_id,
        user_id=current_user["id"],
        subject_id=subject_id,
        selected_source_ids=payload.selected_source_ids,
        settings=settings,
        is_retry=payload.is_retry,
        retry_message_id=payload.retry_message_id,
    )
    return asst_msg


# ============================================================================
# NOTE ENDPOINTS
# ============================================================================

@app.get("/subjects/{subject_id}/notes")
def get_notes_endpoint(
    subject_id: str,
    search: Optional[str] = Query(None),
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    subj = get_subject_by_id(user_id=current_user["id"], subject_id=subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return get_notes_for_subject(user_id=current_user["id"], subject_id=subject_id, search=search)


@app.post("/subjects/{subject_id}/notes")
def create_note_endpoint(
    subject_id: str,
    payload: NoteCreateRequest,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    subj = get_subject_by_id(user_id=current_user["id"], subject_id=subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")

    return create_note(
        user_id=current_user["id"],
        subject_id=subject_id,
        title=payload.title,
        content=payload.content,
        is_saved_answer=payload.is_saved_answer,
        citations=payload.citations,
    )


@app.get("/subjects/{subject_id}/notes/{note_id}")
def get_note_endpoint(
    subject_id: str,
    note_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    note = get_note_by_id(user_id=current_user["id"], note_id=note_id)
    if not note or note["subject_id"] != subject_id:
        raise HTTPException(status_code=404, detail="Note not found.")
    return note


@app.put("/subjects/{subject_id}/notes/{note_id}")
def update_note_endpoint(
    subject_id: str,
    note_id: str,
    payload: NoteUpdateRequest,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    updated = update_note(
        user_id=current_user["id"],
        note_id=note_id,
        title=payload.title,
        content=payload.content,
    )
    if not updated or updated["subject_id"] != subject_id:
        raise HTTPException(status_code=404, detail="Note not found.")
    return updated


@app.delete("/subjects/{subject_id}/notes/{note_id}")
def delete_note_endpoint(
    subject_id: str,
    note_id: str,
    current_user: dict[str, Any] = Depends(get_current_user_or_404),
):
    deleted = delete_note(user_id=current_user["id"], note_id=note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found.")
    return {"message": "Note successfully deleted."}
