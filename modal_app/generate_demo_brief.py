"""
modal_app/generate_demo_brief.py
==================================
Modal deployment of interview/demo/brief.py's generate_demo_brief() -- the
8-topic DemoBrief generator used by the public demo flow (JD only, no resume,
no DB access needed here: the Node worker persists the returned JSON to
DemoTemplate.briefJson).

Deploy:   modal deploy modal_app/generate_demo_brief.py
Test run: modal run modal_app/generate_demo_brief.py::test_demo_brief --role-title "Backend Engineer" --mode TECH --jd-text "..."
"""
from __future__ import annotations

import modal

app = modal.App("sreevaai-generate-demo-brief")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "openai>=2.37.0",
        "pydantic>=2.0.0",
        "fastapi>=0.115.0",
    )
    .add_local_file(
        "livekit-python-agent/interview/demo/brief.py",
        remote_path="/root/interview/demo/brief.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/demo/__init__.py",
        remote_path="/root/interview/demo/__init__.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/agent_runtime_utils.py",
        remote_path="/root/interview/agent_runtime_utils.py",
    )
    .add_local_file(
        "livekit-python-agent/interview/__init__.py",
        remote_path="/root/interview/__init__.py",
    )
)

secrets = [modal.Secret.from_name("sreevaai-openai"), modal.Secret.from_name("sreevaai-extract-api-key")]


@app.function(image=image, secrets=secrets, timeout=60, max_containers=10)
async def generate_demo_brief_fn(role_title: str, jd_text: str, mode: str) -> dict:
    import os
    import sys
    sys.path.insert(0, "/root")
    from openai import AsyncOpenAI
    from interview.demo.brief import generate_demo_brief

    print(f"[MODAL] generate_demo_brief started role_title={role_title!r} mode={mode}")
    client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    brief = await generate_demo_brief(
        role_title=role_title,
        jd_text=jd_text,
        mode=mode,
        openai_client=client,
        llm_model=os.environ.get("DEMO_BRIEF_MODEL", "gpt-4.1"),
    )
    print(f"[MODAL] generate_demo_brief done role_title={role_title!r} topics={len(brief.topic_pool)}")
    return brief.model_dump()


from pydantic import BaseModel as _BaseModel
from fastapi import Header, HTTPException


class GenerateDemoBriefRequest(_BaseModel):
    roleTitle: str
    jdText: str
    mode: str = "TECH"


def _check_api_key(x_api_key: str | None) -> None:
    import hmac
    import os
    expected = os.environ.get("EXTRACT_SERVICE_API_KEY", "")
    if not expected or not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="invalid or missing API key")


@app.function(image=image, secrets=secrets, timeout=60)
@modal.fastapi_endpoint(method="POST", docs=True)
async def generate_demo_brief_endpoint(
    body: GenerateDemoBriefRequest,
    x_api_key: str | None = Header(default=None),
):
    _check_api_key(x_api_key)
    try:
        return await generate_demo_brief_fn.remote.aio(body.roleTitle, body.jdText, body.mode)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.local_entrypoint()
def test_demo_brief(role_title: str, jd_text: str, mode: str = "TECH"):
    import json
    result = generate_demo_brief_fn.remote(role_title, jd_text, mode)
    print(json.dumps(result, indent=2))
