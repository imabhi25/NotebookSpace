from collections import defaultdict
import io
import logging
import os
import time
from typing import Any, List
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from answering.answer import answer_question
from db.retrieval import search
from db.store import get_all_documents, get_passages_for_page
from ingestion.pipeline import ingest_pdf

logger = logging.getLogger("course_assistant.api")

app = FastAPI(
    title="Course-Document Assistant",
    description="Vector search retrieval and answering service for course documents.",
    version="2.0.0",
)

allowed_origins = ["http://localhost:5173"]
env_origins = os.getenv("ALLOWED_ORIGINS", "")
if env_origins:
    for orig in env_origins.split(","):
        cleaned = orig.strip()
        if cleaned and cleaned not in allowed_origins:
            allowed_origins.append(cleaned)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

# Demo mode in-memory rate limiter tracking timestamps per IP
ask_rate_limit_history: dict[str, list[float]] = defaultdict(list)


def is_demo_mode() -> bool:
    return os.getenv("DEMO_MODE", "false").lower() in ("true", "1", "yes")


def get_demo_ask_limit() -> int:
    try:
        return int(os.getenv("DEMO_ASK_PER_MINUTE", "10"))
    except ValueError:
        return 10


def check_ask_rate_limit(client_ip: str) -> None:
    if not is_demo_mode():
        return
    limit = get_demo_ask_limit()
    now = time.time()
    window = 60.0
    timestamps = [ts for ts in ask_rate_limit_history[client_ip] if now - ts < window]
    if len(timestamps) >= limit:
        ask_rate_limit_history[client_ip] = timestamps
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Demo allows up to {limit} questions per minute.",
        )
    timestamps.append(now)
    ask_rate_limit_history[client_ip] = timestamps


def reset_rate_limits() -> None:
    """Helper for testing to clear in-memory rate limit counts."""
    ask_rate_limit_history.clear()


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


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/documents", response_model=List[DocumentItem])
def get_documents_endpoint():
    """List stored documents, their upload dates, and chunk counts."""
    return get_all_documents()


@app.get("/passages", response_model=List[PassageItem])
def get_passages_endpoint(
    file: str = Query(..., description="Document file name"),
    page: int = Query(..., ge=1, description="Page number"),
):
    """Return chunks for a given file and page number."""
    return get_passages_for_page(file_name=file, page_number=page)


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
    # The last entry is the one our hosting proxy appended; earlier entries can be
    # forged by the caller, so they must not be used for rate limiting.
    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[-1].strip()
        or (request.client.host if request.client else "127.0.0.1")
    )
    check_ask_rate_limit(client_ip)
    result = answer_question(question=payload.question, k=payload.k)
    return AskResponse(**result)


@app.post("/upload", response_model=UploadResponse)
async def upload_endpoint(file: UploadFile = File(...)):
    """Upload and ingest a course PDF document (capped at 10 MB)."""
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
            raise HTTPException(
                status_code=413,
                detail="File size exceeds the 10 MB limit.",
            )

        stream = io.BytesIO(content)
        chunk_count = ingest_pdf(source=stream, file_name=file.filename)
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
