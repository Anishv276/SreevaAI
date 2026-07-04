"""
interview/band_classifier.py
============================
Determines a candidate's interview band from their parsed resume experience.

Design principles:
  - Pydantic  : `ResumeExperience` validates and normalises the raw DB dict
                at the boundary — no raw dict access leaks into business logic.
  - OOP       : `BandClassifier` is a single-responsibility class. Each decision
                step is a private method — seniority lookup, year fallback,
                hard-floor enforcement — independently readable and testable.
  - Enum/DSA  : `CandidateBand` is an IntEnum so bands are *ordered*.
                Threshold lookup uses `bisect.bisect_right` on a sorted list —
                O(log n) instead of an if/elif chain; trivially extensible.
  - Zero side-effects : no logging, no I/O, no global state mutation.
                Logging is the caller's responsibility.

Public API (what agent_runtime.py uses):
  classify_band(structured_resume: dict) -> tuple[str, float, str]
    Returns (band_str, total_years, seniority_level).
    band_str is always one of: "fresher" | "mid" | "experienced" | "senior"
    total_years and seniority_level are informational — for logging.
"""
from __future__ import annotations

import bisect
from enum import IntEnum
from typing import Any, ClassVar

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# 1. Ordered Enum — CandidateBand
# ---------------------------------------------------------------------------

class CandidateBand(IntEnum):
    """Interview depth band.

    Stored as an int so bands are *ordered* and comparable:
        FRESHER < MID < EXPERIENCED < SENIOR

    This lets callers do things like `band >= CandidateBand.MID` instead of
    string equality chains — the DSA advantage.
    """
    FRESHER     = 0   # 0 – 1.5 yr  | intern / junior
    MID         = 1   # 1.5 – 4 yr  | mid-level
    EXPERIENCED = 2   # 4 – 8 yr    | senior / lead / manager
    SENIOR      = 3   # 8+ yr       | principal / staff / vp

    def __str__(self) -> str:  # makes str(band) == "fresher" etc.
        return self.name.lower()


# ---------------------------------------------------------------------------
# 2. Pydantic input model — ResumeExperience
# ---------------------------------------------------------------------------

class ResumeExperience(BaseModel):
    """Typed, validated view of the experience block from the DB resume JSON.

    The DB stores resume data in two shapes:
      - Flat  : {experience: {total_years: ..., seniority_level: ...}, ...}
      - Nested: {source: ..., parsed: {experience: {...}, ...}}

    `from_structured_resume` handles both shapes before Pydantic validation,
    so all business logic only sees the clean model fields.
    """
    total_years: float = Field(default=0.0, ge=0.0)
    total_months: int | None = Field(default=None)
    seniority_level: str = Field(default="")
    seniority_reason: str = Field(default="")

    @model_validator(mode="before")
    @classmethod
    def _normalise(cls, v: Any) -> Any:
        """Coerce incoming value to a clean dict before field validation."""
        if not isinstance(v, dict):
            return {}
        # Normalise known numeric aliases
        raw_years = v.get("total_years") or v.get("totalYears") or v.get("years") or 0
        try:
            v["total_years"] = float(raw_years)
        except (TypeError, ValueError):
            v["total_years"] = 0.0
        # Normalise seniority aliases
        seniority = (
            v.get("seniority_level")
            or v.get("seniorityLevel")
            or v.get("level")
            or ""
        )
        v["seniority_level"] = str(seniority).strip().lower()
        return v

    @classmethod
    def from_structured_resume(cls, resume: dict) -> "ResumeExperience":
        """Extract the experience block from any known DB resume shape.

        Handles:
          - Flat resume dict directly
          - Nested under "parsed" key (DB format: {source, parsed})
        """
        if not isinstance(resume, dict):
            return cls()

        # Try flat first
        exp = resume.get("experience")
        if not exp and "parsed" in resume:
            # Nested shape: {source: ..., parsed: {experience: ...}}
            parsed = resume.get("parsed") or {}
            if isinstance(parsed, dict):
                exp = parsed.get("experience")

        if isinstance(exp, dict):
            return cls.model_validate(exp)
        return cls()


# ---------------------------------------------------------------------------
# 3. OOP classifier — BandClassifier
# ---------------------------------------------------------------------------

