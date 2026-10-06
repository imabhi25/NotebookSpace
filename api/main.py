from typing import List
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from db.retrieval import search
from ingestion.pipeline import ingest_pdf

app = FastAPI(
    title="Course-Document Assistant",
    description="Vector search retrieval service for course documents.",
    version="1.0.0",
)


class SearchRequest(BaseModel):
    question: str = Field(..., description="Query string to search for")
    k: int = Field(default=5, ge=1, le=50, description="Number of results to retrieve")


class SearchResultItem(BaseModel):
    file_name: str
    page_number: int
    text: str
    score: float
    chunk_index: int | None = None


class SearchResponse(BaseModel):
    query: str
    k: int
    results: List[SearchResultItem]


class UploadResponse(BaseModel):
    file_name: str
    chunks_stored: int
    message: str


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/search", response_model=SearchResponse)
def search_endpoint(payload: SearchRequest):
    """
    Search stored course document chunks by vector similarity.
    """
    results = search(question=payload.question, k=payload.k)
    formatted = [
        SearchResultItem(
            file_name=r["file_name"],
            page_number=r["page_number"],
            text=r["text"],
            score=r["score"],
            chunk_index=r.get("chunk_index"),
        )
        for r in results
    ]
    return SearchResponse(
        query=payload.question,
        k=payload.k,
        results=formatted,
    )


@app.post("/upload", response_model=UploadResponse)
async def upload_endpoint(file: UploadFile = File(...)):
    """
    Upload and ingest a course PDF document.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        content = await file.read()
        import io

        stream = io.BytesIO(content)
        chunk_count = ingest_pdf(source=stream, file_name=file.filename)
        return UploadResponse(
            file_name=file.filename,
            chunks_stored=chunk_count,
            message=f"Successfully ingested {chunk_count} chunk(s).",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")
