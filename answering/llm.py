from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import time
from typing import Protocol
import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


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


def parse_retry_delay(resp: httpx.Response) -> tuple[float | None, str | None]:
    """
    Parse retry delay in seconds and error status from response headers or body.

    Returns:
        (delay_seconds, error_status)
    """
    # 1. Inspect Retry-After header
    retry_header = resp.headers.get("retry-after")
    if retry_header:
        try:
            return float(retry_header), None
        except ValueError:
            pass

    # 2. Inspect JSON body error details
    try:
        data = resp.json()
        error = data.get("error", {})
        status = error.get("status")
        message = error.get("message", "")

        # Look for duration patterns such as "Please retry in 3h17m45.6s" or "retry in 15s"
        m = re.search(r"retry in\s+([0-9hms\.]+)", message, re.IGNORECASE)
        if m:
            dur_str = m.group(1)
            total_sec = 0.0
            h = re.search(r"(\d+)h", dur_str)
            if h:
                total_sec += float(h.group(1)) * 3600.0
            m_min = re.search(r"(\d+)m", dur_str)
            if m_min:
                total_sec += float(m_min.group(1)) * 60.0
            s = re.search(r"([\d\.]+)s", dur_str)
            if s:
                total_sec += float(s.group(1))
            if total_sec > 0:
                return total_sec, status

        return None, status
    except Exception:
        return None, None


class GeminiLLMClient(BaseCachedLLMClient):
    """Google Gemini client via HTTP using the free-tier API."""

    def __init__(
        self,
        model: str | None = None,
        fallback_models: list[str] | None = None,
        api_key: str | None = None,
        cache_dir: Path | str | None = None,
    ):
        model_name = model or os.getenv("LLM_MODEL", "gemini-3.5-flash-lite")
        super().__init__(model=model_name, cache_dir=cache_dir)
        self.fallback_models = fallback_models
        self.api_key = api_key or os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY") or ""

    def _raw_generate(self, system: str, user: str) -> tuple[str, int, int]:
        if not self.api_key:
            raise ValueError("LLM_API_KEY or GEMINI_API_KEY environment variable is not set for Gemini provider.")

        models_to_try = [self.model]
        if self.fallback_models is not None:
            for fb in self.fallback_models:
                if fb not in models_to_try:
                    models_to_try.append(fb)

        headers = {"x-goog-api-key": self.api_key}
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": 0.0},
        }

        def _sanitize_message(raw_msg: str) -> str:
            if not raw_msg:
                return "Unknown error"
            # Strip potential API keys or token substrings
            sanitized = re.sub(r'(?:AIza|AQ\.)[A-Za-z0-9_-]{15,}', '[REDACTED_KEY]', str(raw_msg))
            sanitized = re.sub(r'key=[A-Za-z0-9_-]+', 'key=[REDACTED]', sanitized)
            return sanitized.strip()

        data = None
        last_sanitized_err = ""
        with httpx.Client(timeout=60.0) as client:
            for current_model in models_to_try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{current_model}:generateContent"
                for attempt in range(3):
                    resp = client.post(url, json=payload, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        break

                    delay_sec, err_status = parse_retry_delay(resp)
                    err_msg = ""
                    try:
                        err_json = resp.json()
                        if isinstance(err_json, dict) and "error" in err_json:
                            err_msg = err_json["error"].get("message", "")
                    except Exception:
                        err_msg = resp.text[:200]
                    last_sanitized_err = _sanitize_message(err_msg)
                    logger.error(
                        "Gemini API error [model=%s, status=%s, code=%s]: %s",
                        current_model,
                        resp.status_code,
                        err_status or "NONE",
                        last_sanitized_err,
                    )

                    # For exhausted quota requiring a long wait (> 60s), fall back to next model if available, else exit immediately
                    if resp.status_code == 429 and (err_status == "RESOURCE_EXHAUSTED" or (delay_sec is not None and delay_sec > 60.0)):
                        if current_model != models_to_try[-1]:
                            logger.warning(
                                "Gemini quota exhausted on %s. Trying fallback model.",
                                current_model,
                            )
                            break
                        if delay_sec is not None and delay_sec > 60.0:
                            reset_dt = datetime.now(timezone.utc) + timedelta(seconds=delay_sec)
                            reset_iso = reset_dt.isoformat()
                            raise RuntimeError(
                                f"LLM quota exhausted (status 429 {err_status or ''}). "
                                f"Retry after {delay_sec:.1f}s (estimated reset: {reset_iso})."
                            )
                        elif err_status == "RESOURCE_EXHAUSTED":
                            raise RuntimeError(
                                f"LLM quota exhausted (status 429 {err_status}). "
                                "Quota window exceeded. Please wait for provider quota reset."
                            )

                    # If model is not found (404) and we have a fallback model, break to next model
                    if resp.status_code == 404 and current_model != models_to_try[-1]:
                        break

                    # Short transient failures: bounded retries up to 3 times (attempts 0, 1)
                    if resp.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                        if delay_sec is not None and 0.0 < delay_sec <= 60.0:
                            sleep_time = delay_sec
                        else:
                            sleep_time = float(2 ** (attempt + 1))
                        time.sleep(sleep_time)
                        continue

                    if resp.status_code >= 400 and current_model == models_to_try[-1]:
                        status_detail = f" {err_status}" if err_status else ""
                        detail_msg = f": {last_sanitized_err}" if last_sanitized_err else ""
                        raise RuntimeError(f"LLM request failed with status {resp.status_code}{status_detail}{detail_msg}")

                if data is not None:
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
    mod = model or os.getenv("LLM_MODEL", "gemini-3.5-flash")

    if prov in ("gemini", "google"):
        fallback = ["gemini-3.5-flash-lite"] if mod != "gemini-3.5-flash-lite" else ["gemini-3.5-flash"]
        return GeminiLLMClient(model=mod, fallback_models=fallback, api_key=api_key, cache_dir=cache_dir)
    elif prov in ("fake", "mock"):
        return FakeLLMClient(model=mod, cache_dir=cache_dir)
    else:
        raise ValueError(f"Unsupported LLM_PROVIDER: {prov}")
