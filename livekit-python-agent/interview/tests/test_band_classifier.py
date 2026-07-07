"""
interview/tests/test_band_classifier.py
=========================================
Comprehensive pytest suite for interview/band_classifier.py.

Test groups:
  1.  CandidateBand ordering (DSA contract)
  2.  ResumeExperience.from_structured_resume — flat shape
  3.  ResumeExperience.from_structured_resume — nested "parsed" shape
  4.  ResumeExperience.from_structured_resume — empty / missing data
  5.  BandClassifier._from_seniority — known labels
  6.  BandClassifier._from_seniority — unknown / empty labels
  7.  BandClassifier._from_years — boundary values (bisect correctness)
  8.  BandClassifier._apply_hard_floor — hard floor enforcement
  9.  BandClassifier.classify — end-to-end decision priority
  10. classify_band() — public API contract & return types
  11. Tulasi regression — total_years=0.33, seniority=intern → fresher
  12. Edge cases — None inputs, 0 years, very high years
"""
from __future__ import annotations

import pytest
from interview.band_classifier import (
    BandClassifier,
    CandidateBand,
    ResumeExperience,
    classify_band,
)


# ===========================================================================
# 1. CandidateBand ordering -- DSA contract
# ===========================================================================

class TestCandidateBandOrdering:
    """CandidateBand is an IntEnum — bands must be ordered correctly."""

    def test_fresher_is_smallest(self):
        assert CandidateBand.FRESHER < CandidateBand.MID

    def test_mid_less_than_experienced(self):
        assert CandidateBand.MID < CandidateBand.EXPERIENCED

    def test_experienced_less_than_senior(self):
        assert CandidateBand.EXPERIENCED < CandidateBand.SENIOR

    def test_full_ordering(self):
        bands = sorted(CandidateBand)
        assert bands == [
            CandidateBand.FRESHER,
            CandidateBand.MID,
            CandidateBand.EXPERIENCED,
            CandidateBand.SENIOR,
        ]

    def test_str_representation(self):
        assert str(CandidateBand.FRESHER) == "fresher"
        assert str(CandidateBand.MID) == "mid"
        assert str(CandidateBand.EXPERIENCED) == "experienced"
        assert str(CandidateBand.SENIOR) == "senior"

    def test_ordering_supports_comparison_operators(self):
        assert CandidateBand.MID >= CandidateBand.FRESHER
        assert CandidateBand.SENIOR >= CandidateBand.EXPERIENCED
        assert not (CandidateBand.FRESHER > CandidateBand.MID)


# ===========================================================================
# 2. ResumeExperience.from_structured_resume -- flat resume shape
# ===========================================================================

class TestResumeExperienceFlatShape:
    """Flat DB shape: {experience: {total_years: ..., seniority_level: ...}}"""

    def test_flat_basic(self):
        resume = {"experience": {"total_years": 3.5, "seniority_level": "mid"}}
        exp = ResumeExperience.from_structured_resume(resume)
        assert exp.total_years == 3.5
        assert exp.seniority_level == "mid"

    def test_flat_seniority_uppercased_normalised(self):
        resume = {"experience": {"total_years": 5.0, "seniority_level": "Senior"}}
        exp = ResumeExperience.from_structured_resume(resume)
        assert exp.seniority_level == "senior"

    def test_flat_intern_scenario(self):
        resume = {"experience": {"total_years": 0.33, "total_months": 4, "seniority_level": "intern"}}
        exp = ResumeExperience.from_structured_resume(resume)
        assert exp.total_years == pytest.approx(0.33)
        assert exp.total_months == 4
        assert exp.seniority_level == "intern"

    def test_flat_seniority_with_whitespace(self):
        resume = {"experience": {"total_years": 2.0, "seniority_level": "  mid  "}}
        exp = ResumeExperience.from_structured_resume(resume)
        assert exp.seniority_level == "mid"

    def test_flat_missing_seniority(self):
        resume = {"experience": {"total_years": 6.0}}
        exp = ResumeExperience.from_structured_resume(resume)
        assert exp.total_years == 6.0
        assert exp.seniority_level == ""

    def test_flat_missing_total_years(self):
        resume = {"experience": {"seniority_level": "senior"}}
        exp = ResumeExperience.from_structured_resume(resume)
        assert exp.total_years == 0.0
        assert exp.seniority_level == "senior"


# ===========================================================================
# 3. ResumeExperience.from_structured_resume -- nested "parsed" shape
# ===========================================================================

