"""
linguistic_analyzer.py
───────────────────────
Real-time background linguistic & teleprompter detection analyzer for spoken candidate responses.

Analyzes STT output per turn to detect candidates reading off LLM responses (ChatGPT / Teleprompter).
Key signals extracted:
  1. Filler Word Absence  - Absence of natural spoken fillers ("um", "uh", "like", "you know") in long/complex explanations.
  2. Structural Perfection - Unnaturally rigid essay structure ("firstly", "secondly", "in conclusion") vs human non-linear discourse.
  3. Hedging Absence       - Lack of natural human conversational hedges ("I think", "probably", "in my experience").
  4. Stock AI Vocabulary   - Spoken presence of LLM buzzwords ("delve", "furthermore", "robust", "crucial role", "testament").
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Callable, Literal, Optional

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# --- Common Buzzword & Structural Regexes ------------------------------------

_FILLER_WORDS_RE = re.compile(
    r"\b(um|uh|er|like|you know|i mean|kind of|sort of|basically|well)\b",
    re.IGNORECASE,
)

_STOCK_AI_WORDS_RE = re.compile(
    r"\b(delve|delves|furthermore|moreover|in conclusion|crucial role|testament|"
    r"robust|it is worth noting|leverage|leveraging|seamlessly|tapestry|holistic|"
    r"paramount|imperative|pivotal|synergy|spearhead|fostering)\b",
    re.IGNORECASE,
)

_STRUCTURAL_MARKERS_RE = re.compile(
    r"\b(firstly|secondly|thirdly|finally|in summary|to summarize|on one hand|on the other hand)\b",
    re.IGNORECASE,
)

_HEDGING_MARKERS_RE = re.compile(
    r"\b(i think|probably|in my experience|usually|i believe|from what i recall|i assume|i guess|maybe)\b",
    re.IGNORECASE,
)

_BACKTRACK_MARKERS_RE = re.compile(
    r"\b(wait|actually|let me rephrase|sorry|i meant|rather|correction)\b",
    re.IGNORECASE,
)


# Single flat rate is applied to live_trap_score for any suspicious result —
# no low/medium/high buckets. Matches the prompt's own scoring bands below,
# where 50-69 is already "moderate teleprompter indicators".
SUSPICIOUS_THRESHOLD = 50


@dataclass(frozen=True)
class LinguisticEvalResult:
    score: int  # 0-100 (0 = clean human speech, 100 = blatant AI reading)
    is_suspicious: bool
    confidence: Literal["NONE", "LOW", "MEDIUM", "HIGH"]
    signals: list[str]
    reason: str


_LINGUISTIC_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "linguistic_eval_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "robotic_phrasing_score": {
                    "type": "integer",
                    "description": "Score 0-100 on whether text reads like teleprompter/LLM response spoken aloud.",
                },
                "teleprompter_confidence": {
                    "type": "string",
                    "enum": ["NONE", "LOW", "MEDIUM", "HIGH"],
                    "description": "Confidence level in teleprompter flag.",
                },
                "detected_signals": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of specific linguistic anomalies observed.",
                },
                "reason": {
                    "type": "string",
                    "description": "Brief 1-2 sentence justification.",
                },
            },
            "required": [
                "robotic_phrasing_score",
                "teleprompter_confidence",
                "detected_signals",
                "reason",
            ],
            "additionalProperties": False,
        },
    },
}

_SYSTEM_PROMPT = (
    "You are an expert speech and linguistic analyst evaluating candidate spoken answers in a live interview.\n"
    "Your objective is to detect if the candidate is READING an AI-generated answer (e.g. from ChatGPT on a screen/teleprompter) "
    "rather than speaking spontaneously from memory.\n\n"
    "GOVERNING PRINCIPLE — PRESUMPTION OF INNOCENCE:\n"
    "An articulate, fluent, well-structured, or non-native English candidate is NOT a cheater. "
    "Spoken formal grammar and technical jargon are completely normal. Do NOT flag a candidate for being articulate or organized.\n\n"
    "WHAT TO LOOK FOR (TELEPROMPTER / AI READ TELLS):\n"
    "1. COMPLETE ABSENCE OF NATURAL DISFLUENCY: Real spoken answers to technical questions almost always contain fillers "
    "('um', 'uh', 'so', 'like', 'you know') or small pauses. A long 40+ word complex technical explanation with ZERO disfluencies is suspicious.\n"
    "2. ESSAY/BULLET CADENCE: Spoken answers with rigid essay transitions ('firstly...', 'secondly...', 'in conclusion...') that people rarely speak live.\n"
    "3. STOCK AI VOCABULARY: Words characteristic of LLM outputs ('delve', 'furthermore', 'crucial role', 'testament', 'robust', 'holistic').\n"
    "4. ABSENCE OF HEDGING / BACKTRACKING: Natural speakers backtrack ('wait, I meant X') or hedge ('I think', 'in my experience'). Teleprompter reads deliver flawless linear prose.\n"
    "5. FLAT RESPONSE LATENCY: AI-copilot tools (audio capture -> LLM -> read) tend to produce a consistent ~3-5s "
    "delay before the candidate starts speaking, REGARDLESS of question difficulty. A human's latency varies with "
    "difficulty -- fast on easy/rehearsed questions, slower on hard ones. Only treat latency as a signal when it is "
    "reported AND combined with other tells above; a single latency number alone is weak evidence (many honest "
    "candidates pause to think).\n"
    "6. BASELINE DRIFT: If given this candidate's own earlier filler ratio, a sudden drop to near-zero on THIS "
    "answer (especially on a harder question) is more suspicious than an absolute low filler count, since some "
    "candidates are naturally fluent throughout.\n\n"
    "SCORING GUIDELINES:\n"
    "- 0-25: Clean human speech (has fillers, conversational tone, or short answer).\n"
    "- 26-49: Minor polish, articulate delivery (innocent/no flag).\n"
    "- 50-69: Moderate teleprompter indicators (multiple stock AI phrases or zero fillers in a long detailed answer).\n"
    "- 70-100: Strong teleprompter read (zero fillers + stock AI transitions + essay cadence in long text).\n\n"
    "Output ONLY valid JSON matching the required schema."
)


class LinguisticAnalyzer:
    """Asynchronous per-turn linguistic analyzer."""

    def __init__(self, client: Optional[AsyncOpenAI] = None) -> None:
        self._client = client

    def _get_client(self) -> AsyncOpenAI:
        if self._client is not None:
            return self._client
        # Import shared client if available
        try:
            from interview.agent_runtime import _SHARED_OPENAI_CLIENT
            return _SHARED_OPENAI_CLIENT
        except (ImportError, AttributeError):
            return AsyncOpenAI()

    @staticmethod
    def extract_heuristics(text: str) -> dict[str, Any]:
        cleaned = (text or "").strip()
        words = cleaned.split()
        n_words = len(words)

        fillers = _FILLER_WORDS_RE.findall(cleaned)
        stock_ai = _STOCK_AI_WORDS_RE.findall(cleaned)
        structural = _STRUCTURAL_MARKERS_RE.findall(cleaned)
        hedging = _HEDGING_MARKERS_RE.findall(cleaned)
        backtrack = _BACKTRACK_MARKERS_RE.findall(cleaned)

        return {
            "n_words": n_words,
            "n_fillers": len(fillers),
            "filler_ratio": round(len(fillers) / max(1, n_words), 3),
            "stock_ai_words": [w.lower() for w in stock_ai],
            "structural_markers": [w.lower() for w in structural],
            "hedging_markers": [w.lower() for w in hedging],
            "backtrack_markers": [w.lower() for w in backtrack],
        }

    async def analyze_async(
        self,
        candidate_text: str,
        question_text: str = "",
        model: str = "gpt-4.1-mini",
        response_latency_sec: Optional[float] = None,
        baseline_filler_ratio: Optional[float] = None,
        usage_sink: Optional[Callable[[dict[str, Any]], None]] = None,
    ) -> LinguisticEvalResult:
        heuristics = self.extract_heuristics(candidate_text)
        n_words = heuristics["n_words"]

        # Fast gate: answers under 15 words cannot be reliably flagged as AI speech
        if n_words < 15:
            return LinguisticEvalResult(
                score=0,
                is_suspicious=False,
                confidence="NONE",
                signals=[],
                reason="Answer too short (<15 words) for linguistic evaluation.",
            )

        # Build prompt incorporating pre-extracted metrics
        latency_line = ""
        if response_latency_sec is not None:
            latency_line = f"- Response Latency (question end -> candidate started speaking): {response_latency_sec:.1f}s\n"
        baseline_line = ""
        if baseline_filler_ratio is not None:
            baseline_line = (
                f"- This Candidate's Own Baseline Filler Ratio (earlier answers): {baseline_filler_ratio:.3f} "
                f"(compare against this answer's {heuristics['filler_ratio']} -- a sudden drop for THIS candidate "
                f"is a stronger signal than a fixed absolute bar, since some people are naturally fluent)\n"
            )
        user_content = (
            f"Question Asked: {question_text or '(context unavailable)'}\n"
            f"Candidate Spoken Answer ({n_words} words):\n\"{candidate_text}\"\n\n"
            f"Automated Heuristics Snapshot:\n"
            f"- Word Count: {n_words}\n"
            f"- Filler Count: {heuristics['n_fillers']} (ratio: {heuristics['filler_ratio']})\n"
            f"- Stock AI Vocabulary Found: {heuristics['stock_ai_words'] or 'none'}\n"
            f"- Structural Transitions Found: {heuristics['structural_markers'] or 'none'}\n"
            f"- Conversational Hedges Found: {heuristics['hedging_markers'] or 'none'}\n"
            f"- Backtrack/Self-Corrections: {heuristics['backtrack_markers'] or 'none'}\n"
            f"{latency_line}{baseline_line}"
        )

        try:
            client = self._get_client()
            resp = await client.chat.completions.create(
                model=model,
                temperature=0.1,
                max_tokens=250,
                response_format=_LINGUISTIC_JSON_SCHEMA,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
            )
            if usage_sink is not None:
                from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
                billing_usage = _extract_usage(resp, model)
                if billing_usage["inputTokens"] or billing_usage["outputTokens"] or billing_usage["cachedInputTokens"]:
                    usage_sink(billing_usage)
            raw_content = resp.choices[0].message.content or "{}"
            data = json.loads(raw_content)

            score = max(0, min(100, int(data.get("robotic_phrasing_score", 0))))
            confidence = str(data.get("teleprompter_confidence", "NONE")).upper()
            if confidence not in ("NONE", "LOW", "MEDIUM", "HIGH"):
                confidence = "NONE"
            signals = [str(s) for s in data.get("detected_signals", []) if str(s)]
            reason = str(data.get("reason", "")).strip()

            # Single flat threshold, matching the prompt's own stated scoring
            # bands (50-69 = moderate, 70-100 = strong -> both count as suspicious).
            is_suspicious = score >= SUSPICIOUS_THRESHOLD

            return LinguisticEvalResult(
                score=score,
                is_suspicious=is_suspicious,
                confidence=confidence,  # type: ignore[arg-type]
                signals=signals,
                reason=reason,
            )

        except Exception as e:
            # No fallback: an LLM failure means no data, not a verdict. Skip
            # scoring this turn entirely rather than guessing from raw regex
            # counts (which flag ordinary technical words like "leverage").
            logger.warning("[LINGUISTIC_ANALYZER] Async analysis failed, skipping turn: %s", e)
            return LinguisticEvalResult(
                score=0,
                is_suspicious=False,
                confidence="NONE",
                signals=[],
                reason=f"Skipped: LLM call failed ({e})",
            )
