"""
interview/tech/__init__.py
============================
Tech-interview module: prompts, scoring, signal detection, probe strategy,
brief generation, eval pipeline, and report pipeline for technical roles.
"""
from interview.tech.scoring import (
    evaluate_answer,
    RESPONSE_SIGNALS,
    CONTENT_SIGNAL_DEFINITIONS,
    ALL_SIGNALS,
)
from interview.tech.probe import (
    get_probe_context,
)
from interview.tech.eval import TopicState, run_eval_and_build_directive
from interview.tech.brief import (
    InterviewBrief,
    TopicItem,
    RoleContext,
)
from interview.tech.question_bank_adapter import build_brief_from_question_bank
from interview.tech.brief_extraction import (
    RawSkillEntry,
    RawWorkEntry,
    RawResumeJSON,
    ResumeExtractor,
    JDExtractor,
    run_extraction,
)
from interview.tech.prompts import (
    build_voice_layer_prompt,
    build_evaluation_layer_prompt,
    build_system_prompt,
)
from interview.tech.report import (
    generate_interview_report,
    generate_interview_summary,
)
from interview.tech.phases import build_greeting_text, build_interview_directive

__all__ = [
    "evaluate_answer",
    "RESPONSE_SIGNALS",
    "CONTENT_SIGNAL_DEFINITIONS",
    "ALL_SIGNALS",
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
    "ResumeExtractor",
    "JDExtractor",
    "run_extraction",
    "build_voice_layer_prompt",
    "build_evaluation_layer_prompt",
    "build_system_prompt",
    "generate_interview_report",
    "generate_interview_summary",
    "build_greeting_text",
    "build_interview_directive",
]
