"""
interview/conversational/__init__.py
============================
Conversational-interview module (sales roles today; other non-tech role
families can extend this later). Mirrors interview.tech's public surface.

Note: resume parsing is handled globally in interview.resume.
brief.py, scoring.py, probe.py, prompts.py,
phases.py, eval.py, and report.py are sales-specific implementations.
"""
from interview.conversational.scoring import (
    evaluate_answer,
    RESPONSE_SIGNALS,
    CONTENT_SIGNAL_DEFINITIONS,
    ALL_SIGNALS,
    DENIAL_SIGNALS,
    NON_FOLLOWUP_SIGNALS,
)
from interview.conversational.probe import get_probe_context
from interview.conversational.eval import TopicState, run_eval_and_build_directive
from interview.conversational.brief import (
    InterviewBrief,
    TopicItem,
    RoleContext,
)
from interview.conversational.question_bank_adapter import build_brief_from_question_bank
from interview.resume import (
    RawSkillEntry,
    RawWorkEntry,
    RawResumeJSON,
)
from interview.conversational.prompts import (
    build_voice_layer_prompt,
    build_evaluation_layer_prompt,
    build_system_prompt,
)
from interview.conversational.phases import build_greeting_text, build_interview_directive
from interview.conversational.report import (
    generate_interview_report,
    generate_interview_summary,
)

__all__ = [
    "evaluate_answer",
    "RESPONSE_SIGNALS",
    "CONTENT_SIGNAL_DEFINITIONS",
    "ALL_SIGNALS",
    "DENIAL_SIGNALS",
    "NON_FOLLOWUP_SIGNALS",
    "get_probe_context",
    "TopicState",
    "run_eval_and_build_directive",
    "InterviewBrief",
    "TopicItem",
    "RoleContext",
    "build_brief_from_question_bank",
    "RawSkillEntry",
    "RawWorkEntry",
    "RawResumeJSON",
    "build_voice_layer_prompt",
    "build_evaluation_layer_prompt",
    "build_system_prompt",
    "build_greeting_text",
    "build_interview_directive",
    "generate_interview_report",
    "generate_interview_summary",
]
