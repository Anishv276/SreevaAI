"""
interview/conversational/debug.py
Debug PDF rendering is domain-agnostic -- it renders whatever answer_scores/
topic_pool/covered_topics/topic_records it's given via generic dict/attribute
access, with no tech-specific vocabulary. Re-export the shared implementation
from interview.tech.debug rather than duplicate it. Callers pass
interview_type="conversational" to label the report header/Slack title.
"""
from __future__ import annotations

from interview.tech.debug import (
    build_debug_pdf,
    post_pdf_to_slack,
    generate_and_send_debug_report,
)

__all__ = ["build_debug_pdf", "post_pdf_to_slack", "generate_and_send_debug_report"]
