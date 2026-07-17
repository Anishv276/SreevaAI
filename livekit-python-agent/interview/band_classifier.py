"""
interview/band_classifier.py  [SHIM]
======================================
Backward-compatibility shim. All logic has moved to interview.tech.band.
Import from interview.tech.band directly for new code.
"""
from interview.tech.band import *  # noqa: F401, F403
from interview.tech.band import classify_band, CandidateBand, BandClassifier
__all__ = ["classify_band", "CandidateBand", "BandClassifier"]