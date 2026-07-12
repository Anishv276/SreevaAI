"""
modal_app/_modal_shared.py
===========================
Small helper shared by the Modal functions, mirroring
extraction_resume_JD_score_report/service.py's _write_temp pattern: pipeline.run_*
takes a file PATH, not bytes, so write once per call to a fresh temp file, always
cleaned up in `finally` regardless of success/failure.
"""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Callable


def write_temp_and_run(data: bytes, filename: str, fn: Callable[[str], dict]) -> dict:
    suffix = Path(filename).suffix or ".pdf"
    fd, path = tempfile.mkstemp(suffix=suffix)
    with open(fd, "wb") as f:
        f.write(data)
    try:
        return fn(path)
    finally:
        Path(path).unlink(missing_ok=True)
