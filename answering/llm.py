from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import time
from typing import Protocol
import httpx
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class LLMResponse:
    text: str
    input_tokens: int
    output_tokens: int
    latency_seconds: float


class LLMClient(Protocol):
    def generate(self, system: str, user: str) -> LLMResponse:
        ...


class BaseCachedLLMClient:
    """Base class providing on-disk response caching keyed by hash of (model, system, user)."""

    def __init__(self, model: str, cache_dir: Path | str | None = None):
        self.model = model
        cache_path = cache_dir or os.getenv("LLM_CACHE_DIR", ".cache/llm")
        self.cache_dir = Path(cache_path)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _get_cache_path(self, system: str, user: str) -> Path:
        key_content = f"{self.model}:{system}:{user}".encode("utf-8")
        cache_key = hashlib.sha256(key_content).hexdigest()
        return self.cache_dir / f"{cache_key}.json"

    def _read_cache(self, system: str, user: str) -> LLMResponse | None:
        path = self._get_cache_path(system, user)
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                return LLMResponse(
                    text=data["text"],
                    input_tokens=data.get("input_tokens", 0),
                    output_tokens=data.get("output_tokens", 0),
                    latency_seconds=data.get("latency_seconds", 0.0),
                )
            except Exception:
                return None
        return None

    def _write_cache(self, system: str, user: str, response: LLMResponse) -> None:
        path = self._get_cache_path(system, user)
        try:
            data = {
                "text": response.text,
                "input_tokens": response.input_tokens,
                "output_tokens": response.output_tokens,
                "latency_seconds": response.latency_seconds,
            }
            path.write_text(json.dumps(data), encoding="utf-8")
        except Exception:
            pass

    def generate(self, system: str, user: str) -> LLMResponse:
        cached = self._read_cache(system, user)
        if cached is not None:
            return cached

        start_time = time.perf_counter()
        raw_text, in_tok, out_tok = self._raw_generate(system, user)
        latency = time.perf_counter() - start_time

        resp = LLMResponse(
            text=raw_text,
            input_tokens=in_tok,
            output_tokens=out_tok,
            latency_seconds=latency,
        )
        self._write_cache(system, user, resp)
        return resp

    def _raw_generate(self, system: str, user: str) -> tuple[str, int, int]:
        raise NotImplementedError


class GeminiLLMClient(BaseCachedLLMClient):
    """Google Gemini client via HTTP using the free-tier API."""

    def __init__(
        self,
        model: str | None = None,
        api_key: str | None = None,
        cache_dir: Path | str | None = None,
    ):
        model_name = model or os.getenv("LLM_MODEL", "gemini-2.5-flash")
        super().__init__(model=model_name, cache_dir=cache_dir)
        self.api_key = api_key or os.getenv("LLM_API_KEY", "")

    def _raw_generate(self, system: str, user: str) -> tuple[str, int, int]:
        if not self.api_key:
            raise ValueError("LLM_API_KEY environment variable is not set for Gemini provider.")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        headers = {"x-goog-api-key": self.api_key}
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": 0.0},
        }

        data = None
        with httpx.Client(timeout=60.0) as client:
            for attempt in range(4):
                resp = client.post(url, json=payload, headers=headers)
                if resp.status_code in (429, 500, 502, 503, 504) and attempt < 3:
                    time.sleep(2 ** (attempt + 1))
                    continue
                if resp.status_code >= 400:
                    # Do not include the request URL or headers in the error.
                    raise RuntimeError(f"LLM request failed with status {resp.status_code}")
                data = resp.json()
                break

        candidates = data.get("candidates", [])
        if not candidates:
            return "", 0, 0

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(part.get("text", "") for part in parts)

        usage = data.get("usageMetadata", {})
        in_tok = usage.get("promptTokenCount", 0)
        out_tok = usage.get("candidatesTokenCount", 0)
        return text, in_tok, out_tok


class FakeLLMClient(BaseCachedLLMClient):
    """Fake LLM client for tests without network calls."""

    def __init__(
        self,
        model: str = "fake-model",
        responses: list[str] | None = None,
        default_response: str = '{"supported": true, "answer": "Test answer", "citations": [{"file": "test.pdf", "page": 1}]}',
        cache_dir: Path | str | None = None,
    ):
        super().__init__(model=model, cache_dir=cache_dir)
        self.responses = list(responses) if responses else []
        self.default_response = default_response
        self.call_count = 0

    def _raw_generate(self, system: str, user: str) -> tuple[str, int, int]:
        self.call_count += 1
        if self.responses:
            text = self.responses.pop(0)
        else:
            text = self.default_response
        in_tok = len((system + user).split())
        out_tok = len(text.split())
        return text, in_tok, out_tok


def get_llm_client(
    provider: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    cache_dir: Path | str | None = None,
) -> BaseCachedLLMClient:
    """Factory to instantiate the configured LLM client."""
    prov = (provider or os.getenv("LLM_PROVIDER", "gemini")).lower()
    mod = model or os.getenv("LLM_MODEL", "gemini-2.5-flash")

    if prov in ("gemini", "google"):
        return GeminiLLMClient(model=mod, api_key=api_key, cache_dir=cache_dir)
    elif prov in ("fake", "mock"):
        return FakeLLMClient(model=mod, cache_dir=cache_dir)
    else:
        raise ValueError(f"Unsupported LLM_PROVIDER: {prov}")
