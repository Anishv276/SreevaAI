"""
extraction_resume_JD_score_report package — Modular, OOP-based replacement for extract_pdf.py.

Public API (same as extract_pdf.py):
    from extraction_resume_JD_score_report.orchestrate_full_extraction_pipeline_(pipeline) import run_pipeline
    result = run_pipeline(file_path, type_)  # returns same JSON dict as before
"""
from extraction_resume_JD_score_report.config import SKILL_ALIASES, TRANSFERABLE_SKILLS
from extraction_resume_JD_score_report.models import ResumeData, JDData, ScoreResult

__all__ = ["SKILL_ALIASES", "TRANSFERABLE_SKILLS", "ResumeData", "JDData", "ScoreResult"]
__version__ = "2.0.0"
