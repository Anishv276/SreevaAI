"""
interview/conversational/brief_extraction.py
Deterministic resume/JD extraction (zero LLM) is domain-independent -- it
parses structured JSON fields (work history, skills, projects) regardless of
role type. Re-export the shared implementation from interview.tech.brief_extraction
rather than duplicate it.
"""
from __future__ import annotations

from interview.tech.brief_extraction import (
    RawSkillEntry,
    RawWorkEntry,
    RawResumeJSON,
    ResumeExtractor,
    JDExtractor,
    run_extraction,
)

__all__ = [
    "RawSkillEntry", "RawWorkEntry", "RawResumeJSON",
    "ResumeExtractor", "JDExtractor", "run_extraction",
]
