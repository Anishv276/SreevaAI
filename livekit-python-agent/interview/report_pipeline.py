"""
interview/report_pipeline.py  [SHIM]
======================================
Backward-compatibility shim. All logic has moved to interview.tech.report.
Import from interview.tech.report directly for new code.
"""
from interview.tech.report import *  # noqa: F401, F403
from interview.tech.report import (
    generate_interview_report,
    generate_interview_summary,
)
__all__ = ["generate_interview_report", "generate_interview_summary"]