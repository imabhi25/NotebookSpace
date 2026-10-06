from pathlib import Path
import pytest
from answering.llm import FakeLLMClient, LLMResponse, get_llm_client


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