class BandClassifier:
    """Determines a candidate's interview band from their resume experience.

    Decision priority (highest → lowest):
      1. `seniority_level` string  — explicit label from the LLM parser
      2. `total_years` number      — numeric fallback via bisect on thresholds
      3. Hard floor                — intern or <1.5 yr → always FRESHER,
                                     regardless of what step 1 or 2 returned.

    Why a class instead of a function?
      - Each step is an independent private method → unit-testable in isolation.
      - The lookup table and thresholds are class-level constants → allocated once,
        never rebuilt per call.
      - Easy to subclass if a future role-specific classifier is needed.
    """

    # O(1) seniority → band lookup.
    # Intentionally typed as ClassVar so subclasses can override it cleanly.
    _SENIORITY_MAP: ClassVar[dict[str, CandidateBand]] = {
        "intern":   CandidateBand.FRESHER,
        "junior":   CandidateBand.FRESHER,
        "fresher":  CandidateBand.FRESHER,
        "entry":    CandidateBand.FRESHER,
        "trainee":  CandidateBand.FRESHER,
        "graduate": CandidateBand.FRESHER,
        "mid":      CandidateBand.MID,
        "senior":   CandidateBand.EXPERIENCED,
        "lead":     CandidateBand.EXPERIENCED,
        "manager":  CandidateBand.EXPERIENCED,
        "staff":    CandidateBand.SENIOR,
        "principal": CandidateBand.SENIOR,
        "architect": CandidateBand.SENIOR,
        "vp":       CandidateBand.SENIOR,
        "director": CandidateBand.SENIOR,
    }

    # Sorted breakpoints for bisect_right.
    # Each tuple is (exclusive_upper_bound, band_for_values_BELOW_that_bound).
    # Anything >= 8.0 falls through to SENIOR.
    _YEAR_BREAKPOINTS: ClassVar[list[float]] = [1.5, 4.0, 8.0]
    _YEAR_BANDS: ClassVar[list[CandidateBand]] = [
        CandidateBand.FRESHER,
        CandidateBand.MID,
        CandidateBand.EXPERIENCED,
        CandidateBand.SENIOR,
    ]

    # Hard floor: anything at or below this year threshold → FRESHER always.
    _HARD_FLOOR_YEARS: ClassVar[float] = 1.5
    # Hard floor: these seniority labels always map to FRESHER, no override.
    _HARD_FLOOR_SENIORITIES: ClassVar[frozenset[str]] = frozenset({"intern", "fresher", "trainee"})

    # ── Public API ────────────────────────────────────────────────────────────

    def classify(self, exp: ResumeExperience) -> CandidateBand:
        """Classify the candidate's band from their resume experience.

        Returns a CandidateBand enum value. The caller converts to str via str().
        """
        # Step 1: try seniority label
        band = self._from_seniority(exp.seniority_level)

        # Step 2: fall back to total_years if seniority was unknown/missing
        if band is None:
            band = self._from_years(exp.total_years)

        # Step 3: apply hard floor — must always run last
        band = self._apply_hard_floor(band, exp)

        return band

    # ── Private methods (each independently testable) ─────────────────────────

    def _from_seniority(self, seniority: str) -> CandidateBand | None:
        """Look up the band for a seniority label. Returns None if unknown."""
        if not seniority:
            return None
        return self._SENIORITY_MAP.get(seniority.strip().lower())

    def _from_years(self, years: float) -> CandidateBand:
        """Map total_years to a band using bisect_right on sorted breakpoints.

        bisect_right(breakpoints, years) returns the insertion index:
          years=0.0  → index 0 → FRESHER
          years=1.49 → index 0 → FRESHER
          years=1.5  → index 1 → MID        (boundary value → higher band)
          years=3.99 → index 1 → MID
          years=4.0  → index 2 → EXPERIENCED (boundary value → higher band)
          years=7.99 → index 2 → EXPERIENCED
          years=8.0  → index 3 → SENIOR      (boundary value → higher band)
          years=25.0 → index 3 → SENIOR (clamped)
        """
        idx = bisect.bisect_right(self._YEAR_BREAKPOINTS, years)
        # Clamp: bisect_right returns len(breakpoints) when years > last breakpoint
        idx = min(idx, len(self._YEAR_BANDS) - 1)
        return self._YEAR_BANDS[idx]


    def _apply_hard_floor(
        self, band: CandidateBand, exp: ResumeExperience
    ) -> CandidateBand:
        """Enforce the hard floor rule.

        Any candidate who is explicitly labelled 'intern'/'fresher'/'trainee'
        OR has fewer than 1.5 years of experience is capped to FRESHER,
        regardless of what seniority or year lookup returned.

        This prevents a mislabelled resume from getting senior-depth interview
        questions when their actual experience is intern-level.
        """
        if exp.seniority_level in self._HARD_FLOOR_SENIORITIES:
            return CandidateBand.FRESHER
        if exp.total_years < self._HARD_FLOOR_YEARS:
            return CandidateBand.FRESHER
        return band


# ---------------------------------------------------------------------------
# 4. Module-level convenience function (what agent_runtime.py calls)
# ---------------------------------------------------------------------------

_CLASSIFIER = BandClassifier()   # singleton — stateless, safe to reuse


def classify_band(structured_resume: dict) -> tuple[str, float, str]:
    """Determine the interview band from a structured resume dict.

    Args:
        structured_resume: The full `resumeData` dict from the DB.
                           May be flat or nested under "parsed".

    Returns:
        A 3-tuple of:
          - band_str       : str  — "fresher" | "mid" | "experienced" | "senior"
          - total_years    : float — candidate's total experience years (for logging)
          - seniority_level: str  — raw seniority string from resume (for logging)

    This is the ONLY function `agent_runtime.py` needs to import.
    The caller is responsible for logging the returned values.
    """
    exp = ResumeExperience.from_structured_resume(structured_resume)
    band = _CLASSIFIER.classify(exp)
    return str(band), exp.total_years, exp.seniority_level
