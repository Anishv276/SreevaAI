"""
modal_app/generate_report.py
==============================
Modal deployment of the post-interview report/summary/billing/debug-PDF tail
(livekit-python-agent/interview/report_worker.py's _run()), unchanged logic, just
invoked as a cloud function instead of a Node child_process.spawn() piped via stdin.

Highest-stakes of these Modal migrations: non-idempotent billing writes + Slack PDF
upload for test sessions, ~300s runtime budget (report generation) + 60s (summary).
Connects directly to Supabase Postgres via asyncpg.

Deploy:   modal deploy modal_app/generate_report.py
Test run: modal run modal_app/generate_report.py::test_report --payload-file <path.json>
"""
from __future__ import annotations

import modal

app = modal.App("sreevaai-generate-report")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "openai>=2.37.0",
        "asyncpg>=0.31.0",
        "pydantic>=2.0.0",
        "python-dotenv>=1.2.2",
        "langgraph==1.2.1",
        "langchain-core==1.4.0",
        "typing_extensions==4.15.0",
        "fastapi>=0.115.0",
        "reportlab>=4.2.0",
        "aiohttp==3.13.5",
    )
    # Full confirmed transitive local-import chain (module-level only, AST BFS-verified):
    #   report_worker.py -> billing.billing, agent_persistence, debug_report
    #   agent_persistence.py -> agent_runtime_support, agent_utils, report_pipeline
    #   report_pipeline.py -> billing.billing, agent_runtime_support, agent_utils,
    #                          brief_extraction, slack_error_logger
    #
    # report_worker.py itself is ported verbatim into modal_app/ported_interview/
    # (no longer lives in livekit-python-agent/interview/ -- this IS the only copy).
    .add_local_file(
        "modal_app/ported_interview/report_worker.py",
        remote_path="/root/interview/report_worker.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/agent_persistence.py",
        remote_path="/root/interview/agent_persistence.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/debug_report.py",
        remote_path="/root/interview/debug_report.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/report_pipeline.py",
        remote_path="/root/interview/report_pipeline.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/brief_extraction.py",
        remote_path="/root/interview/brief_extraction.py",
    )
    # report_worker.py imports interview.tech.report / interview.conversational.report
    # (post tech/convo split). Ship both packages whole so the flat image resolves them.
    .add_local_dir(
        "livekit-python-agent/interview/tech",
        remote_path="/root/interview/tech",
    )
    .add_local_dir(
        "livekit-python-agent/interview/conversational",
        remote_path="/root/interview/conversational",
    )
    .add_local_file(
        "livekit-python-agent/interview/slack_error_logger.py",
        remote_path="/root/interview/slack_error_logger.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/agent_utils.py",
        remote_path="/root/interview/agent_utils.py",
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
        "livekit-python-agent/interview/__init__.py",
        remote_path="/root/interview/__init__.py",
    )
    .add_local_file(
        "livekit-python-agent/billing/billing.py",
        remote_path="/root/billing/billing.py",
    )
    .add_local_file(
        "livekit-python-agent/billing/__init__.py",
        remote_path="/root/billing/__init__.py",
    )
    .add_local_file(
        "certs/supabase-root-ca.pem",
        remote_path="/root/certs/supabase-root-ca.pem",
    )
    .add_local_file("modal_app/_modal_shared.py", remote_path="/root/_modal_shared.py")
)

secrets = [
    modal.Secret.from_name("sreevaai-openai"),
    modal.Secret.from_name("sreevaai-database"),
    modal.Secret.from_name("sreevaai-extract-api-key"),
    modal.Secret.from_name("sreevaai-slack"),
]


# ponytail: 5 of the workspace's shared 100-container pool (see extract_and_score.py).
@app.function(image=image, secrets=secrets, timeout=400, max_containers=5)
def generate_report(payload: dict) -> dict:
    """Mirrors report_worker.py's _run() -- same payload shape, piped via
    function argument instead of stdin JSON."""
    import asyncio
    import sys
    sys.path.insert(0, "/root")
    from interview.report_worker import _run
    from _modal_shared import report_crash_to_slack

    app_id = payload.get("appId", "?")
    print(f"[MODAL] generate_report started appId={app_id}")
    try:
        asyncio.run(_run(payload))
    except Exception as e:
        report_crash_to_slack("generate_report", e, appId=app_id)
        raise
    print(f"[MODAL] generate_report done appId={app_id}")
    return {"success": True, "appId": app_id}


from fastapi import Header, HTTPException


def _check_api_key(x_api_key: str | None) -> None:
    import hmac
    import os
    expected = os.environ.get("EXTRACT_SERVICE_API_KEY", "")
    if not expected or not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="invalid or missing API key")


@app.function(image=image, secrets=secrets, timeout=600)
@modal.fastapi_endpoint(method="POST", docs=True)
async def generate_report_endpoint(
    payload: dict,
    x_api_key: str | None = Header(default=None),
):
    _check_api_key(x_api_key)
    call = await generate_report.spawn.aio(payload)
    return {"call_id": call.object_id}  # async: return call ID immediately


@app.local_entrypoint()
def test_report(payload_file: str):
    import json
    with open(payload_file, encoding="utf-8") as f:
        payload = json.load(f)
    result = generate_report.remote(payload)
    print(json.dumps(result, indent=2))