class TestResumeExperienceNestedShape:
    """Nested DB shape: {source: ..., parsed: {experience: {...}}}"""

    def test_nested_parsed_key(self):
        resume = {
            "source": "pdf",
            "parsed": {
                "experience": {"total_years": 1.5, "seniority_level": "junior"}
            }
        }
        exp = ResumeExperience.from_structured_resume(resume)
        assert exp.total_years == 1.5
        assert exp.seniority_level == "junior"

    def test_nested_intern_case_tulasi(self):
        """Matches exactly what Tulasi's DB record looks like."""
        resume = {
            "source": "resume",
            "parsed": {
                "experience": {
                    "total_years": 0.33,
                    "total_months": 4,
                    "seniority_level": "intern",
                    "seniority_reason": "Only one internship role of 4 months duration",
                }
            }
        }
        exp = ResumeExperience.from_structured_resume(resume)
        assert exp.total_years == pytest.approx(0.33)
        assert exp.seniority_level == "intern"

    def test_nested_flat_takes_precedence(self):
        """If both flat and parsed exist, flat wins (direct key access first)."""
        resume = {
            "experience": {"total_years": 7.0, "seniority_level": "senior"},
            "parsed": {
                "experience": {"total_years": 1.0, "seniority_level": "intern"}
            }
        }
        exp = ResumeExperience.from_structured_resume(resume)
        # Flat key "experience" found first → uses 7.0 / senior
        assert exp.total_years == 7.0
        assert exp.seniority_level == "senior"


# ===========================================================================
# 4. ResumeExperience.from_structured_resume -- empty / missing data
# ===========================================================================

class TestResumeExperienceMissingData:

    def test_empty_resume_dict(self):
        exp = ResumeExperience.from_structured_resume({})
        assert exp.total_years == 0.0
        assert exp.seniority_level == ""

    def test_non_dict_input(self):
        exp = ResumeExperience.from_structured_resume(None)  # type: ignore[arg-type]
        assert exp.total_years == 0.0

    def test_experience_is_none(self):
        exp = ResumeExperience.from_structured_resume({"experience": None})
        assert exp.total_years == 0.0

    def test_experience_is_empty_dict(self):
        exp = ResumeExperience.from_structured_resume({"experience": {}})
        assert exp.total_years == 0.0
        assert exp.seniority_level == ""

    def test_total_years_is_null_string(self):
        exp = ResumeExperience.from_structured_resume(
            {"experience": {"total_years": None, "seniority_level": "mid"}}
        )
        assert exp.total_years == 0.0

    def test_total_years_is_invalid_string(self):
        exp = ResumeExperience.from_structured_resume(
            {"experience": {"total_years": "unknown"}}
        )
        assert exp.total_years == 0.0


# ===========================================================================
# 5. BandClassifier._from_seniority -- known labels
# ===========================================================================

class TestBandClassifierFromSeniority:
    clf = BandClassifier()

    @pytest.mark.parametrize("seniority,expected", [
        ("intern",    CandidateBand.FRESHER),
        ("junior",    CandidateBand.FRESHER),
        ("fresher",   CandidateBand.FRESHER),
        ("entry",     CandidateBand.FRESHER),
        ("trainee",   CandidateBand.FRESHER),
        ("graduate",  CandidateBand.FRESHER),
        ("mid",       CandidateBand.MID),
        ("senior",    CandidateBand.EXPERIENCED),
        ("lead",      CandidateBand.EXPERIENCED),
        ("manager",   CandidateBand.EXPERIENCED),
        ("staff",     CandidateBand.SENIOR),
        ("principal", CandidateBand.SENIOR),
        ("architect", CandidateBand.SENIOR),
        ("vp",        CandidateBand.SENIOR),
        ("director",  CandidateBand.SENIOR),
    ])
    def test_known_seniority_labels(self, seniority, expected):
        assert self.clf._from_seniority(seniority) == expected

    def test_seniority_case_insensitive(self):
        assert self.clf._from_seniority("INTERN") == CandidateBand.FRESHER
        assert self.clf._from_seniority("Senior") == CandidateBand.EXPERIENCED
        assert self.clf._from_seniority("MID") == CandidateBand.MID


# ===========================================================================
# 6. BandClassifier._from_seniority -- unknown / empty labels
# ===========================================================================

class TestBandClassifierFromSeniorityUnknown:
    clf = BandClassifier()

    def test_empty_string_returns_none(self):
        assert self.clf._from_seniority("") is None

    def test_unknown_label_returns_none(self):
        assert self.clf._from_seniority("rockstar") is None
        assert self.clf._from_seniority("experienced") is None  # not in map

    def test_none_input_handled_gracefully(self):
        # _from_seniority expects a str, but guard against accidental None
        assert self.clf._from_seniority("") is None


# ===========================================================================
# 7. BandClassifier._from_years -- boundary values (bisect correctness)
# ===========================================================================

