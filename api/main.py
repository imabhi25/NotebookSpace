import io
import logging
from typing import Any, List
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from answering.answer import answer_question
from db.retrieval import search
from ingestion.pipeline import ingest_pdf

logger = logging.getLogger("course_assistant.api")

app = FastAPI(
    title="Course-Document Assistant",
    description="Vector search retrieval and answering service for course documents.",
    version="2.0.0",
)

MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


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


class UploadResponse(BaseModel):
    file_name: str
    chunks_stored: int
    message: str


@app.get("/health")
def health_check():
    return {"status": "ok"}


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
def ask_endpoint(payload: AskRequest):
    """Answer a question using retrieved passages, citations, and support checks."""
    result = answer_question(question=payload.question, k=payload.k)
    return AskResponse(**result)


@app.post("/upload", response_model=UploadResponse)
async def upload_endpoint(file: UploadFile = File(...)):
    """Upload and ingest a course PDF document (capped at 10 MB)."""
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
