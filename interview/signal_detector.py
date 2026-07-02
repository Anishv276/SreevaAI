"""
signal_detector.py

Detects RESPONSE-LEVEL signals (denial, clarification, rephrase) using LLM.
These fire BEFORE answer scoring and determine if we even proceed to eval.

NOT to be confused with CONTENT signals (example_evaded, depth_ceiling_hit, etc)
which fire AFTER scoring and tell us what kind of probe to ask next.

Returns: response_signal, reason (or null if normal answer)
"""
import asyncio
import json
import logging
from typing import Optional
from openai import AsyncOpenAI

logger = logging.getLogger("interview-agent")
_SIGNAL_DETECT_MODEL = "gpt-4.1-mini"


# ---------------------------------------------------------------------------
# Response-Level Signals (fire BEFORE scoring)
# ---------------------------------------------------------------------------
RESPONSE_SIGNALS = {
    "pure_denial": {
        "description": "Candidate explicitly says they don't know/haven't done this. Zero attempt, no continuation.",
        "examples": [
            "Q: 'How have you handled version control?' A: 'I haven't done that'",
            "Q: 'Tell me about a DevOps project' A: 'I don't have DevOps experience'",
            "Q: 'What's your ML background?' A: 'I've never worked with ML'",
        ],
        "action": "MOVE_ON (forced_action=True)",
        "reasoning": "No signal to evaluate — candidate can't answer this topic.",
    },

    "denial_with_continuation": {
        "description": "Candidate starts with denial but then adds substantive content. Partial admission into real experience.",
        "examples": [
            "Q: 'Used Kubernetes?' A: 'Never hands-on, but I deployed via Helm scripts'",
            "Q: 'Sales experience?' A: 'Not B2B, but I sold SaaS products to SMBs'",
            "Q: 'ML background?' A: 'No formal training, but I built a RAG system'",
        ],
        "action": "CONTINUE TO EVAL (don't short-circuit, score normally)",
        "reasoning": "They DID something. Denial was scope-limited. Probe deeper.",
    },

    "clarification_request": {
        "description": "Candidate asks interviewer to repeat, rephrase, or clarify the question.",
        "examples": [
            "Q: 'Walk me through your architecture' A: 'Can you rephrase that? Do you mean the system design?'",
            "Q: 'How do you handle edge cases?' A: 'What do you mean by edge cases exactly?'",
            "A: 'Sorry, I didn't catch that. Can you repeat the question?'",
        ],
        "action": "REPHRASE (stay on same topic, ask again clearer)",
        "reasoning": "Question was unclear, not candidate incompetence. Re-ask.",
    },

    "rephrase_request": {
        "description": "Candidate asks permission to restate or restart their answer.",
        "examples": [
            "A: 'Sorry, let me say that again more clearly'",
            "A: 'Actually, I said that wrong. Let me rephrase'",
            "A: 'Wait, I think I misspoke. What I meant was...'",
        ],
        "action": "ACCEPT_REPHRASE (listen to the new answer instead)",
        "reasoning": "They caught themselves. Use the corrected version.",
    },

    "off_topic": {
        "description": "Candidate answered a different question than what was asked, or pivoted to unrelated topic.",
        "examples": [
            "Q: 'Tell me about a time you failed' A: 'I don't fail. My team always succeeds.'",
            "Q: 'API design tradeoffs?' A: 'I really love React and components'",
            "Q: 'Kubernetes scaling?' A: 'Actually I want to talk about my side project instead'",
        ],
        "action": "REDIRECT (ask the original question again)",
        "reasoning": "Candidate didn't engage with the actual question.",
    },
}


