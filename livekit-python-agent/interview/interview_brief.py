"""
interview/interview_brief.py  [SHIM]
======================================
Backward-compatibility shim. All logic has moved to interview.tech.brief.
Import from interview.tech.brief directly for new code.
"""
from interview.tech.brief import *  # noqa: F401, F403
from interview.tech.brief import (
    InterviewBrief,
    TopicItem,
    RoleContext,
    generate_interview_brief,
)
__all__ = ["InterviewBrief", "TopicItem", "RoleContext", "generate_interview_brief"]