class TestBandClassifierFromYears:
    clf = BandClassifier()

    @pytest.mark.parametrize("years,expected", [
        (0.0,   CandidateBand.FRESHER),
        (0.33,  CandidateBand.FRESHER),   # Tulasi
        (1.0,   CandidateBand.FRESHER),
        (1.49,  CandidateBand.FRESHER),   # just below boundary
        (1.5,   CandidateBand.MID),       # exactly at boundary → MID
        (2.0,   CandidateBand.MID),
        (3.9,   CandidateBand.MID),
        (4.0,   CandidateBand.EXPERIENCED),  # exactly at boundary → EXPERIENCED
        (5.0,   CandidateBand.EXPERIENCED),
        (7.9,   CandidateBand.EXPERIENCED),
        (8.0,   CandidateBand.SENIOR),    # exactly at boundary → SENIOR
        (10.0,  CandidateBand.SENIOR),
        (25.0,  CandidateBand.SENIOR),
    ])
    def test_year_to_band(self, years, expected):
        assert self.clf._from_years(years) == expected


# ===========================================================================
# 8. BandClassifier._apply_hard_floor
# ===========================================================================

class TestBandClassifierHardFloor:
    clf = BandClassifier()

    def _exp(self, years: float, seniority: str = "") -> ResumeExperience:
        return ResumeExperience(total_years=years, seniority_level=seniority)

    def test_intern_seniority_caps_to_fresher_regardless_of_years(self):
        # intern with 5 years (impossible but should be safe)
        result = self.clf._apply_hard_floor(CandidateBand.EXPERIENCED, self._exp(5.0, "intern"))
        assert result == CandidateBand.FRESHER

    def test_fresher_seniority_caps_to_fresher(self):
        result = self.clf._apply_hard_floor(CandidateBand.MID, self._exp(2.0, "fresher"))
        assert result == CandidateBand.FRESHER

    def test_trainee_seniority_caps_to_fresher(self):
        result = self.clf._apply_hard_floor(CandidateBand.MID, self._exp(3.0, "trainee"))
        assert result == CandidateBand.FRESHER

    def test_years_below_threshold_caps_to_fresher(self):
        result = self.clf._apply_hard_floor(CandidateBand.SENIOR, self._exp(0.5))
        assert result == CandidateBand.FRESHER

    def test_years_exactly_at_threshold_not_capped(self):
        # 1.5 is NOT below 1.5 → hard floor does not fire
        result = self.clf._apply_hard_floor(CandidateBand.MID, self._exp(1.5))
        assert result == CandidateBand.MID

    def test_normal_senior_not_affected(self):
        result = self.clf._apply_hard_floor(CandidateBand.EXPERIENCED, self._exp(7.0, "senior"))
        assert result == CandidateBand.EXPERIENCED


# ===========================================================================
# 9. BandClassifier.classify -- end-to-end decision priority
# ===========================================================================

class TestBandClassifierClassify:
    clf = BandClassifier()

    def _exp(self, years: float, seniority: str = "") -> ResumeExperience:
        return ResumeExperience(total_years=years, seniority_level=seniority)

    # -- Seniority as primary signal --

    def test_seniority_wins_over_years_when_both_present_intern(self):
        # seniority=intern wins; years=0.33 matches too; both → fresher
        result = self.clf.classify(self._exp(0.33, "intern"))
        assert result == CandidateBand.FRESHER

    def test_seniority_mid_with_low_years(self):
        # seniority=mid is picked; hard floor (years=0.5) overrides → fresher
        result = self.clf.classify(self._exp(0.5, "mid"))
        assert result == CandidateBand.FRESHER

    def test_seniority_senior_with_normal_years(self):
        result = self.clf.classify(self._exp(6.0, "senior"))
        assert result == CandidateBand.EXPERIENCED

    def test_seniority_lead_maps_to_experienced(self):
        result = self.clf.classify(self._exp(7.0, "lead"))
        assert result == CandidateBand.EXPERIENCED

    def test_seniority_staff_maps_to_senior(self):
        result = self.clf.classify(self._exp(9.0, "staff"))
        assert result == CandidateBand.SENIOR

    # -- Year fallback (no seniority) --

    def test_no_seniority_low_years_fresher(self):
        result = self.clf.classify(self._exp(1.0))
        assert result == CandidateBand.FRESHER

    def test_no_seniority_mid_years(self):
        result = self.clf.classify(self._exp(2.5))
        assert result == CandidateBand.MID

    def test_no_seniority_experienced_years(self):
        result = self.clf.classify(self._exp(5.0))
        assert result == CandidateBand.EXPERIENCED

    def test_no_seniority_senior_years(self):
        result = self.clf.classify(self._exp(12.0))
        assert result == CandidateBand.SENIOR

    # -- Hard floor always last --

    def test_hard_floor_with_unknown_seniority_and_low_years(self):
        # "rockstar" is not in map → falls back to years (0.1) → FRESHER
        result = self.clf.classify(self._exp(0.1, "rockstar"))
        assert result == CandidateBand.FRESHER


