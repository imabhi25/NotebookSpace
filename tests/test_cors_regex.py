import importlib

from fastapi.testclient import TestClient

PREVIEW = "https://notebookspace-abc123xyz-sabhaypartap18-4175s-projects.vercel.app"
PATTERN = r"https://notebookspace-[a-z0-9-]+-sabhaypartap18-4175s-projects\.vercel\.app"


def _client(monkeypatch, regex):
    if regex is None:
        monkeypatch.delenv("ALLOWED_ORIGIN_REGEX", raising=False)
    else:
        monkeypatch.setenv("ALLOWED_ORIGIN_REGEX", regex)
    import api.main as main_module

    return TestClient(importlib.reload(main_module).app)


def test_preview_origin_allowed_by_pattern(monkeypatch):
    client = _client(monkeypatch, PATTERN)
    resp = client.options(
        "/health", headers={"Origin": PREVIEW, "Access-Control-Request-Method": "GET"}
    )
    assert resp.headers.get("access-control-allow-origin") == PREVIEW


def test_unknown_origin_refused(monkeypatch):
    client = _client(monkeypatch, PATTERN)
    resp = client.options(
        "/health", headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "GET"}
    )
    assert resp.headers.get("access-control-allow-origin") is None


def test_no_pattern_keeps_old_behaviour(monkeypatch):
    client = _client(monkeypatch, None)
    resp = client.options(
        "/health", headers={"Origin": PREVIEW, "Access-Control-Request-Method": "GET"}
    )
    assert resp.headers.get("access-control-allow-origin") is None
