from pathlib import Path
import pytest
from answering.llm import FakeLLMClient, GeminiLLMClient, LLMResponse, get_llm_client


def test_fake_llm_generate(tmp_path: Path):
    client = FakeLLMClient(
        model="fake-1",
        default_response='{"supported": true, "answer": "Hello", "citations": []}',
        cache_dir=tmp_path / "cache",
    )
    resp = client.generate(system="system prompt", user="user prompt")
    assert isinstance(resp, LLMResponse)
    assert resp.text == '{"supported": true, "answer": "Hello", "citations": []}'
    assert resp.input_tokens > 0
    assert resp.output_tokens > 0
    assert resp.latency_seconds >= 0.0
    assert client.call_count == 1


def test_on_disk_cache_hit(tmp_path: Path):
    cache_dir = tmp_path / "cache"
    client = FakeLLMClient(
        model="fake-cache-model",
        responses=["First response", "Second response"],
        cache_dir=cache_dir,
    )

    # First call - cache miss
    resp1 = client.generate(system="sys", user="usr")
    assert resp1.text == "First response"
    assert client.call_count == 1

    # Second call with identical system and user - cache hit
    resp2 = client.generate(system="sys", user="usr")
    assert resp2.text == "First response"
    assert client.call_count == 1  # Not incremented because cache was used

    # Third call with different user - cache miss
    resp3 = client.generate(system="sys", user="different usr")
    assert resp3.text == "Second response"
    assert client.call_count == 2


def test_get_llm_client_factory(tmp_path: Path):
    client = get_llm_client(provider="fake", model="test-mod", cache_dir=tmp_path)
    assert isinstance(client, FakeLLMClient)
    assert client.model == "test-mod"

    with pytest.raises(ValueError, match="Unsupported LLM_PROVIDER"):
        get_llm_client(provider="unknown_provider")


def test_gemini_client_defaults(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("LLM_MODEL", raising=False)
    client = get_llm_client(provider="gemini", api_key="dummy_key", cache_dir=tmp_path)
    assert isinstance(client, GeminiLLMClient)
    assert client.model == "gemini-3.5-flash"
    assert client.api_key == "dummy_key"


def test_parse_retry_delay():
    from answering.llm import parse_retry_delay
    import httpx

    # Header parsing
    resp_header = httpx.Response(429, headers={"retry-after": "45"})
    delay, status = parse_retry_delay(resp_header)
    assert delay == 45.0
    assert status is None

    # Body parsing with hours, minutes, seconds
    err_body = {
        "error": {
            "code": 429,
            "message": "Quota exceeded. Please retry in 3h17m45.5s.",
            "status": "RESOURCE_EXHAUSTED",
        }
    }
    resp_body = httpx.Response(429, json=err_body)
    delay, status = parse_retry_delay(resp_body)
    assert delay is not None
    # 3*3600 + 17*60 + 45.5 = 10800 + 1020 + 45.5 = 11865.5
    assert abs(delay - 11865.5) < 0.1
    assert status == "RESOURCE_EXHAUSTED"


def test_gemini_quota_exhausted_exits_immediately(tmp_path: Path, monkeypatch):
    from unittest.mock import MagicMock, patch
    import httpx

    client = GeminiLLMClient(api_key="test_key", cache_dir=tmp_path)

    err_body = {
        "error": {
            "code": 429,
            "message": "Quota exceeded. Please retry in 3h17m45s.",
            "status": "RESOURCE_EXHAUSTED",
        }
    }
    mock_resp = httpx.Response(429, json=err_body)

    with patch("httpx.Client.post", return_value=mock_resp) as mock_post:
        with patch("time.sleep") as mock_sleep:
            with pytest.raises(RuntimeError) as exc_info:
                client._raw_generate(system="sys", user="usr")

            assert "LLM quota exhausted" in str(exc_info.value)
            assert "Retry after" in str(exc_info.value)
            assert "estimated reset:" in str(exc_info.value)
            # Must exit immediately on attempt 0: no sleep, only 1 post call
            assert mock_post.call_count == 1
            assert mock_sleep.call_count == 0


def test_gemini_short_transient_retry_bounded(tmp_path: Path):
    from unittest.mock import patch
    import httpx

    client = GeminiLLMClient(api_key="test_key", cache_dir=tmp_path)

    resp_429 = httpx.Response(429, headers={"retry-after": "5"})
    resp_200 = httpx.Response(
        200,
        json={
            "candidates": [{"content": {"parts": [{"text": "Hello world"}]}}],
            "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 2},
        },
    )

    with patch("httpx.Client.post", side_effect=[resp_429, resp_200]) as mock_post:
        with patch("time.sleep") as mock_sleep:
            text, in_tok, out_tok = client._raw_generate(system="sys", user="usr")
            assert text == "Hello world"
            assert in_tok == 10
            assert out_tok == 2
            assert mock_post.call_count == 2
            mock_sleep.assert_called_once_with(5.0)


def test_gemini_503_backoff_retry_bounded(tmp_path: Path):
    from unittest.mock import patch
    import httpx

    client = GeminiLLMClient(model="gemini-3.5-flash-lite", api_key="test_key", cache_dir=tmp_path)

    resp_503 = httpx.Response(503)
    resp_200 = httpx.Response(
        200,
        json={
            "candidates": [{"content": {"parts": [{"text": "Recovered"}]}}],
            "usageMetadata": {"promptTokenCount": 8, "candidatesTokenCount": 1},
        },
    )

    with patch("httpx.Client.post", side_effect=[resp_503, resp_200]) as mock_post:
        with patch("time.sleep") as mock_sleep:
            text, in_tok, out_tok = client._raw_generate(system="sys", user="usr")
            assert text == "Recovered"
            assert mock_post.call_count == 2
            mock_sleep.assert_called_once_with(2.0)

