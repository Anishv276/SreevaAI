"""
trap_question.py
─────────────────
Generates a single false-premise "trap" question from the interview
transcript-so-far, and later classifies whether the candidate caught the
false premise or went along with it.

Fires when LiveTrapScore's suspicion score reaches its threshold (see
live_trap_score.py). The question deliberately misattributes something the
candidate did NOT say (e.g. claims they used Redis when they actually said
Postgres) to test whether they're paying attention to their own answers or
reading from a script/assistant.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Optional

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

_GENERATE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "trap_question_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "The trap question to ask, in the interviewer's spoken voice.",
                },
                "false_premise": {
                    "type": "string",
                    "description": "The specific false claim embedded in the question (what was actually said vs. what the question claims).",
                },
            },
            "required": ["question", "false_premise"],
            "additionalProperties": False,
        },
    },
}

_GENERATE_SYSTEM_PROMPT = (
    "You are an expert technical interviewer. You suspect the candidate may be reading answers "
    "from an AI assistant rather than speaking from real experience. Your job is to construct ONE "
    "trap question that embeds a FALSE PREMISE about something specific the candidate said earlier "
    "in this transcript, or about their resume/JD.\n\n"
    "RULES:\n"
    "1. Pick a concrete, specific technical detail the candidate actually stated (a tool, library, "
    "language, architecture choice, number, or project detail).\n"
    "2. Rewrite it as a confident but WRONG restatement — swap it for something plausible-sounding "
    "but different (e.g. they said Postgres, you claim they said Redis; they said Java, you claim Python).\n"
    "3. Phrase it exactly as a real interviewer would say it out loud, referencing the earlier answer "
    "naturally, e.g. \"Earlier you mentioned using Redis for your worker queue — can you walk me through "
    "why you chose that over alternatives?\"\n"
    "4. Do NOT pick a trivial/ambiguous detail. Pick something a candidate who actually did the work "
    "would immediately notice is wrong.\n"
    "5. Keep it short — one or two sentences, conversational, not a monologue.\n"
    "Output ONLY valid JSON matching the required schema."
)

_CLASSIFY_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "trap_classification_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "caught_the_trap": {
                    "type": "boolean",
                    "description": "True if the candidate corrected/pushed back on the false premise, false if they went along with it.",
                },
                "reason": {
                    "type": "string",
                    "description": "One sentence explaining the classification.",
                },
            },
            "required": ["caught_the_trap", "reason"],
            "additionalProperties": False,
        },
    },
}

_CLASSIFY_SYSTEM_PROMPT = (
    "You are grading whether a candidate caught a deliberately false premise embedded in an "
    "interview question. Given the false premise that was planted and the candidate's reply, decide: "
    "did they correct it / say 'that's not what I said' / clarify the real detail (caught_the_trap=true), "
    "or did they accept the false premise and answer as if it were true (caught_the_trap=false)? "
    "A partial correction (e.g. 'well, sort of, but actually...') still counts as caught."
)


@dataclass(frozen=True)
class TrapQuestionResult:
    question: str
    false_premise: str


@dataclass(frozen=True)
class TrapClassificationResult:
    caught_the_trap: bool
    reason: str


def _get_client(client: Optional[AsyncOpenAI]) -> AsyncOpenAI:
    if client is not None:
        return client
    try:
        from interview.agent_runtime import _SHARED_OPENAI_CLIENT
        return _SHARED_OPENAI_CLIENT
    except (ImportError, AttributeError):
        return AsyncOpenAI()


async def generate_trap_question(
    transcript_lines: list[str],
    resume: Any = None,
    jd_skills: Any = None,
    client: Optional[AsyncOpenAI] = None,
    model: str = "gpt-4o-mini",
) -> Optional[TrapQuestionResult]:
    """Generate one trap question from the transcript so far. Returns None on failure."""
    if not transcript_lines:
        return None
    transcript_text = "\n".join(transcript_lines[-60:])  # cap context, most-recent-relevant
    user_content = (
        f"Interview transcript so far:\n{transcript_text}\n\n"
        f"Resume (structured): {json.dumps(resume)[:2000] if resume else '(unavailable)'}\n"
        f"JD required skills: {json.dumps(jd_skills)[:1000] if jd_skills else '(unavailable)'}\n\n"
        "Generate one trap question per the rules."
    )
    try:
        resp = await _get_client(client).chat.completions.create(
            model=model,
            temperature=0.4,
            max_tokens=300,
            response_format=_GENERATE_SCHEMA,
            messages=[
                {"role": "system", "content": _GENERATE_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        question = str(data.get("question", "")).strip()
        false_premise = str(data.get("false_premise", "")).strip()
        if not question:
            return None
        return TrapQuestionResult(question=question, false_premise=false_premise)
    except Exception as e:
        logger.warning("[TRAP_QUESTION] Generation failed: %s", e)
        return None


async def classify_trap_answer(
    false_premise: str,
    candidate_answer: str,
    client: Optional[AsyncOpenAI] = None,
    model: str = "gpt-4o-mini",
) -> TrapClassificationResult:
    """Classify whether the candidate caught the planted false premise. Fails safe to 'caught'."""
    user_content = (
        f"Planted false premise: {false_premise}\n"
        f"Candidate's reply: \"{candidate_answer}\"\n\n"
        "Did the candidate catch the false premise?"
    )
    try:
        resp = await _get_client(client).chat.completions.create(
            model=model,
            temperature=0.1,
            max_tokens=150,
            response_format=_CLASSIFY_SCHEMA,
            messages=[
                {"role": "system", "content": _CLASSIFY_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        return TrapClassificationResult(
            caught_the_trap=bool(data.get("caught_the_trap", True)),
            reason=str(data.get("reason", "")).strip(),
        )
    except Exception as e:
        logger.warning("[TRAP_QUESTION] Classification failed, assuming caught (fail-safe): %s", e)
        return TrapClassificationResult(caught_the_trap=True, reason=f"Classification failed ({e}), assumed caught.")
