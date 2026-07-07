"""
extraction_resume_JD_score_report
Production-grade ATS pipeline v2.

Key improvements over v1:
- Two-pass resume extraction (structural â†’ semantic)
- Semantic skill matching via embeddings (replaces static alias dict)
- Criterion-level evidence tracing (full explainability)
- Citation-anchored report generation with grounding verification
- Fixed hard rejection gate (â‰¥60% critical fail threshold)
- Evidence source inflation fix (per-skill rather than per-job)
- Bias-safe preprocessing (demographic proxy redaction)
"""
from extraction_resume_JD_score_report.models import (
    ResumeStructural,
    ResumeEvidence,
    JDData,
    ScoreResult,
    CriterionResult,
)

__all__ = [
    "ResumeStructural",
    "ResumeEvidence",
    "JDData",
    "ScoreResult",
    "CriterionResult",
]
