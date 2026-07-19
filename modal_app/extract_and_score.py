"""
modal_app/extract_and_score.py
================================
Modal deployment of the resume/JD extraction + scoring pipeline
(extraction_resume_JD_score_report/pipeline.py's Pipeline class), unchanged logic,
just invoked as a cloud function instead of via the local FastAPI service
(extraction_resume_JD_score_report/service.py) or CLI (scripts/extract_pdf.py).

Deploy:   modal deploy modal_app/extract_and_score.py
Test run: modal run modal_app/extract_and_score.py::test_resume --file-path <path> --model gpt-4.1
"""
from __future__ import annotations

import modal

app = modal.App("sreevaai-extract-and-score")

# Mirrors livekit-python-agent/requirements.txt's extraction-relevant deps —
# NOT the LiveKit agent deps (livekit-agents, plugins, etc.), which this
# pipeline never imports.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "openai>=2.37.0",
        "pdfplumber>=0.11.9",
        "pypdf>=5.0.0",
        "pydantic>=2.0.0",
        "python-dotenv>=1.2.2",
        "fastapi>=0.115.0",
        "python-multipart>=0.0.12",
    )
    .add_local_dir(
        "extraction_resume_JD_score_report",
        remote_path="/root/extraction_resume_JD_score_report",
    )
    .add_local_file("modal_app/_modal_shared.py", remote_path="/root/_modal_shared.py")
    # parser.py's _llm() imports billing.billing.extract_usage for token accounting —
    # bundle just that module + its two lightweight transitive deps (confirmed no
    # livekit-agents/DB-at-import-time dependency in this chain).
    .add_local_file(
        "livekit-python-agent/billing/billing.py",
        remote_path="/root/billing/billing.py",
    )
    .add_local_file(
        "livekit-python-agent/billing/__init__.py",
        remote_path="/root/billing/__init__.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/agent_runtime_support.py",
        remote_path="/root/interview/agent_runtime_support.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/agent_runtime_utils.py",
        remote_path="/root/interview/agent_runtime_utils.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/agent_utils.py",
        remote_path="/root/interview/agent_utils.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/__init__.py",
        remote_path="/root/interview/__init__.py",
    )
)

secrets = [
    modal.Secret.from_name("sreevaai-openai"),
    modal.Secret.from_name("sreevaai-extract-api-key"),
    modal.Secret.from_name("sreevaai-slack"),
]


def _check_api_key(x_api_key: str | None) -> None:
    import hmac
    import os
    expected = os.environ.get("EXTRACT_SERVICE_API_KEY", "")
    if not expected or not x_api_key or not hmac.compare_digest(x_api_key, expected):
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="invalid or missing API key")


# ponytail: workspace ceiling is 100 concurrent containers TOTAL across all 5
# functions (Modal workspace limit, not per-function). Caps sum to 100 so no one
# function starves the others: resume+score 55, resume 20, jd 5, brief 15, report 5.
@app.function(image=image, secrets=secrets, timeout=180, max_containers=20)
def extract_resume(file_bytes: bytes, file_name: str, model: str) -> dict:
    """Mirrors service.py's /extract/resume — extraction only, no scoring."""
    import sys
    sys.path.insert(0, "/root")
    from extraction_resume_JD_score_report.pipeline import Pipeline
    from _modal_shared import write_temp_and_run, report_crash_to_slack

    print(f"[MODAL] extract_resume started file={file_name} model={model}")
    try:
        result = write_temp_and_run(file_bytes, file_name, lambda path: Pipeline().run_resume(path, model))
    except Exception as e:
        report_crash_to_slack("extract_resume", e, file=file_name, model=model)
        raise
    print(f"[MODAL] extract_resume done file={file_name} error={result.get('error')}")
    return result


@app.function(image=image, secrets=secrets, timeout=120, max_containers=5)
def extract_jd(file_bytes: bytes, file_name: str, model: str) -> dict:
    """Mirrors service.py's /extract/jd."""
    import sys
    sys.path.insert(0, "/root")
    from extraction_resume_JD_score_report.pipeline import Pipeline
    from _modal_shared import write_temp_and_run, report_crash_to_slack

    print(f"[MODAL] extract_jd started file={file_name} model={model}")
    try:
        result = write_temp_and_run(file_bytes, file_name, lambda path: Pipeline().run_jd(path, model))
    except Exception as e:
        report_crash_to_slack("extract_jd", e, file=file_name, model=model)
        raise
    print(f"[MODAL] extract_jd done file={file_name} error={result.get('error')}")
    return result


@app.function(image=image, secrets=secrets, timeout=180, max_containers=55)
def extract_resume_and_score(
    file_bytes: bytes,
    file_name: str,
    jd_payload: dict,
    extract_model: str,
    score_model: str,
) -> dict:
    """Mirrors service.py's /extract/resume-and-score — full pipeline."""
    import sys
    sys.path.insert(0, "/root")
    from extraction_resume_JD_score_report.pipeline import Pipeline
    from _modal_shared import write_temp_and_run, report_crash_to_slack

    print(f"[MODAL] extract_resume_and_score started file={file_name} extract_model={extract_model} score_model={score_model}")
    try:
        result = write_temp_and_run(
            file_bytes,
            file_name,
            lambda path: Pipeline().run_resume_and_score(path, jd_payload, extract_model, score_model),
        )
    except Exception as e:
        report_crash_to_slack("extract_resume_and_score", e, file=file_name, extract_model=extract_model, score_model=score_model)
        raise
    print(f"[MODAL] extract_resume_and_score done file={file_name} error={result.get('error')}")
    return result