def _build_signal_detection_prompt() -> str:
    """
    Prompt for response-level signal detection.
    Runs FIRST, before answer scoring.
    """
    return """\
TASK: Detect if the candidate's response is a NORMAL ANSWER or a SPECIAL RESPONSE that changes how we proceed.

NORMAL ANSWER: The candidate engaged with the question and gave an answer (good, bad, or mediocre).
→ return signal=null, proceed to answer scoring.

SPECIAL RESPONSE: The candidate signaled something about their ability to answer, not the answer itself.
→ return the signal name, and proceed accordingly (no scoring for denial; rephrase for clarification, etc).

YOU ARE LOOKING FOR ONE OF THESE:

1. pure_denial: "I don't know", "I haven't done this", "No experience" — ONLY that, nothing else.
   - STOP if they say ANYTHING substantive after the denial. That is denial_with_continuation, not pure.
   - Examples: "I don't have DevOps experience" | "Never worked with Kubernetes"
   - NOT this: "I don't have K8s experience but I deployed things" (that's continuation)

2. denial_with_continuation: Starts with "I don't" or "Never" BUT then says what they DID try/do.
   - The denial is real, but followed by: "but I...", "however I...", "although not directly, I..."
   - Key: the continuation is SUBSTANTIVE — a real action, project, or skill they mention.
   - Examples: "No ML background, but I built a RAG" | "Never Kubernetes, but I used Docker Compose"
   - NOT this: "I don't know much" (no continuation) | "I don't know, but yeah" (continuation is hollow)

3. clarification_request: Candidate asks YOU to repeat, rephrase, or explain the question.
   - Exact signal: they didn't answer — they asked for help understanding.
   - Examples: "Can you rephrase that?" | "What do you mean by X?" | "Can you repeat?"
   - NOT this: "Let me rephrase my answer" (that is rephrase_request)

4. rephrase_request: Candidate says they want to restart or correct their OWN answer.
   - Exact signal: they're not satisfied with what they just said, they want a redo.
   - Examples: "Let me say that again" | "I misspoke, what I meant..." | "Actually, let me restart"
   - NOT this: "Can you rephrase the question?" (that's clarification_request)

5. off_topic: Candidate answered a different question, or pivoted away from what was asked.
   - Exact signal: the answer doesn't address the question.
   - Examples: Q: "K8s scaling?" A: "I love React" | Q: "Failed project?" A: "I don't fail"
   - NOT this: A partial answer that tries but misses some part (that's in scoring)

IF NONE OF THE ABOVE: signal = null. The candidate answered normally. Proceed to scoring.

OUTPUT JSON ONLY:
{
  "signal": one of ["pure_denial", "denial_with_continuation", "clarification_request", "rephrase_request", "off_topic"] or null,
  "reason": "<one short quote from their answer that signals this>",
  "confidence": 0.0-1.0,
  "explanation": "<one sentence on why you picked this signal>"
}

CRITICAL:
- signal MUST be one of the 5 names above or null. Never invent.
- reason MUST be an exact quote from their answer (3-15 words), or null if signal=null.
- confidence: how sure you are (0.0 = guessing, 1.0 = certain).
- If you're uncertain between two signals, pick the one you're more confident in. Don't hedge with a lower confidence.
"""


async def detect_response_signal(
    candidate_answer: str,
    last_question: str,
    client: AsyncOpenAI,
    org_id: Optional[str] = None,
    llm_model: str = _SIGNAL_DETECT_MODEL,
) -> dict:
    """
    Single LLM call to detect response-level signals.

    Returns:
        signal: one of ["pure_denial", "denial_with_continuation", "clarification_request",
                        "rephrase_request", "off_topic"] or null
        reason: exact quote from their answer (or null)
        confidence: 0.0-1.0
        explanation: one sentence
    """
    if not candidate_answer or not candidate_answer.strip():
        logger.info("[SIGNAL_DETECT] Empty answer → pure_denial")
        return {
            "signal": "pure_denial",
            "reason": None,
            "confidence": 1.0,
            "explanation": "Candidate provided no response.",
        }

    word_count = len(candidate_answer.strip().split())
    logger.info(
        "[SIGNAL_DETECT] > detect_response_signal | model=%s words=%d question=%s",
        llm_model, word_count, last_question[:60],
    )

    try:
        stream = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.3,  # lower temp: factual classification, not creative
                max_tokens=200,
                stream=True,
                messages=[
                    {
                        "role": "system",
                        "content": _build_signal_detection_prompt(),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"QUESTION: {last_question}\n\n"
                            f"ANSWER: {candidate_answer}"
                        ),
                    },
                ],
                response_format={"type": "json_object"},
            ),
            timeout=5.0,
        )

        raw = ""
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                raw += chunk.choices[0].delta.content

        parsed = json.loads(raw)
        signal = parsed.get("signal")
        reason = parsed.get("reason")
        confidence = float(parsed.get("confidence", 0.5))
        explanation = parsed.get("explanation", "")

        # Validate signal
        valid_signals = [
            "pure_denial", "denial_with_continuation", "clarification_request",
            "rephrase_request", "off_topic", None
        ]
        if signal not in valid_signals:
            logger.warning(
                "[SIGNAL_DETECT] Invalid signal %r, treating as null", signal
            )
            signal = None

        logger.info(
            "[SIGNAL_DETECT] < detected: signal=%s confidence=%.2f reason=%r",
            signal, confidence, reason
        )

        return {
            "signal": signal,
            "reason": reason,
            "confidence": confidence,
            "explanation": explanation,
        }

    except asyncio.TimeoutError:
        logger.error("[SIGNAL_DETECT] Timeout, treating as normal answer")
        return {
            "signal": None,
            "reason": None,
            "confidence": 0.0,
            "explanation": "Signal detection timeout — proceeding with normal eval.",
        }
    except json.JSONDecodeError as e:
        logger.error("[SIGNAL_DETECT] JSON parse error: %s", e)
        return {
            "signal": None,
            "reason": None,
            "confidence": 0.0,
            "explanation": f"Signal detection parse error: {e}",
        }
    except Exception as e:
        logger.error("[SIGNAL_DETECT] Unexpected error: %s", e)
        return {
            "signal": None,
            "reason": None,
            "confidence": 0.0,
            "explanation": f"Signal detection error: {e}",
        }
