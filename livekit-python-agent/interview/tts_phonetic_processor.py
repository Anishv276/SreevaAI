"""
tts_phonetic_processor.py
=========================
Client-side phonetic transform for TTS providers that lack server-side
text normalization (primarily Cartesia).

Sarvam bulbul:v3 does NOT need this — its enable_preprocessing is always on
and the sarvam_pronunciation_dict.py module pushes custom pronunciations via
the dict_id API. Running client-side transforms on Sarvam text causes
double-normalization and is the root cause of the "m-i-n-u-t-e-s" bug.

The transform() method is still called for every provider through
_tts_acronym_transform in agent_runtime_helpers.py. For Sarvam sessions
tts_phonetic_processor.transform() is a near-no-op (only static_rules fire,
and those are the 10 highest-priority terms that Sarvam also mispronounces).
"""
import re
from typing import List, Set
from pydantic import BaseModel, Field, ConfigDict


class PhoneticRule(BaseModel):
    pattern_str: str = Field(..., description="Regex pattern string to match")
    replacement: str = Field(..., description="Phonetic replacement string")

    @property
    def pattern(self) -> re.Pattern:
        return re.compile(self.pattern_str, re.IGNORECASE)


class TTSPhoneticProcessor(BaseModel):
    """Lightweight rule-based text transform for Cartesia TTS.

    static_rules  — always applied; covers the top mispronounced tech terms.
    dynamic_rules — per-session terms added from resume/JD extraction.

    For Sarvam sessions, pronunciation is handled server-side via dict_id.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)
    static_rules: List[PhoneticRule] = Field(default_factory=list)
    dynamic_rules: List[PhoneticRule] = Field(default_factory=list)
    _registered: Set[str] = set()

    def model_post_init(self, __context: object) -> None:
        object.__setattr__(self, "_registered", set())

    def initialize_defaults(self) -> "TTSPhoneticProcessor":
        """Load the static rules that cover the most common Cartesia mispronunciations."""
        self.static_rules = [
            # Common acronyms -- plural before singular so "APIs" matches before "API"
            # Uses re.IGNORECASE so both "api" and "API" are caught.
            PhoneticRule(pattern_str=r"\bAPIs\b",          replacement="A P I s"),
            PhoneticRule(pattern_str=r"\bAPI\b",           replacement="A P I"),
            PhoneticRule(pattern_str=r"\bURLs\b",          replacement="U R L s"),
            PhoneticRule(pattern_str=r"\bURL\b",           replacement="U R L"),
            # These are terms Cartesia sonic-3 consistently gets wrong
            PhoneticRule(pattern_str=r"\bkubernetes\b",    replacement="koo ber neh teez"),
            PhoneticRule(pattern_str=r"\bkubectl\b",       replacement="kube control"),
            PhoneticRule(pattern_str=r"\bnginx\b",         replacement="engine x"),
            PhoneticRule(pattern_str=r"\btraefik\b",       replacement="traf ik"),
            PhoneticRule(pattern_str=r"\bSQL\b",           replacement="sequel"),
            PhoneticRule(pattern_str=r"\bNoSQL\b",         replacement="no sequel"),
            PhoneticRule(pattern_str=r"\bGraphQL\b",       replacement="graph Q L"),
            PhoneticRule(pattern_str=r"\bSaaS\b",          replacement="sass"),
            PhoneticRule(pattern_str=r"\bDevOps\b",        replacement="dev ops"),
            PhoneticRule(pattern_str=r"\bYAML\b",          replacement="yam ul"),
            PhoneticRule(pattern_str=r"\bJSON\b",          replacement="jay son"),
            PhoneticRule(pattern_str=r"\bvite\b",          replacement="veet"),
            PhoneticRule(pattern_str=r"\bDjango\b",        replacement="jango"),
            PhoneticRule(pattern_str=r"\bLiveKit\b",       replacement="Live Kit"),
            PhoneticRule(pattern_str=r"\bpnpm\b",          replacement="P N P M"),
            PhoneticRule(pattern_str=r"\bvercel\b",        replacement="ver sel"),
            PhoneticRule(pattern_str=r"\bazure\b",         replacement="ay zhur"),
            PhoneticRule(pattern_str=r"\bpyTorch\b",       replacement="pie torch"),
            PhoneticRule(pattern_str=r"\bnumpy\b",         replacement="num pie"),
            PhoneticRule(pattern_str=r"\bscipy\b",         replacement="sigh pie"),
        ]
        return self

    def add_keywords(self, terms: list[str]) -> "TTSPhoneticProcessor":
        """Register per-session phonetic rules for tech terms from resume/JD.

        Only adds a rule when the term has a known pronunciation in the
        _PRONUNCIATIONS table from sarvam_pronunciation_dict — we re-use that
        as the single source of truth to avoid drift between client and server.
        """
        try:
            from interview.sarvam_pronunciation_dict import _PRONUNCIATIONS
        except ImportError:
            return self

        for term in terms:
            key = term.strip().lower()
            if not key or key in self._registered:
                continue
            replacement = _PRONUNCIATIONS.get(key)
            if replacement is None:
                self._registered.add(key)
                continue
            pattern_str = rf"(?<!\w){re.escape(term.strip())}(?!\w)"
            self.dynamic_rules.append(
                PhoneticRule(pattern_str=pattern_str, replacement=replacement)
            )
            self._registered.add(key)
        return self

    def add_tools(self, tools: list[str]) -> "TTSPhoneticProcessor":
        return self.add_keywords(tools)

    def transform(self, text: str) -> str:
        """Apply static + dynamic rules. No ALL-CAPS fallback speller — that caused the bug."""
        if not text:
            return ""
        result = text
        for rule in self.static_rules + self.dynamic_rules:
            result = rule.pattern.sub(rule.replacement, result)
        return result
