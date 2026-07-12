"""
modal_app/_modal_shared.py
===========================
Small helpers shared by the Modal functions.

write_temp_and_run mirrors extraction_resume_JD_score_report/service.py's
_write_temp pattern: pipeline.run_* takes a file PATH, not bytes, so write
once per call to a fresh temp file, always cleaned up in `finally` regardless
of success/failure.

report_crash_to_slack catches container-level failures (import errors, OOM,
timeouts, any uncaught exception) that happen outside the try/excepts already
inside each pipeline -- those are otherwise invisible to Slack. Uses stdlib
urllib instead of aiohttp/requests so it works with no extra dependency in
every Modal image, and posts synchronously since this only ever runs from a
plain `except` block, not async code.
"""
from __future__ import annotations

import json
import os
import tempfile
import traceback
import urllib.request
from pathlib import Path
from typing import Callable, TypeVar

T = TypeVar("T")


def write_temp_and_run(data: bytes, filename: str, fn: Callable[[str], dict]) -> dict:
    suffix = Path(filename).suffix or ".pdf"
    fd, path = tempfile.mkstemp(suffix=suffix)
    with open(fd, "wb") as f:
        f.write(data)
    try:
        return fn(path)
    finally:
        Path(path).unlink(missing_ok=True)


def report_crash_to_slack(function_name: str, error: BaseException, **context: object) -> None:
    """Best-effort Slack alert for a Modal function crash. Never raises."""
    webhook = os.environ.get("SLACK_ERROR_WEBHOOK_URL")
    if not webhook:
        return
    try:
        ctx_lines = "\n".join(f"• *{k}:* {v}" for k, v in context.items())
        text = (
            f"🔥 *MODAL CRASH* — `{function_name}`\n"
            f"```\n{error}\n```\n"
            f"{ctx_lines}\n"
            f"```\n{''.join(traceback.format_exception(error))[-2500:]}\n```"
        )
        payload = json.dumps({"text": f"MODAL CRASH: {function_name}", "blocks": [
            {"type": "section", "text": {"type": "mrkdwn", "text": text[:2900]}},
        ]}).encode()
        req = urllib.request.Request(
            webhook, data=payload, headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        pass  # ponytail: alerting must never mask the original crash
