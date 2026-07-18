"""
interview/tech/__init__.py
============================
Tech-interview module: prompts, scoring, signal detection, probe strategy,
brief generation, eval pipeline, and report pipeline for technical roles.
"""
from interview.tech.scoring import (
    evaluate_answer,
    RESPONSE_SIGNALS,
    SIGNAL_DEFINITIONS,
)
from interview.tech.probe import (
    SIGNAL_PROBES,
    get_probe_context,
    get_reaction_hint,
)
from interview.tech.eval import TopicState, run_eval_and_build_directive
from interview.tech.brief import (
    InterviewBrief,
    TopicItem,
    RoleContext,
    generate_interview_brief,
)
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
from interview.tech.band import classify_band, CandidateBand, BandClassifier

__all__ = [
    "evaluate_answer",
    "RESPONSE_SIGNALS",
    "SIGNAL_DEFINITIONS",
    "SIGNAL_PROBES",
    "get_probe_context",
    "get_reaction_hint",
    "TopicState",
    "run_eval_and_build_directive",
    "InterviewBrief",
    "TopicItem",
    "RoleContext",
    "generate_interview_brief",
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
    "classify_band",
    "CandidateBand",
    "BandClassifier",
]