# ===========================================================================
# 10. classify_band() -- public API contract & return types
# ===========================================================================

class TestClassifyBandPublicAPI:

    def test_returns_3_tuple(self):
        result = classify_band({"experience": {"total_years": 3.0, "seniority_level": "mid"}})
        assert isinstance(result, tuple)
        assert len(result) == 3

    def test_band_str_is_string(self):
        band_str, _, _ = classify_band({"experience": {"total_years": 3.0, "seniority_level": "mid"}})
        assert isinstance(band_str, str)

    def test_total_years_is_float(self):
        _, total_years, _ = classify_band({"experience": {"total_years": 3.0}})
        assert isinstance(total_years, float)

    def test_seniority_is_string(self):
        _, _, seniority = classify_band({"experience": {"seniority_level": "mid"}})
        assert isinstance(seniority, str)

    @pytest.mark.parametrize("band_str", ["fresher", "mid", "experienced", "senior"])
    def test_all_valid_band_strings(self, band_str):
        """classify_band must only ever return one of the 4 valid strings."""
        result_str, _, _ = classify_band({"experience": {}})
        assert result_str in {"fresher", "mid", "experienced", "senior"}

    def test_empty_resume_returns_fresher(self):
        band_str, total_years, seniority = classify_band({})
        assert band_str == "fresher"
        assert total_years == 0.0
        assert seniority == ""

    def test_nested_parsed_shape_works(self):
        resume = {
            "source": "pdf",
            "parsed": {"experience": {"total_years": 5.0, "seniority_level": "senior"}}
        }
        band_str, total_years, seniority = classify_band(resume)
        assert band_str == "experienced"
        assert total_years == 5.0
        assert seniority == "senior"


# ===========================================================================
# 11. Tulasi regression test -- the bug that triggered this refactor
# ===========================================================================

class TestTulasiRegression:
    """Tulasi D. Prasad: intern, 4 months total experience.
    Was incorrectly getting 'mid' band because only the job title was used.
    Must now always get 'fresher'.
    """

    TULASI_RESUME = {
        "source": "resume",
        "parsed": {
            "experience": {
                "total_years": 0.33,
                "total_months": 4,
                "seniority_level": "intern",
                "seniority_reason": "Only one internship role of 4 months duration, no full-time professional experience listed",
            }
        }
    }

    def test_tulasi_band_is_fresher(self):
        band_str, _, _ = classify_band(self.TULASI_RESUME)
        assert band_str == "fresher", (
            f"Expected 'fresher' for Tulasi (intern, 0.33yr) but got '{band_str}'"
        )

    def test_tulasi_total_years_extracted_correctly(self):
        _, total_years, _ = classify_band(self.TULASI_RESUME)
        assert total_years == pytest.approx(0.33)

    def test_tulasi_seniority_extracted_correctly(self):
        _, _, seniority = classify_band(self.TULASI_RESUME)
        assert seniority == "intern"

    def test_tulasi_band_object_is_fresher(self):
        exp = ResumeExperience.from_structured_resume(self.TULASI_RESUME)
        clf = BandClassifier()
        band = clf.classify(exp)
        assert band == CandidateBand.FRESHER
        assert band < CandidateBand.MID  # confirms ordering is enforced


# ===========================================================================
# 12. Edge cases
# ===========================================================================

class TestEdgeCases:

    def test_zero_years_fresher(self):
        band_str, _, _ = classify_band({"experience": {"total_years": 0}})
        assert band_str == "fresher"

    def test_very_high_years_senior(self):
        band_str, _, _ = classify_band({"experience": {"total_years": 40.0}})
        assert band_str == "senior"

    def test_none_resume_graceful(self):
        band_str, total_years, seniority = classify_band(None)  # type: ignore[arg-type]
        assert band_str == "fresher"
        assert total_years == 0.0

    def test_string_years_coerced(self):
        # Some older parsers store total_years as "5.0" string
        band_str, total_years, _ = classify_band({"experience": {"total_years": "5.0", "seniority_level": ""}})
        assert total_years == pytest.approx(5.0)
        assert band_str == "experienced"

    def test_all_four_bands_reachable(self):
        """Every band must be reachable through the public API."""
        cases = [
            ({"experience": {"total_years": 0.33, "seniority_level": "intern"}}, "fresher"),
            ({"experience": {"total_years": 2.0,  "seniority_level": "mid"}},    "mid"),
            ({"experience": {"total_years": 6.0,  "seniority_level": "senior"}}, "experienced"),
            ({"experience": {"total_years": 10.0, "seniority_level": "staff"}},  "senior"),
        ]
        for resume, expected in cases:
            band_str, _, _ = classify_band(resume)
            assert band_str == expected, f"Expected {expected!r} for {resume}, got {band_str!r}"
