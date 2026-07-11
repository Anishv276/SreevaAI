"""
service.py -- Persistent FastAPI microservice replacing per-job `spawn(python, extract_pdf.py)`.

Run with: uvicorn extraction_resume_JD_score_report.service:app --host 0.0.0.0 --port 8100

Keeps the process (and its imports: openai, pdfplumber, pypdf) warm across
requests instead of paying interpreter boot + reimport cost per resume.
Same extraction/scoring logic as pipeline.py -- Pipeline class is reused as-is.
"""
from __future__ import annotations

import asyncio
import json
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.concurrency import run_in_threadpool

from extraction_resume_JD_score_report.pipeline import Pipeline

app = FastAPI()
pipeline = Pipeline()

REQUEST_TIMEOUT_S = 180


def _write_temp(data: bytes, filename: str) -> str:
    # pipeline._extract_text() takes a file path, not bytes -- write once per
    # request to a fresh temp file (deleted in `finally`, never swept by a janitor).
    suffix = Path(filename).suffix or ".pdf"
    fd, path = tempfile.mkstemp(suffix=suffix)
    with open(fd, "wb") as f:
        f.write(data)
    return path


@app.post("/extract/resume")
async def extract_resume(file: UploadFile = File(...), model: str = Form(...)):
    data = await file.read()
    path = await run_in_threadpool(_write_temp, data, file.filename or "resume.pdf")
    try:
        result = await asyncio.wait_for(
            run_in_threadpool(pipeline.run_resume, path, model),
            timeout=REQUEST_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="extraction timed out")
    finally:
        Path(path).unlink(missing_ok=True)
    if result.get("error"):
        raise HTTPException(status_code=422, detail=result)
    return result


@app.post("/extract/jd")
async def extract_jd(file: UploadFile = File(...), model: str = Form(...)):
    data = await file.read()
    path = await run_in_threadpool(_write_temp, data, file.filename or "jd.pdf")
    try:
        result = await asyncio.wait_for(
            run_in_threadpool(pipeline.run_jd, path, model),
            timeout=REQUEST_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="extraction timed out")
    finally:
        Path(path).unlink(missing_ok=True)
    if result.get("error"):
        raise HTTPException(status_code=422, detail=result)
    return result


@app.post("/extract/resume-and-score")
async def extract_resume_and_score(
    file: UploadFile = File(...),
    extract_model: str = Form(...),
    score_model: str = Form(...),
    jd_payload: str = Form(...),  # JSON string: {jd, jd_raw_text, threshold, screening_criteria}
):
    data = await file.read()
    path = await run_in_threadpool(_write_temp, data, file.filename or "resume.pdf")
    try:
        jd = json.loads(jd_payload)
        result = await asyncio.wait_for(
            run_in_threadpool(pipeline.run_resume_and_score, path, jd, extract_model, score_model),
            timeout=REQUEST_TIMEOUT_S,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="extraction timed out")
    finally:
        Path(path).unlink(missing_ok=True)
    if result.get("error"):
        raise HTTPException(status_code=422, detail=result)
    return result


@app.get("/health")
async def health():
    return {"status": "ok"}
