"""
interview/interview_phases.py  [SHIM]
=======================================
Backward-compatibility shim. All logic has moved to interview.tech.phases.
Import from interview.tech.phases directly for new code.
"""
from interview.tech.phases import *  # noqa: F401, F403
from interview.tech.phases import build_greeting_text, build_interview_directive
__all__ = ["build_greeting_text", "build_interview_directive"]