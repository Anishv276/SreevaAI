"""
livekit-python-agent/scripts/generate_demo_brief.py
=====================================================
CLI entry point called by the Node.js BullMQ worker when processing a
demo-brief-generation job.

Usage (called by worker.ts via child_process.spawn):
    python scripts/generate_demo_brief.py <role_title> <mode> <jd_text_b64>

Arguments:
  role_title   - the job title string
  mode         - "TECH" or "CONVERSATION"
  jd_text_b64  - base64-encoded raw JD text (avoids shell escaping issues)

Output:
  Writes the DemoBrief JSON to stdout on success.
  Writes an error JSON {"error": "..."} to stdout on failure.
  Exit code 0 on success, 1 on failure.

The caller (worker.ts) reads stdout, parses the JSON, and writes it to
DemoTemplate.briefJson.
"""
import asyncio
import base64
import json
import os
import sys

# Ensure the agent package is importable
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_AGENT_DIR = os.path.dirname(_SCRIPT_DIR)
if _AGENT_DIR not in sys.path:
    sys.path.insert(0, _AGENT_DIR)

from openai import AsyncOpenAI  # pyright: ignore[reportMissingImports]
from interview.demo.brief import generate_demo_brief


async def main() -> None:
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: generate_demo_brief.py <role_title> <mode> <jd_text_b64>"}))
        sys.exit(1)

    role_title = sys.argv[1]
    mode = sys.argv[2].upper()
    jd_text_b64 = sys.argv[3]

    try:
        jd_text = base64.b64decode(jd_text_b64).decode("utf-8")
    except Exception as e:
        print(json.dumps({"error": f"Failed to decode jd_text: {e}"}))
        sys.exit(1)

    openai_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    try:
        brief = await generate_demo_brief(
            role_title=role_title,
            jd_text=jd_text,
            mode=mode,
            openai_client=openai_client,
            llm_model=os.environ.get("DEMO_BRIEF_MODEL", "gpt-4.1"),
        )
        print(json.dumps(brief.model_dump()))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
