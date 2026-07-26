"""
interview/conversational/brief.py
==================================
No LLM brief generation anymore -- every interview type (tech and
conversational) builds its InterviewBrief from the stored, frozen
Job.questionBank snapshot via interview.tech.question_bank_adapter, at
session start in agent_runtime.py. This module now only re-exports the
shared InterviewBrief/TopicItem/RoleContext schema classes for
interview.conversational.__init__'s public surface.
"""
from __future__ import annotations

from interview.tech.brief import InterviewBrief, TopicItem, RoleContext  # noqa: F401 -- re-exported for interview.conversational.__init__
