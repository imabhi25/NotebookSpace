from unittest.mock import patch

import httpx
import pytest

from answering.llm import GeminiLLMClient, LLMResponse, LLMServiceError
from answering.notebook_answer import answer_notebook_question


@pytest.mark.parametrize('status, body, category', [
    (402, {'error': {'status': 'RESOURCE_EXHAUSTED', 'message': 'credits depleted'}}, 'quota'),
    (401, {'error': {'status': 'UNAUTHENTICATED', 'message': 'bad key'}}, 'configuration'),
    (503, {'error': {'status': 'UNAVAILABLE', 'message': 'down'}}, 'unavailable'),
])
def test_gemini_classifies_provider_errors(tmp_path, status, body, category):
    client = GeminiLLMClient(api_key='test', cache_dir=tmp_path)
    with patch('httpx.Client.post', return_value=httpx.Response(status, json=body)), patch('time.sleep'):
        with pytest.raises(LLMServiceError) as exc:
            client._raw_generate('system', 'question')
    assert exc.value.category == category


@pytest.mark.parametrize('on_retry', [False, True])
def test_generation_failure_is_safe_and_retryable(monkeypatch, on_retry):
    import answering.notebook_answer as notebook

    monkeypatch.setattr(notebook, 'get_messages_for_conversation', lambda **kwargs: [])
    monkeypatch.setattr(notebook, 'get_sources_for_subject', lambda **kwargs: [{'id': 'source', 'version': 1}])
    monkeypatch.setattr(notebook, 'search_scoped', lambda **kwargs: [{'score': 0.9, 'text': 'Relevant text', 'file': 'test.pdf', 'page': 1}])
    monkeypatch.setattr(notebook, 'save_message', lambda **kwargs: kwargs)

    class Client:
        model = 'test'
        calls = 0

        def generate(self, system, user):
            self.calls += 1
            if on_retry and self.calls == 1:
                return LLMResponse('invalid json', 1, 1, 0.1)
            raise LLMServiceError('quota', 'sensitive provider detail')

    result = answer_notebook_question('A question?', 'conversation', 'user', 'subject', ['source'], llm_client=Client())
    assert result['abstain_reason'] == 'generation_failed'
    assert 'usage or billing limit' in result['content']
    assert 'sensitive provider detail' not in result['content']
