"""
interview/conversational/band.py
Candidate band classification is purely years-of-experience / seniority-label
driven -- it has no sales- or tech-specific logic. Re-export the shared
implementation from interview.tech.band rather than duplicate it.
"""
from __future__ import annotations

from interview.tech.band import (
    CandidateBand,
    ResumeExperience,
    BandClassifier,
    classify_band,
)

__all__ = ["CandidateBand", "ResumeExperience", "BandClassifier", "classify_band"]
