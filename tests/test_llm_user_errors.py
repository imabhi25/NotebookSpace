from unittest.mock import patch

import httpx
import pytest

from answering.llm import GeminiLLMClient, LLMResponse, LLMServiceError
from answering.notebook_answer import answer_notebook_question


@pytest.mark.parametrize('status, body, category', [
    (402, {'error': {'status': 'RESOURCE_EXHAUSTED', 'message': 'credits depleted'}}, 'quota'),
    (400, {'error': {'status': 'INVALID_ARGUMENT', 'message': 'bad key'}}, 'configuration'),
    (401, {'error': {'status': 'UNAUTHENTICATED', 'message': 'bad key'}}, 'configuration'),
    (403, {'error': {'status': 'PERMISSION_DENIED', 'message': 'bad key'}}, 'configuration'),
    (429, {'error': {'status': 'RESOURCE_EXHAUSTED', 'message': 'quota'}}, 'quota'),
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
    assert result['abstained'] is False
    assert result['content'] == 'The AI service has reached its usage limit for now. Please try again later.'
    assert 'sensitive provider detail' not in result['content']


@pytest.mark.parametrize('status', [400, 401, 402, 403, 429])
def test_nonretryable_errors_do_not_use_fallback(tmp_path, status):
    client = GeminiLLMClient(api_key='test', fallback_models=['fallback'], cache_dir=tmp_path)
    body = {'error': {'status': 'INVALID_ARGUMENT', 'message': 'bad key'}}
    with patch('httpx.Client.post', return_value=httpx.Response(status, json=body)) as post, patch('time.sleep') as sleep:
        with pytest.raises(LLMServiceError):
            client.generate('system', 'question')
    assert post.call_count == 1
    sleep.assert_not_called()


def test_transient_error_never_uses_more_than_two_requests(tmp_path):
    client = GeminiLLMClient(api_key='test', fallback_models=['fallback'], cache_dir=tmp_path)
    with patch('httpx.Client.post', return_value=httpx.Response(503)) as post, patch('time.sleep'):
        with pytest.raises(LLMServiceError):
            client.generate('system', 'question')
    assert post.call_count == 2


def test_question_budget_includes_json_repair(monkeypatch, tmp_path):
    import answering.notebook_answer as notebook
    monkeypatch.setattr(notebook, 'get_messages_for_conversation', lambda **kwargs: [])
    monkeypatch.setattr(notebook, 'get_sources_for_subject', lambda **kwargs: [{'id': 'source', 'version': 1}])
    monkeypatch.setattr(notebook, 'search_scoped', lambda **kwargs: [{'score': 0.9, 'text': 'Relevant text', 'file': 'test.pdf', 'page': 1}])
    monkeypatch.setattr(notebook, 'save_message', lambda **kwargs: kwargs)
    llm = GeminiLLMClient(api_key='test', cache_dir=tmp_path)
    bad_json = httpx.Response(200, json={'candidates': [{'content': {'parts': [{'text': 'invalid json'}]}}]})
    with patch('httpx.Client.post', side_effect=[httpx.Response(503), bad_json]) as post, patch('time.sleep'):
        result = answer_notebook_question('A question?', 'conversation', 'user', 'subject', ['source'], llm_client=llm)
    assert post.call_count == 2
    assert result['abstain_reason'] == 'generation_failed'
    assert result['abstained'] is False


def test_retry_deletion_failure_is_not_silently_ignored(monkeypatch):
    import db.notebook_store as store
    monkeypatch.setattr(store, 'delete_message', lambda **kwargs: (_ for _ in ()).throw(RuntimeError('database unavailable')))
    with pytest.raises(RuntimeError, match='database unavailable'):
        answer_notebook_question('A question?', 'conversation', 'user', 'subject', ['source'], is_retry=True, retry_message_id='message')