import json as _json
from fastapi import UploadFile, Form, Header, File

# ---------------------------------------------------------------------------
# Web endpoints — HTTPS URLs Node's Next.js API routes call via fetch(), same
# multipart/form-data + x-api-key header shape as today's calls to
# extraction_resume_JD_score_report/service.py, to minimize the route-side diff.
# fastapi_endpoint() wraps the function directly in a FastAPI route, so plain
# FastAPI parameter types (UploadFile/Form/Header) work exactly as they would
# in a normal FastAPI app -- no extra wrapping needed.
# ---------------------------------------------------------------------------
@app.function(image=image, secrets=secrets, timeout=600)
@modal.fastapi_endpoint(method="POST", docs=True)
async def extract_resume_endpoint(
    file: UploadFile = File(...),
    model: str = Form(...),
    x_api_key: str | None = Header(default=None),
):
    _check_api_key(x_api_key)
    data = await file.read()
    return await extract_resume.remote.aio(data, file.filename or "resume.pdf", model)


@app.function(image=image, secrets=secrets, timeout=600)
@modal.fastapi_endpoint(method="POST", docs=True)
async def extract_jd_endpoint(
    file: UploadFile = File(...),
    model: str = Form(...),
    x_api_key: str | None = Header(default=None),
):
    _check_api_key(x_api_key)
    data = await file.read()
    return await extract_jd.remote.aio(data, file.filename or "jd.pdf", model)


@app.function(image=image, secrets=secrets, timeout=600)
@modal.fastapi_endpoint(method="POST", docs=True)
async def extract_resume_and_score_endpoint(
    file: UploadFile = File(...),
    extract_model: str = Form(...),
    score_model: str = Form(...),
    jd_payload: str = Form(...),
    x_api_key: str | None = Header(default=None),
):
    _check_api_key(x_api_key)
    data = await file.read()
    jd = _json.loads(jd_payload)
    return await extract_resume_and_score.remote.aio(data, file.filename or "resume.pdf", jd, extract_model, score_model)


# ---------------------------------------------------------------------------
# Local test entrypoints — run with `modal run modal_app/extract_and_score.py::test_resume ...`
# so we can verify against real files before wiring up any Node route.
# ---------------------------------------------------------------------------
@app.local_entrypoint()
def test_resume(file_path: str, model: str = "gpt-4.1"):
    with open(file_path, "rb") as f:
        data = f.read()
    result = extract_resume.remote(data, file_path.split("/")[-1].split("\\")[-1], model)
    import json
    print(json.dumps(result, indent=2)[:3000])


@app.local_entrypoint()
def test_jd(file_path: str, model: str = "gpt-4.1"):
    with open(file_path, "rb") as f:
        data = f.read()
    result = extract_jd.remote(data, file_path.split("/")[-1].split("\\")[-1], model)
    import json
    print(json.dumps(result, indent=2)[:3000])


@app.local_entrypoint()
def test_full_pipeline(resume_path: str, jd_path: str, model: str = "gpt-4.1"):
    """Mirrors worker.ts's processResumeScreeningJob: extract JD -> extract+score resume
    against it -- the exact real-world flow a candidate upload triggers today."""
    import json

    with open(jd_path, "rb") as f:
        jd_bytes = f.read()
    jd_name = jd_path.split("/")[-1].split("\\")[-1]
    print(f"--- Step 1: extracting JD ({jd_name}) ---")
    jd_result = extract_jd.remote(jd_bytes, jd_name, model)
    if jd_result.get("error"):
        print("JD extraction failed:", jd_result["error"])
        return
    jd_data = jd_result["data"]
    print(f"JD extracted: job_title={jd_data.get('job_title')} criteria={len(jd_data.get('criteria', []))}")

    with open(resume_path, "rb") as f:
        resume_bytes = f.read()
    resume_name = resume_path.split("/")[-1].split("\\")[-1]
    jd_payload = {
        "jd": jd_data,
        "jd_raw_text": jd_result.get("text", ""),
        "threshold": 60,
        "screening_criteria": {},
    }
    print(f"--- Step 2: extracting + scoring resume ({resume_name}) against JD ---")
    result = extract_resume_and_score.remote(resume_bytes, resume_name, jd_payload, model, model)
    if result.get("error"):
        print("Resume scoring failed:", result["error"])
        return

    score = result.get("score", {})
    print("\n=== SCORE RESULT ===")
    print(f"score: {score.get('score')}  status: {score.get('status')}")
    print(f"exp_status: {score.get('exp_status')}  hard_rejected: {score.get('hard_rejected')}")
    print(f"candidate_years: {score.get('candidate_years')}  jd_min_years: {score.get('jd_min_years')}")
    print("recruiter_snapshot / decision_reason present:", bool(score.get("recruiter_snapshot") or score.get("decision_reason")))
    print("\nusage_extract:", result.get("usage_extract"))
    print("usage_score:", result.get("usage_score"))
    print("\nfull score JSON (truncated):")
    print(json.dumps(score, indent=2)[:4000])
