"""
interview/demo/__init__.py
==========================
Demo interview module — only the JD extraction + brief generation are unique here.
All other layers (prompts, eval, scoring, probe, phases) are reused from
interview.tech (TECH mode) or interview.conversational (CONVERSATION mode)
exactly as-is. The DemoBrief is injected into the same agent_runtime pipeline
that processes InterviewBrief from real interviews.
"""
from interview.demo.brief import (
    DemoBrief,
    DemoTopicItem,
    generate_demo_brief,
)
from interview.demo.jd_extraction import (
    extract_jd_text_from_pdf,
    extract_jd_structure,
)

__all__ = [
    "DemoBrief",
    "DemoTopicItem",
    "generate_demo_brief",
    "extract_jd_text_from_pdf",
    "extract_jd_structure",
]
