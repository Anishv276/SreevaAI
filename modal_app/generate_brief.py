"""
modal_app/generate_brief.py
=============================
Modal deployment of interview brief generation
(livekit-python-agent/interview/generate_brief.py's BriefPipeline), unchanged logic,
just invoked as a cloud function instead of a Node child_process.spawn().

Unlike extract_and_score.py, this function connects DIRECTLY to Supabase Postgres
via asyncpg (fetches application/job data, persists the brief) -- needs DATABASE_URL
and the pinned Supabase CA cert, not just OPENAI_API_KEY.

Deploy:   modal deploy modal_app/generate_brief.py
Test run: modal run modal_app/generate_brief.py::test_brief --application-id <id>
"""
from __future__ import annotations

import modal

app = modal.App("sreevaai-generate-brief")

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
    )
    # Confirmed transitive local-import chain (module-level only, verified via AST
    # BFS -- excludes lazy/function-local imports like billing.billing's
    # `from interview.agent_persistence import DatabasePool`, which this call path
    # never executes):
    #   generate_brief.py -> band_classifier, interview_brief, billing.billing
    #   interview_brief.py -> brief_extraction
    #   billing.billing -> agent_utils, agent_runtime_support
    #   agent_runtime_support -> agent_runtime_utils
    #
    # generate_brief.py itself is ported verbatim into modal_app/ported_interview/
    # (no longer lives in livekit-python-agent/interview/ -- this IS the only copy).
    .add_local_file(
        "modal_app/ported_interview/generate_brief.py",
        remote_path="/root/interview/generate_brief.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/band_classifier.py",
        remote_path="/root/interview/band_classifier.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/interview_brief.py",
        remote_path="/root/interview/interview_brief.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/brief_extraction.py",
        remote_path="/root/interview/brief_extraction.py",
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
        "livekit-python-agent/certs/supabase-root-ca.pem",
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


@app.function(image=image, secrets=secrets, timeout=600, max_containers=100)
def generate_brief(application_id: str) -> dict:
    """Mirrors generate_brief.py's _main() -- fetch, classify, LLM call, persist."""
    import asyncio
    import sys
    sys.path.insert(0, "/root")
    from interview.generate_brief import _main
    from _modal_shared import report_crash_to_slack

    print(f"[MODAL] generate_brief started applicationId={application_id}")
    try:
        result = asyncio.run(_main(application_id))
    except Exception as e:
        report_crash_to_slack("generate_brief", e, applicationId=application_id)
        raise
    print(f"[MODAL] generate_brief done applicationId={application_id} success={result.success} error={result.error}")
    return result.model_dump()


from pydantic import BaseModel as _BaseModel
from fastapi import Header, HTTPException


class GenerateBriefRequest(_BaseModel):
    applicationId: str


def _check_api_key(x_api_key: str | None) -> None:
    import hmac
    import os
    expected = os.environ.get("EXTRACT_SERVICE_API_KEY", "")
    if not expected or not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="invalid or missing API key")


@app.function(image=image, secrets=secrets, timeout=600)
@modal.fastapi_endpoint(method="POST", docs=True)
async def generate_brief_endpoint(
    body: GenerateBriefRequest,
    x_api_key: str | None = Header(default=None),
):
    _check_api_key(x_api_key)
    return await generate_brief.remote.aio(body.applicationId)


@app.local_entrypoint()
def test_brief(application_id: str):
    import json
    result = generate_brief.remote(application_id)
    print(json.dumps(result, indent=2))
