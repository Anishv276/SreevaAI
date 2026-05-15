"""
utils.py — SkillManager: fast, reusable skill normalisation.

WHY THIS CLASS EXISTS:
    extract_pdf.py had a standalone normalize_skill() that rebuilt a 200-key
    alias dict on every single call.  SkillManager builds the dict ONCE at
    import time and exposes O(1) lookups for the rest of the pipeline.
"""

from __future__ import annotations

import re
from functools import lru_cache

from extraction_resume_JD_score_report.config import SKILL_ALIASES, TRANSFERABLE_SKILLS


class SkillManager:
    """
    Centralised skill normalisation and transferability checks.

    Usage:
        sm = SkillManager()
        sm.normalize("ReactJS")        -> "react"
        sm.is_transferable("k8s", "docker")  -> True
    """

    def normalize(self, skill: str) -> str:
        """
        Return the canonical key for a skill name.

        Steps (same logic as the old normalize_skill function):
          1. Lowercase + strip
          2. Remove trailing .js / js
          3. Remove punctuation, spaces, version numbers
          4. Alias lookup — if no alias, return the cleaned string
        """
        if not skill:
            return ""
        s = skill.lower().strip()
        s = re.sub(r"\.js$", "", s)
        s = re.sub(r"js$", "", s)
        s = re.sub(r"[.\-\_\s\/\(\)]", "", s)
        s = re.sub(r"\d+$", "", s)          # strip trailing version: python3 -> python
        return SKILL_ALIASES.get(s, s)

    def normalize_set(self, skills: list[str]) -> set[str]:
        """Return a set of canonical skill keys from a list."""
        return {self.normalize(s) for s in skills if s}

    def is_transferable(self, required: str, candidate_skill: str) -> bool:
        """Return True if candidate_skill is a recognised substitute for required."""
        transferables = TRANSFERABLE_SKILLS.get(required, [])
        return candidate_skill in transferables

    def get_transferables(self, required: str) -> list[str]:
        """Return the list of skills that can substitute for required."""
        return TRANSFERABLE_SKILLS.get(required, [])


# ---------------------------------------------------------------------------
# Module-level singleton — import and use directly.
# ---------------------------------------------------------------------------
skill_manager = SkillManager()


# ---------------------------------------------------------------------------
# JD post-processing helpers (ported from extract_pdf.py)
# ---------------------------------------------------------------------------

def _as_dict(value) -> dict:
    """
    Safely coerce a value to a dict.
    Handles raw dicts, JSON strings, and invalid values.
    """
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        import json
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _normalise_jd_weights(jd_data: dict) -> dict:
    """Largest-remainder normalisation so JD criteria weights always sum to 100."""
    criteria = jd_data.get("criteria", [])
    if not criteria:
        return jd_data
    raw = [max(c.get("weight", 0), 1) for c in criteria]
    total = sum(raw)
    if total == 0 or len(raw) > 100:
        return jd_data
    scale = 100.0 / total
    scaled_float = [w * scale for w in raw]
    scaled = [max(1, int(w)) for w in scaled_float]
    diff = 100 - sum(scaled)
    order = sorted(range(len(scaled_float)), key=lambda i: (scaled_float[i] - int(scaled_float[i]), raw[i]), reverse=True)
    for i in order:
        if diff == 0:
            break
        if diff > 0:
            scaled[i] += 1
            diff -= 1
        elif scaled[i] > 1:
            scaled[i] -= 1
            diff += 1
    for c, w in zip(criteria, scaled):
        c["weight"] = w
    jd_data["criteria"] = criteria
    return jd_data


def _postprocess_jd_output(jd_data) -> dict:
    """
    Normalize extracted JD JSON before scoring.
    Ensures scoring_hints keys always exist and weights sum to 100.
    """
    if not isinstance(jd_data, dict):
        return {}
    jd_data = _normalise_jd_weights(jd_data)
    hints = jd_data.get("scoring_hints")
    if not isinstance(hints, dict):
        hints = {}
    hints.setdefault("green_flags_to_reward", [])
    hints.setdefault("red_flags_to_watch", [])
    jd_data["scoring_hints"] = hints
    return jd_data


# ---------------------------------------------------------------------------
# Backwards-compatible function so any code that imported normalize_skill
# directly from extract_pdf still works during migration.
def normalize_skill(skill: str) -> str:
    """Drop-in replacement for the old normalize_skill() global function."""
    return skill_manager.normalize(skill)
