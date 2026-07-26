"""
interview/conversational/__init__.py
============================
Conversational-interview module (sales roles today; other non-tech role
families can extend this later). Mirrors interview.tech's public surface.

Note: brief_extraction.py and debug.py re-export interview.tech's
implementation unchanged -- resume/JD extraction and debug PDF rendering are
domain-independent. brief.py, scoring.py, probe.py, prompts.py,
phases.py, eval.py, and report.py are sales-specific implementations.
"""
from interview.conversational.scoring import (
    evaluate_answer,
    RESPONSE_SIGNALS,
    SIGNAL_DEFINITIONS,
    TECHNICAL_SIGNALS,
    CONVERSATIONAL_SIGNALS,
)
from interview.conversational.probe import (
    SIGNAL_PROBES,
    get_probe_context,
    get_reaction_hint,
)
from interview.conversational.eval import TopicState, run_eval_and_build_directive
from interview.conversational.brief import (
    InterviewBrief,
    TopicItem,
    RoleContext,
)
from interview.conversational.brief_extraction import (
    RawSkillEntry,
    RawWorkEntry,
    RawResumeJSON,
    ResumeExtractor,
    JDExtractor,
    run_extraction,
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
from interview.conversational.debug import (
    build_debug_pdf,
    post_pdf_to_slack,
    generate_and_send_debug_report,
)

__all__ = [
    "evaluate_answer",
    "RESPONSE_SIGNALS",
    "SIGNAL_DEFINITIONS",
    "TECHNICAL_SIGNALS",
    "CONVERSATIONAL_SIGNALS",
    "SIGNAL_PROBES",
    "get_probe_context",
    "get_reaction_hint",
    "TopicState",
    "run_eval_and_build_directive",
    "InterviewBrief",
    "TopicItem",
    "RoleContext",
    "RawSkillEntry",
    "RawWorkEntry",
    "RawResumeJSON",
    "ResumeExtractor",
    "JDExtractor",
    "run_extraction",
    "build_voice_layer_prompt",
    "build_evaluation_layer_prompt",
    "build_system_prompt",
    "build_greeting_text",
    "build_interview_directive",
    "generate_interview_report",
    "generate_interview_summary",
    "build_debug_pdf",
    "post_pdf_to_slack",
    "generate_and_send_debug_report",
]
