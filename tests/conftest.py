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
