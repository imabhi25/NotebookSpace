import os
import pytest


def pytest_sessionfinish(session, exitstatus):
    """
    CI must fail if database tests (or any tests) are skipped.
    """
    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    if reporter and reporter.stats.get("skipped"):
        skipped_count = len(reporter.stats["skipped"])
        is_ci = os.getenv("CI", "").lower() in ("true", "1") or os.getenv("FAIL_ON_SKIPPED") == "1"
        if is_ci and skipped_count > 0:
            reporter.write_sep("=", f"FAILING CI: {skipped_count} test(s) were skipped", red=True)
            session.exitstatus = 1


@pytest.fixture(autouse=True)
def isolate_test_llm_cache(tmp_path_factory, monkeypatch):
    """Ensure all tests write LLM cache files to a temporary directory rather than .cache/llm."""
    temp_cache = tmp_path_factory.mktemp("test_llm_cache")
    monkeypatch.setenv("LLM_CACHE_DIR", str(temp_cache))
    yield temp_cache



@pytest.fixture(autouse=True)
def no_health_warmup(monkeypatch):
    """/health must not start a model download in a background thread during tests."""
    monkeypatch.setenv("NOTEBOOKSPACE_HEALTH_WARMUP", "0")
