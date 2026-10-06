import os
from functools import lru_cache
from typing import Sequence
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL_NAME = "all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def get_embedding_model(model_name: str | None = None) -> SentenceTransformer:
    """Load and cache the SentenceTransformer embedding model."""
    name = model_name or os.getenv("EMBEDDING_MODEL_NAME", DEFAULT_MODEL_NAME)
    return SentenceTransformer(name)


def embed_text(text: str, model_name: str | None = None) -> list[float]:
    """Generate an embedding vector for a single string."""
    model = get_embedding_model(model_name)
    embedding = model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def embed_batch(texts: Sequence[str], model_name: str | None = None, batch_size: int = 32) -> list[list[float]]:
    """Generate embedding vectors for a sequence of strings in batches."""
    if not texts:
        return []
    model = get_embedding_model(model_name)
    embeddings = model.encode(list(texts), batch_size=batch_size, convert_to_numpy=True)
    return embeddings.tolist()
