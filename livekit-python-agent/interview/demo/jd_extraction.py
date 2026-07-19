"""
interview/demo/jd_extraction.py
=================================
JD text extraction for demo templates.
Two entry points:
  1. extract_jd_text_from_pdf(pdf_bytes) → raw text string
  2. extract_jd_structure(raw_text, openai_client, model) → structured dict

Used by the BullMQ demo-brief-generation worker (runs in Node process).
Also callable from the Python agent directly if ever needed.

No resume pipeline here — demo is JD-only by design.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

logger = logging.getLogger("interview-agent")


# ---------------------------------------------------------------------------
# PDF text extraction (zero LLM — pure Python)
# ---------------------------------------------------------------------------

def extract_jd_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract raw text from a JD PDF using pypdf (no LLM call).

    Falls back gracefully when pypdf is unavailable so the module can be
    imported in environments that only have the text path.
    """
    try:
        import io
        try:
            from pypdf import PdfReader  # pyright: ignore[reportMissingImports]
        except ImportError:
            from PyPDF2 import PdfReader  # type: ignore[no-redef]
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ""
            pages.append(text.strip())
        raw = "\n\n".join(p for p in pages if p)
        # Collapse excessive whitespace while keeping paragraph breaks
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        raw = re.sub(r" {2,}", " ", raw)
        return raw.strip()
    except Exception as exc:
        logger.warning("[DEMO/JD] PDF extraction failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# JD structure extraction (one LLM call — no resume involved)
# ---------------------------------------------------------------------------

_JD_STRUCTURE_SYSTEM = """\
You are an expert recruiter parsing a raw job description into a clean structured format.
Extract the key information from the JD text below.

Return ONLY valid JSON. No markdown. No explanation.

Schema:
{
  "role_title": str,              // job title — exact from JD
  "role_summary": str,            // 1-2 sentences: what the role does day-to-day
  "responsibilities": [str],      // up to 10 bullet points, verbatim or tightened
  "requirements": [str],          // must-have qualifications — hard requirements
  "preferred": [str],             // nice-to-have / preferred qualifications (may be empty)
  "skills": [str],                // explicit skills/technologies listed in JD
  "experience_years": str         // required years e.g. "3-5 years", "5+" or "" if not stated
}
"""


async def extract_jd_structure(
    raw_text: str,
    *,
    openai_client: Any,
    model: str = "gpt-4.1-mini",
) -> dict:
    """Parse raw JD text into a structured dict (one small LLM call)."""
    if not raw_text.strip():
        return {}

    user_msg = f"JOB DESCRIPTION TEXT:\n{raw_text[:6000]}"
    try:
        resp = await openai_client.chat.completions.create(
            model=model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _JD_STRUCTURE_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            timeout=20,
        )
        return json.loads(resp.choices[0].message.content or "{}")
    except Exception as exc:
        logger.warning("[DEMO/JD] JD structure extraction failed: %s", exc)
        return {}
