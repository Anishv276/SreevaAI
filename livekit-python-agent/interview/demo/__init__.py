"""
interview/demo/__init__.py
==========================
Demo interview module — only JD extraction is unique here. Interview briefs
are built from a pre-generated question bank (DemoTemplate.questionBankSnapshot,
same as real jobs), no LLM call at session start. All other layers (prompts,
eval, scoring, probe, phases) are reused from interview.tech (TECH mode) or
interview.conversational (CONVERSATION mode) exactly as-is.
"""
from interview.demo.jd_extraction import (
    extract_jd_text_from_pdf,
    extract_jd_structure,
)

__all__ = [
    "extract_jd_text_from_pdf",
    "extract_jd_structure",
]
