"""
interview/brief_extraction.py  [SHIM]
=======================================
Backward-compatibility shim. All logic has moved to interview.tech.brief_extraction.
Import from interview.tech.brief_extraction directly for new code.
"""
from interview.tech.brief_extraction import *  # noqa: F401, F403
from interview.tech.brief_extraction import run_extraction
# Also re-export commonly used models
from interview.tech.brief_extraction import (
    RawSkillEntry,
    RawWorkEntry,
    RawResumeJSON,
    ResumeExtractor,
    JDExtractor,
)