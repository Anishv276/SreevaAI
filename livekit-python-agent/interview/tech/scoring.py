"""
agent_scoring.py
Two dedicated LLM calls per turn: one scores the answer, one classifies the signal.
Splitting the calls eliminates conjunctive-logic collapse — the scoring call focuses
purely on quality dimensions, and the signal call gets its own reasoning budget
(400-600 tokens, chain-of-thought allowed) to pick the ONE best-fit signal.

Returns:
  quality scores  : clarity, depth, specificity, grounding, overall
  routing         : action (PROBE/MOVE_ON)
  signal          : one signal name + the exact reason it fired (never null)

Staged signal taxonomy: the signal classifier is scoped to whichever question
STAGE (definition/mechanism/difference/scenario) the answer was responding to
-- see STAGE_SIGNAL_DEFINITIONS below and eval.py's TopicState.current_rung_name().
Each stage has exactly 4 possible outcomes; at most one CROSS_CUTTING_SIGNAL
may fire alongside the stage signal (never instead of it, never stacked with
another cross-cutting signal).
"""
from __future__ import annotations
import asyncio
import json
import logging
from typing import Any, Optional

logger = logging.getLogger("interview-agent")
from interview.agent_runtime_support import EVAL_TEMPERATURE
from interview.agent_runtime_utils import token_limit_kwarg


# ---------------------------------------------------------------------------
# Response-shape signals (G0) -- fire if the candidate's response is a special
# SHAPE (asking to clarify/redo, or answering something unrelated) rather than
# a content-bearing attempt at the question. Orthogonal to the staged content
# taxonomy below -- these are about the shape of the reply, not which concept
# stage it was answering.
# ---------------------------------------------------------------------------
RESPONSE_SIGNALS = {
    "clarification_request": {
        "description": "Candidate asks to clarify/rephrase the question.",
        "action": "REPHRASE (ask question again, clearer)",
    },
    "rephrase_request": {
        "description": "Candidate asks to restart their own answer.",
        "action": "ACCEPT_REPHRASE (listen to new answer instead)",
    },
    "off_topic": {
        "description": "Answered a different question than what was asked.",
        "action": "REDIRECT (re-ask the original question)",
    },
}

# ---------------------------------------------------------------------------
# PART B — STAGED SIGNAL TAXONOMY
#
# Each question stage has its own fixed 4-outcome signal set. The classifier
# is told which stage is active (via active_stage) and picks ONE of that
# stage's 4 signals -- never all 16 at once. Outcome tiers, consistent across
# every stage:
#   *_correct / *_clear / *_grounded  -- concept cleared, no gap
#   *_partial / *_shallow / *_one_sided / *_generic / reasoning_unjustified
#       -- GAP tier: attempted, engaged, but didn't fully land. Probe-on-same-
#          gap (Part C.2) holds the sub-concept rotation here.
#   *_confused / *_incorrect / *_reversed
#       -- ACTIVE WRONGNESS tier: not just a gap, actively wrong. Scored WORSE
#          than the corresponding *_absent outcome (Part D.3) but flow-wise
#          also holds the rotation like the gap tier (not cleared).
#   *_absent -- DENIAL tier: essentially nothing on this concept. Part C.1's
#          2-consecutive-occurrence cap (shared with cross-cutting pure_denial).
# ---------------------------------------------------------------------------
STAGE_SIGNAL_DEFINITIONS: dict[str, dict[str, dict]] = {

    "definition": {
        "definition_correct": {
            "trigger": "Candidate states what the concept IS, accurately, in their own words -- not a verbatim textbook recitation, but the right idea.",
            "pattern": "The core definitional claim is right. Minor imprecision in wording is fine as long as the underlying idea is correct.",
            "examples": ["A hash map is a structure that maps keys to values using a hash function to find the right bucket fast."],
            "not_this": "NOT this if the definition is half-right or missing a key qualifier -- that's definition_partial. NOT this if they mix up two related concepts' properties -- that's definition_confused.",
        },
        "definition_partial": {
            "trigger": "Candidate gets PART of the definition right but is missing a key element, hedges heavily, or only defines it by example without the general claim.",
            "pattern": "Real engagement, real partial knowledge -- not wrong, just incomplete. 'It's like a list but... I think faster for lookups?' -- right direction, no confident landing.",
            "examples": ["It's kind of like a dictionary I think, where you look things up... not totally sure how."],
            "not_this": "NOT this if they get the core claim actively backwards -- that's definition_confused. NOT this if there's no attempt at all -- that's definition_absent.",
        },
        "definition_confused": {
            "trigger": "Candidate states the definition ACTIVELY WRONG -- swaps it with a different concept's definition, or asserts a property that is the opposite of true.",
            "pattern": "This is not a gap, it's a wrong claim stated with some confidence. Worse than silence because it reveals a real misconception, not just missing knowledge.",
            "examples": ["A hash map keeps things in sorted order automatically, that's the whole point of it. [Backwards -- that's a sorted structure, not a hash map's defining property.]"],
            "not_this": "NOT this if they simply don't know and say so, or trail off uncertainly -- that's definition_partial or definition_absent. Reserve this for a confidently WRONG claim.",
        },
        "definition_absent": {
            "trigger": "Candidate gives essentially nothing -- a flat 'I don't know', silence, or a non-answer with zero definitional content.",
            "pattern": "No real attempt. Distinct from definition_confused (which is a wrong attempt) and definition_partial (a real but incomplete attempt).",
            "examples": ["I don't know.", "Not sure, honestly.", "..."],
            "not_this": "NOT this if there's ANY real attempt, even a wrong one -- a wrong attempt is definition_confused, a thin attempt is definition_partial.",
        },
    },

    "mechanism": {
        "mechanism_correct": {
            "trigger": "Candidate explains HOW it actually works internally -- the real steps or data flow, not just the label or the outcome.",
            "pattern": "Real internal mechanism traced, even briefly -- 'it hashes the key, mods by the table size, and lands in that bucket' shows the actual steps.",
            "examples": ["It computes a hash of the key, then uses that to index into an array of buckets, resolving collisions with chaining or probing."],
            "not_this": "NOT this if they only restate WHAT it does without HOW -- that's mechanism_shallow.",
        },
        "mechanism_shallow": {
            "trigger": "Candidate names the mechanism or restates its effect ('it makes lookups fast') but gives no internal steps, no data flow, no real trace of HOW.",
            "pattern": "Confident but hollow -- the label is right, the internals are absent. A real practitioner can open the box; this answer describes the outside only.",
            "examples": ["It just makes things faster to look up, that's how it works."],
            "not_this": "NOT this if they get an internal step actively backwards -- that's mechanism_incorrect. NOT this if there's zero engagement -- that's mechanism_absent.",
        },
        "mechanism_incorrect": {
            "trigger": "Candidate describes an internal step or mechanism that is ACTIVELY WRONG -- not just vague, but a specific false claim about how it works.",
            "pattern": "A confident, specific, wrong claim about the internals -- worse than a shallow non-answer because it's actively misleading about the mechanism.",
            "examples": ["It works by keeping every entry in a linked list and scanning from the front each time. [That's linear search, not how the mechanism actually works.]"],
            "not_this": "NOT this if the answer is just thin/generic with no specific wrong claim -- that's mechanism_shallow.",
        },
        "mechanism_absent": {
            "trigger": "Candidate gives essentially nothing about how it works -- flat denial or non-answer.",
            "pattern": "No real attempt at the internals at all.",
            "examples": ["I don't know how it works internally.", "No idea."],
            "not_this": "NOT this if there's any real (even hollow) attempt -- that's mechanism_shallow or mechanism_incorrect.",
        },
    },

    "difference": {
        "distinction_clear": {
            "trigger": "Candidate correctly contrasts the two concepts -- what's actually different, and it changes something (when you'd pick one over the other).",
            "pattern": "The distinction lands and is directionally correct for both concepts.",
            "examples": ["A list preserves order and allows duplicates, a set doesn't -- so you'd use a set when you just need fast membership checks."],
            "not_this": "NOT this if they only characterize ONE side accurately and gloss the other -- that's distinction_one_sided. NOT this if they swap the two concepts' properties -- that's distinction_reversed.",
        },
        "distinction_one_sided": {
            "trigger": "Candidate correctly describes ONE of the two concepts but is vague, hedging, or silent on the other -- no real contrast lands.",
            "pattern": "Real partial engagement -- they know something, but the comparison itself doesn't complete.",
            "examples": ["A list is ordered, um, and a set is... I think similar but I'm not sure what's actually different."],
            "not_this": "NOT this if they get the comparison backwards for either side -- that's distinction_reversed, not this.",
        },
        "distinction_reversed": {
            "trigger": "Candidate swaps the two concepts' properties -- attributes concept A's real trait to concept B, or vice versa. Confidently stated.",
            "pattern": "ACTIVE CONFUSION, not just a gap -- this is worse than not attempting the distinction at all, because it reveals a real misconception about both concepts at once. Score this WORSE than distinction_absent.",
            "examples": ["A set preserves insertion order and allows duplicates, a list doesn't. [Exactly backwards.]"],
            "not_this": "NOT this if they're just vague/hedging on one side without confidently asserting the wrong direction -- that's distinction_one_sided.",
        },
        "distinction_absent": {
            "trigger": "Candidate gives essentially nothing on the comparison -- flat denial or non-answer.",
            "pattern": "No real attempt at contrasting the two concepts at all.",
            "examples": ["I don't know the difference.", "Not sure honestly."],
            "not_this": "NOT this if there's any real attempt, even a backwards one -- a backwards attempt is distinction_reversed, which is WORSE, not this.",
        },
    },

    "scenario": {
        "application_grounded": {
            "trigger": "Candidate gives a concrete, plausible diagnostic/action plan for the scenario, grounded in the actual mechanism -- not a generic checklist.",
            "pattern": "Real triage instinct -- names what they'd check or do FIRST and why that's the right first move given how the concept actually works.",
            "examples": ["I'd check whether the hash function is producing too many collisions for this key distribution before assuming it's a capacity issue."],
            "not_this": "NOT this if it's a generic 'I'd check the logs / check performance' with no specific tie to the mechanism -- that's application_generic.",
        },
        "application_generic": {
            "trigger": "Candidate gives a plausible-sounding but generic response -- a checklist that could apply to almost any performance/failure scenario, not tied to the specific mechanism.",
            "pattern": "Real engagement, but the answer reads as memorized best-practice rather than reasoning from the mechanism itself.",
            "examples": ["I'd check the logs and monitor performance, then look at the metrics dashboard."],
            "not_this": "NOT this if they give a real but unjustified guess with no reasoning path at all -- that's reasoning_unjustified. NOT this if it's actually grounded in the mechanism -- that's application_grounded.",
        },
        "reasoning_unjustified": {
            "trigger": "Candidate names a plausible action or decision for the scenario but gives NO reasoning for why -- a bare assertion with no triage logic behind it.",
            "pattern": "Different from application_generic: this is a bare claim ('I'd just restart it') with zero explanation of why that's the right first move, not even a generic justification.",
            "examples": ["I'd just restart the service and see if that fixes it."],
            "not_this": "NOT this if they at least gave a generic justification -- that's application_generic. Reserve this for reasoning-free bare assertions.",
        },
        "application_absent": {
            "trigger": "Candidate gives essentially nothing for the scenario -- flat denial or non-answer.",
            "pattern": "No real attempt at the scenario at all.",
            "examples": ["I don't know what I'd check.", "No idea."],
            "not_this": "NOT this if there's any real attempt, even ungrounded -- that's application_generic or reasoning_unjustified.",
        },
    },
}

# ---------------------------------------------------------------------------
# Cross-cutting signals -- may fire ALONGSIDE (never instead of) the primary
# stage signal, at most ONE per turn. Describe HOW the answer was delivered
# or a denial shape, not WHICH concept-outcome it was.
# ---------------------------------------------------------------------------
CROSS_CUTTING_SIGNAL_DEFINITIONS: dict[str, dict] = {
    "verbal_disfluency": {
        "trigger": "Filler words ('um', 'like'), restarting a sentence, run-on/rambling phrasing -- DELIVERY noise around an otherwise gradeable answer.",
        "pattern": "Purely about HOW it was said, never evidence of a wrong or shallow answer by itself -- see Part D.1's scoring calibration.",
    },
    "buzzword_without_substance": {
        "trigger": "Candidate drops technical-sounding terms or name-drops a concept/tool with no real content behind them for the CURRENT question's concept.",
        "pattern": "Jargon used as a shield -- distinct from a stage-level shallow answer because the tell here is specifically buzzword density with no substance, not just brevity.",
    },
    "self_correction_recovery": {
        "trigger": "Candidate states something, catches their own mistake mid-answer or shortly after, and corrects it to something accurate.",
        "pattern": "A GOOD sign, not a fumble -- see Part D.2: this should raise sat relative to where the fumble alone would have landed, since catching your own error is evidence of real understanding.",
    },
    "internal_contradiction": {
        "trigger": "Candidate says two things in the same answer that directly conflict with each other, without resolving which one they mean, and without it being a caught self-correction.",
        "pattern": "Distinct from self_correction_recovery: here the contradiction is left unresolved, not caught and fixed.",
    },
    "pure_denial": {
        "trigger": "The ENTIRE answer is a flat denial with nothing else -- 'I don't know', silence, 'not sure' -- and nothing else was said this turn.",
        "pattern": "Cross-cutting version of the stage's own '*_absent' outcome, for use when denial is the whole story and no stage-specific framing adds anything. Counts toward the same Part C.1 2-consecutive-occurrence cap as '*_absent'.",
    },
}

# Flow-control signals are SYSTEM-COMPUTED (TopicState in eval.py) -- never
# returned by the LLM, never appear in the prompts below. Listed here only for
# documentation/completeness of the full taxonomy.
FLOW_CONTROL_SIGNALS: tuple[str, ...] = (
    "concept_cleared", "concept_gap_repeated", "topic_floor_reached", "scenario_gate_failed",
)

# Flat superset of all stage signals across all 4 stages -- used for
# validating an LLM-returned signal name regardless of which stage was active
# (e.g. a stale/cross-stage signal from a race condition should still be
# recognized as "a real taxonomy signal" even if it's the wrong stage).
_ALL_STAGE_SIGNALS: frozenset[str] = frozenset(
    name for _stage_defs in STAGE_SIGNAL_DEFINITIONS.values() for name in _stage_defs
)

# ---------------------------------------------------------------------------
# SIGNAL DETECTION -- direct classification.
#
# Tested against a feature-extraction + code-resolver alternative (see
# tests/test_signal_ab.py): direct classification won on both gpt-4.1-nano
# (6/10 vs 4/10) and gpt-4.1-mini (7/10 vs 6/10). Splitting the judgment into
# 11 boolean features gave the model 11 chances to be wrong instead of 1 -- 
# worse, not better. Keeping it as a single classification call.
# ---------------------------------------------------------------------------

def _build_response_shape_gate_block() -> str:
    """G0-equivalent response-shape gates -- checked FIRST, first-match-wins,
    independent of which question stage is active. These describe the SHAPE
    of the reply (asking to clarify/redo, or answering something unrelated),
    never a content-outcome judgment."""
    return """\
---- RESPONSE-SHAPE GATES — check these FIRST, before any stage signal ----

RS-a — CLARIFICATION_REQUEST: Is candidate asking YOU to clarify/rephrase the question,
      saying they didn't understand/follow the question, OR checking the connection/
      whether you can hear them (not answering the question at all, just checking in)?
      "What do you mean?" | "Can you rephrase?" | "Can you repeat?" | "I didn't get you" |
      "I don't get it" | "I don't understand" | "Sorry, can you repeat that?" |
      "Hey, can you hear me?" | "Are you there?" | "Hello? Can you hear me?"
      → YES: SIGNAL = clarification_request. STOP.

RS-b — REPHRASE_REQUEST: Is candidate asking to RESTART or correct THEIR OWN answer?
      "Let me say that again" | "I misspoke, what I meant..." | "Sorry, I said that wrong"
      → YES: SIGNAL = rephrase_request. STOP.

RS-c — OFF_TOPIC: Did candidate answer a COMPLETELY DIFFERENT question — one that has
      NOTHING to do with the topic or question asked?
      Q: "Kubernetes scaling?" A: "I love React" | Q: "Indexing tradeoffs?" A: "I like Python"
      → YES: SIGNAL = off_topic. STOP.
      NOT this if they attempted to address the question but gave a vague, shallow, wrong,
      or confused answer — a partial or even incorrect technical attempt is ON-TOPIC and
      falls through to the staged signal below, NOT off_topic.
      off_topic ONLY fires when the subject matter itself is unrelated to what was asked.

If none of RS-a/b/c fired: this answer gets exactly ONE stage signal (below), plus
optionally exactly ONE cross-cutting signal.\
"""


def _build_stage_signal_prompt_block(active_stage: str) -> str:
    """Part B: stage-scoped signal detection. Only the 4 signals for the
    CURRENTLY ACTIVE stage are ever valid outcomes for this turn -- the model
    is never asked to disambiguate across all 16 stage signals at once."""
    _stage_defs = STAGE_SIGNAL_DEFINITIONS.get(active_stage, STAGE_SIGNAL_DEFINITIONS["definition"])
    _stage_upper = active_stage.upper()
    _gate_lines = []
    for _name, _defn in _stage_defs.items():
        _gate_lines.append(
            f"  \"{_name}\": {_defn['trigger']}\n"
            f"    Pattern: {_defn['pattern']}\n"
            f"    Example: {_defn['examples'][0]}\n"
            f"    {_defn['not_this']}"
        )
    _gates_block = "\n\n".join(_gate_lines)

    return f"""\
---- STAGE SIGNAL — active stage: {_stage_upper} ----

The question just answered was a {_stage_upper} question. Pick EXACTLY ONE of these
{len(_stage_defs)} signals — the ONE outcome tier that BEST describes this specific
answer. This is a best-match check across all {len(_stage_defs)}, not first-match-wins.

{_gates_block}

CRITICAL — tier ordering matters: "confused"/"incorrect"/"reversed" (active wrongness) is
NOT the same as "partial"/"shallow"/"one_sided"/"generic" (a gap) — a candidate who states
something ACTIVELY WRONG with confidence must get the wrongness-tier signal, never the
gap-tier signal, even though both are "not fully correct." Confidently wrong is worse than
an honest partial attempt, and both are worse than "_absent" is DIFFERENT FROM but not
necessarily worse — distinction_reversed specifically is scored WORSE than
distinction_absent (active confusion beats silence in severity), and the same STRUCTURE
(a confidently wrong claim beats a bare non-attempt in severity) applies conceptually to
definition_confused vs definition_absent and mechanism_incorrect vs mechanism_absent too.

---- CROSS-CUTTING SIGNAL (optional, at most ONE) ----

After picking the stage signal, check if exactly one of these ALSO applies. Do not force
one if none clearly fits — most turns have zero cross-cutting signals.

{chr(10).join(f'  "{name}": {defn["trigger"]}' for name, defn in CROSS_CUTTING_SIGNAL_DEFINITIONS.items())}

Output the stage signal, and the cross-cutting signal if any (else null). Never stack two
stage signals. Never stack two cross-cutting signals.\
"""


async def _classify_signal_from_answer(
    *,
    candidate_answer: str,
    last_question: str,
    client: Any,
    llm_model: str,
    active_stage: str = "definition",
) -> tuple[str, str | None, dict | None]:
    """
    Fallback: compare the answer against the ACTIVE STAGE's 4 signal outcomes
    and return (signal, signal_reason). Called only when the main eval LLM
    failed to return a valid stage signal.

    Unlike the old flat 7-signal pool, there is no "variety rule" here: each
    stage only has 4 outcomes and firing the same outcome twice on the same
    sub-concept is what the rotation lock (Part C.2, TopicState.
    register_subconcept_probe) is FOR -- it's a meaningful repeated signal, not
    a stale fallback pattern to avoid.
    """
    _stage_defs = STAGE_SIGNAL_DEFINITIONS.get(active_stage, STAGE_SIGNAL_DEFINITIONS["definition"])
    _candidates = list(_stage_defs.keys())
    _signal_descriptions = "\n".join(
        f'"{name}": {_stage_defs[name]["trigger"]}'
        for name in _candidates
    )
    _system = (
        "You are a signal classifier for an interview evaluation system.\n"
        f"The question just answered was a {active_stage.upper()} question. Given the question and "
        "the candidate's answer, pick the ONE signal from the list below that best describes this "
        "specific answer.\n\n"
        f"SIGNALS (choose exactly one):\n{_signal_descriptions}\n\n"
        "Output ONLY valid JSON: {\"signal\": \"<signal_name>\", \"signal_reason\": \"<3-12 word exact quote from their answer>\"}\n"
        "signal MUST be exactly one of the signal names listed above. Nothing else."
    )
    _user = f"QUESTION: {last_question}\n\nANSWER: {candidate_answer}"
    _usage: dict | None = None
    try:
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=0.0,
                **token_limit_kwarg(llm_model, 80),
                messages=[
                    {"role": "system", "content": _system},
                    {"role": "user", "content": _user},
                ],
                response_format={"type": "json_object"},
            ),
            timeout=5.0,
        )
        # Capture usage immediately after the call succeeds -- it was billed
        # regardless of whether the response body parses cleanly below.
        from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
        _usage = _extract_usage(resp, llm_model) if resp else None
        raw = resp.choices[0].message.content or ""
        result = json.loads(raw)
        chosen = str(result.get("signal", "")).strip()
        reason = str(result.get("signal_reason") or "").strip() or None
        if not reason and chosen in _stage_defs:
            reason = _stage_defs[chosen]["trigger"]
        if chosen in _candidates:
            return chosen, reason, _usage
    except Exception as exc:
        logger.warning("[EVAL] _classify_signal_from_answer failed (%s) — using gap-tier fallback", exc)
    # Deterministic fallback: the stage's gap-tier outcome (2nd entry in each
    # stage's tuple) -- "attempted but not fully clear" is the safest default
    # when classification itself failed, never asserting absent or wrongness.
    _gap_fallback = _candidates[1] if len(_candidates) > 1 else _candidates[0]
    return _gap_fallback, _stage_defs[_gap_fallback]["trigger"], _usage


async def _call_scoring(
    *,
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    recent_context: str,
    client: Any,
    llm_model: str,
    org_id: str,
    candidate_band: str,
    active_topic: str,
    topic_importance: str,
    topic_tag: str,
    topic_probe_focus: list | None,
    job_title: str,
) -> tuple[dict, dict]:
    """
    Call 1 — quality scoring only (no signal logic).
    Returns (parsed_data_dict, llm_usage_dict).
    """
    def _build_scoring_system_prompt() -> str:
        ctx = (
            "You are an experienced interviewer scoring a candidate's answer.\n"
            "Think like a senior hiring manager who has interviewed hundreds of people.\n"
            "You know the difference between someone who did the work and someone who read about it.\n"
            "Output ONLY valid JSON:\n"
            '{"answers_question":true/false,"clarity":0-10,"depth":0-10,"specificity":0-10,"grounding":0-10,'
            '"reason":"<one phrase from their answer that drove your scoring call>"}\n\n'
            "STEP 1 — answers_question: Did the candidate's answer actually address the question that was asked?\n"
            "  true  = they engaged with the question, even partially or weakly.\n"
            "  false = the answer has NOTHING to do with the question — completely unrelated topic,\n"
            "          pure social filler ('Yeah I am ready'), or zero attempt at what was asked.\n"
            "  IMPORTANT: A vague, shallow, or generic attempt is still answers_question=TRUE.\n"
            "  'I built the pipeline with loaders, chunking, and retrieval' is true even if it\n"
            "  lacks depth. Score it low on depth/specificity — do NOT set answers_question=false.\n"
            "  answers_question=false is ONLY for answers where the subject matter is completely\n"
            "  unrelated (candidate talks about a different topic entirely, or says only 'I am ready').\n"
            "  If answers_question = false, you MUST set clarity=0, depth=0, specificity=0, grounding=0.\n"
            "  No score at all for an answer that does not address the question.\n\n"
            "STEP 2 — Score normally (only if answers_question = true).\n\n"
            "── SCORE ADDITIVELY, PER CORRECT ELEMENT PRESENT (do this before assigning any number) ──\n"
            "Before scoring depth/specificity, silently list the specific correct sub-elements of THIS\n"
            "concept that a strong answer would contain (e.g. for checked vs. unchecked exceptions: a\n"
            "correct example of each, the compiler-enforcement distinction, the throw-vs-throws\n"
            "distinction). Then check which of those the candidate's answer actually contains, and\n"
            "credit each one present — do not default to a flat mid/low score just because you are\n"
            "unsure or the answer isn't exhaustive. An answer with 2 of 3 correct sub-elements scores\n"
            "meaningfully higher than one with 0 or 1, even though neither is a 'complete' answer. Never\n"
            "round an uncertain case down to a generic default penalty — score exactly what is present.\n\n"
            f"Role: {job_title or 'not specified'} | Topic: {active_topic or 'general'}"
            f" | Tag: {topic_tag} | Importance: {topic_importance}\n"
        )
        if topic_probe_focus:
            ctx += f"Probe focus: {', '.join(topic_probe_focus)}\n"
        ctx += (
            "Tag context: RESUME_TOPIC = they claimed this experience, hold them to it. "
            "JD_TOPIC = they may be learning, credit honest partial exposure. "
            "ROLE_TOPIC = conceptual check, one grounded answer is enough.\n\n"

            "This is voice-transcribed speech — score the meaning, not the grammar.\n\n"
            "BEFORE YOU SCORE: Read the answer as a real interviewer would.\n"
            "Ask yourself: does this person sound like they actually did this work?\n"
            "Strip away fluency and polish. Look for the substance underneath.\n\n"

            "── DISFLUENCY VS. CORRECTNESS (apply this before scoring any dimension) ──\n"
            "Separate HOW they said it from WHAT they said. Filler words ('um', 'like'), "
            "run-on or rambling phrasing, restarting a sentence, or self-correcting mid-answer "
            "are DELIVERY, not substance — they are NOT evidence of a wrong or shallow answer.\n"
            "Score in this order: (1) first identify whether the correct key concepts are present "
            "and correctly related to each other — this is the primary driver of clarity/depth; "
            "(2) only then apply a SMALL deduction for delivery quality (confusing rambling that "
            "actually obscures WHICH concept they mean, not just clumsy phrasing of a clear one).\n"
            "A rambling, hedging, self-correcting answer that arrives at the right concept and "
            "relationship must score MEANINGFULLY HIGHER than an answer that is fluent and confident "
            "but substantively wrong or contains no real answer — fluency is not a proxy for "
            "correctness, and correctness must not be suppressed to near-zero just because the "
            "delivery was messy. Reserve low clarity/depth scores for answers that are actually "
            "wrong, empty, or off-target — not for answers that are merely awkwardly phrased.\n\n"

            "── SELF-CORRECTION IS A GOOD SIGN, NOT A FUMBLE ──\n"
            "If the candidate states something, then catches their OWN mistake and corrects it to "
            "something accurate (even mid-sentence), score the CORRECTED version, and score it "
            "HIGHER than if they'd only given the fumble — catching your own error is evidence of "
            "real understanding, not a penalty-worthy stumble. Do not average the wrong first attempt "
            "with the corrected one; weight toward the correction they landed on.\n\n"

            "── ACTIVE WRONGNESS IS WORSE THAN NO ATTEMPT ──\n"
            "A confident, specific claim that is ACTUALLY WRONG (states a mechanism backwards, swaps "
            "two concepts' properties, asserts something false with certainty) reveals a real "
            "misconception — this must score LOWER than a flat 'I don't know' on the same question, "
            "not the same or higher. Silence is a gap; a confident wrong answer is active confusion. "
            "Do not be fooled by confident delivery into scoring a wrong claim as if it were correct.\n\n"

            "── CLARITY (20%) ──────────────────────────────\n"
            "Did they answer what was actually asked — not a safer, easier version of it?\n"
            "A polished answer to the wrong question scores low. A rough answer to the right question scores high.\n"
            "Low (0-4): off-topic, tangent, or answered a related but different question.\n"
            "Mid (5-6): addressed the question but missed part of the intent or drifted.\n"
            "High (7-10): directly answered what was asked. You got what you needed.\n"
            f"{'FRESHER: forgive nervousness and rambling — did they try to answer it? ' if candidate_band == 'fresher' else ''}"
            f"{'SENIOR/EXPERIENCED: precision expected. Tangents and pivots lower the score. ' if candidate_band in ('senior', 'experienced') else ''}\n\n"

            "── DEPTH (35%) ────────────────────────────────\n"
            "Did they explain the HOW and WHY — or just describe the WHAT?\n"
            "Ask yourself: could someone who only read about this topic give the same answer?\n"
            "If yes, depth is low. Real depth is specific to their situation, their constraints, their actual decisions.\n"
            "Generic best-practices language ('I always start by understanding requirements') is not depth — cap at 5.\n"
            "Low (0-4): described what happened, no reasoning behind it.\n"
            "Mid (5-6): gave a real reason for a choice but it's thin — one layer, no constraint or tradeoff behind it.\n"
            "High (7-10): explained a real decision AND why that decision made sense given their specific situation. "
            "The best answers show a cause-effect chain — what they tried, what happened, why they adjusted.\n"
            f"{'FRESHER: a simple genuine reason counts. One honest WHY = 5+. No tradeoffs expected.' if candidate_band == 'fresher' else ''}"
            f"{'MID: expect at least one real constraint or tradeoff behind a decision. Generic reasoning = 4 max.' if candidate_band == 'mid' else ''}"
            f"{'EXPERIENCED: expect competing options considered and a real tradeoff explained. Single-reason answers = 5 max.' if candidate_band == 'experienced' else ''}"
            f"{'SENIOR: expect strategic judgment — why this over alternatives, second-order thinking. No tradeoff = 6 max.' if candidate_band == 'senior' else ''}\n\n"

            "── SPECIFICITY (20%) ──────────────────────────\n"
            "Did they give you operational detail that could only exist if they actually did this work?\n"
            "This is NOT about tool names or software. Anyone can study a job description and name every tool in it.\n"
            "Real specificity: a real number (quota, headcount, deal size, %, volume), a constraint they hit, "
            "a specific failure they fixed, a real decision point, an outcome that actually happened, "
            "a specific client type or team structure or process step that was theirs.\n"
            "Tool names without usage context = no specificity. 'It went well' = no specificity. "
            "'I usually handle X type of client' = pattern, not specificity.\n"
            "Low (0-4): generic — anyone who read one article could say this.\n"
            "Mid (5-6): one real operational detail that required being there.\n"
            "High (7-10): multiple real details that together make the work traceable to a real event, not a type of event.\n"
            f"{'FRESHER: any real operational detail counts, even small-scale internship numbers.' if candidate_band == 'fresher' else ''}"
            f"{'MID: expect at least one real number or constraint. Vague operational language = 4 max.' if candidate_band == 'mid' else ''}"
            f"{'EXPERIENCED/SENIOR: expect real scale and multiple concrete details. Generic descriptions = 3 max.' if candidate_band in ('experienced', 'senior') else ''}\n\n"

            "── GROUNDING (25%) ────────────────────────────\n"
            "Does this answer sound like someone who was there — or someone describing what being there is supposed to sound like?\n"
            "Grounding is the hardest score to fake. Clarity, depth, and specificity can all be rehearsed. "
            "Grounding requires details that only exist when you actually lived through something.\n"
            "Signs of real grounding: something didn't go as planned. They remember it imperfectly "
            "('around 40%, I don't remember exactly'). The detail is specific to their situation, not generic to the domain. "
            "The outcome wasn't guaranteed. They reflect on what they'd do differently. "
            "There's organisational texture — a real stakeholder, a real deadline, a real constraint from outside them.\n"
            "Signs of a hollow answer: perfect linear story (problem → action → success). "
            "Everything worked. Nothing was hard. The outcome is vague. "
            "It sounds like a case study of how this work should go, not how it actually went.\n"
            "An answer with no stated result or outcome cannot score above 5 — something must have happened.\n"
            "Low (0-4): plausible but hollow. Reads like a description of the work, not a memory of doing it.\n"
            "Mid (5-6): at least one grounding signal — a real result, a real friction point, a real constraint.\n"
            "High (7-10): the story has texture. Something was hard or imperfect or specific to their situation. "
            "You believe this person was actually there.\n"
            f"{'FRESHER: a real outcome from a student project or internship counts. A failure they learned from = 6+. No org texture expected.' if candidate_band == 'fresher' else ''}"
            f"{'MID: expect at least one friction point or specific outcome. Clean perfect narrative = 4 max.' if candidate_band == 'mid' else ''}"
            f"{'EXPERIENCED: expect organisational texture and real constraints. Smooth polished story with no friction = 4 max.' if candidate_band == 'experienced' else ''}"
            f"{'SENIOR: expect reflection or judgment under uncertainty. A perfect linear story with no tradeoff = 3 max.' if candidate_band == 'senior' else ''}\n\n"
        )
        return ctx

    stream = await asyncio.wait_for(
        client.chat.completions.create(
            model=llm_model,
            temperature=EVAL_TEMPERATURE,
            **token_limit_kwarg(llm_model, 120),
            stream=True,
            messages=[
                {"role": "system", "content": _build_scoring_system_prompt()},
                {
                    "role": "user",
                    "content": (
                        f"QUESTION: {last_question}\n\n"
                        f"ANSWER: {candidate_answer}\n\n"
                        f"FOLLOW-UPS ON THIS TOPIC SO FAR: {topic_follow_up_count}\n\n"
                        f"RECENT CONVERSATION (last 3 exchanges):\n{recent_context}"
                    ),
                },
            ],
            response_format={"type": "json_object"},
            stream_options={"include_usage": True},
            store=True,
            metadata={
                "call_type": "eval_scoring",
                "band": candidate_band,
                "topic_importance": topic_importance,
                "org_id": org_id or "",
            },
        ),
        timeout=8.0,
    )

    raw = ""
    _usage = None
    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            raw += chunk.choices[0].delta.content
        if chunk.usage:
            _usage = chunk.usage

    from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
    _llm_usage = _extract_usage(_usage, llm_model) if _usage else {
        "model": llm_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0,
    }
    return json.loads(raw), _llm_usage


async def _call_signal_classification(
    *,
    candidate_answer: str,
    last_question: str,
    recent_context: str,
    client: Any,
    llm_model: str,
    org_id: str,
    active_topic: str,
    topic_importance: str,
    topic_tag: str,
    active_stage: str = "definition",
) -> tuple[str | None, str | None, str | None, dict]:
    """
    Call 2 — signal classification only, with its own 400-600 token reasoning budget.
    Brief chain-of-thought is allowed before the final JSON to reduce conjunctive-logic
    collapse that occurred when scoring and signal detection shared 200 tokens.

    Part B: scoped to whichever STAGE (definition/mechanism/difference/scenario)
    the question just answered belongs to -- the model picks from that stage's
    4 signals only, plus optionally one cross-cutting signal. There is no
    "variety rule" here (unlike the old flat 7-signal pool): repeating the same
    stage-signal on the same sub-concept is meaningful, tracked by
    TopicState.register_subconcept_probe(), not something to avoid at the
    classification layer.

    Returns (stage_signal, cross_cutting_signal, signal_reason, llm_usage_dict).
    """
    def _build_signal_system_prompt() -> str:
        return (
            "You are a signal classifier for an interview evaluation system.\n"
            "Your job is to identify the signal(s) that best describe the candidate's answer.\n\n"
            "You may reason briefly (2-4 sentences) before giving your final answer, but your final output\n"
            "MUST end with valid JSON on its own line:\n"
            '{"signal": "<stage_signal_name_or_response_shape_signal>", '
            '"cross_cutting_signal": "<cross_cutting_name_or_null>", '
            '"signal_reason": "<3-12 word exact quote from their answer>"}\n\n'
            "signal MUST be exactly one of the response-shape or stage signal names below. NEVER null.\n"
            "cross_cutting_signal is OPTIONAL -- use null if none clearly applies. Never put a\n"
            "response-shape or stage signal name in cross_cutting_signal.\n"
            f"Topic: {active_topic or 'general'} | Tag: {topic_tag} | Importance: {topic_importance}\n\n"
            + _build_response_shape_gate_block()
            + "\n\n"
            + _build_stage_signal_prompt_block(active_stage)
        )

    resp = await asyncio.wait_for(
        client.chat.completions.create(
            model=llm_model,
            temperature=0.0,
            **token_limit_kwarg(llm_model, 500),
            messages=[
                {"role": "system", "content": _build_signal_system_prompt()},
                {
                    "role": "user",
                    "content": (
                        f"QUESTION: {last_question}\n\n"
                        f"ANSWER: {candidate_answer}\n\n"
                        f"RECENT CONVERSATION (last 3 exchanges):\n{recent_context}"
                    ),
                },
            ],
            store=True,
            metadata={
                "call_type": "eval_signal",
                "topic_importance": topic_importance,
                "org_id": org_id or "",
            },
        ),
        timeout=6.0,
    )

    raw = resp.choices[0].message.content or ""

    from billing.billing import extract_usage as _extract_usage  # noqa: PLC0415
    _llm_usage = _extract_usage(resp, llm_model) if resp else {
        "model": llm_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0,
    }

    # Extract the last JSON object from the response (chain-of-thought comes first)
    signal: str | None = None
    cross_cutting_signal: str | None = None
    signal_reason: str | None = None
    import re as _re
    _json_matches = _re.findall(r'\{[^{}]+\}', raw)
    _stage_defs = STAGE_SIGNAL_DEFINITIONS.get(active_stage, STAGE_SIGNAL_DEFINITIONS["definition"])
    for _candidate_json in reversed(_json_matches):
        try:
            _parsed = json.loads(_candidate_json)
            _sig = str(_parsed.get("signal", "")).strip()
            _cc = str(_parsed.get("cross_cutting_signal") or "").strip() or None
            _reason = str(_parsed.get("signal_reason") or "").strip() or None
            if _sig:
                signal = _sig
                if _cc and _cc in CROSS_CUTTING_SIGNAL_DEFINITIONS:
                    cross_cutting_signal = _cc
                if not _reason:
                    _defn = _stage_defs.get(_sig) or RESPONSE_SIGNALS.get(_sig) or CROSS_CUTTING_SIGNAL_DEFINITIONS.get(_sig)
                    _reason = _defn.get("trigger") or _defn.get("description") if _defn else None
                signal_reason = _reason
                break
        except (json.JSONDecodeError, ValueError):
            continue

    return signal, cross_cutting_signal, signal_reason, _llm_usage


async def evaluate_answer(
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    transcript_lines: list,
    client,
    llm_model: str,
    org_id: Optional[str] = None,
    is_warmup: bool = False,
    candidate_band: str = "mid",
    active_topic: str = "",
    topic_importance: str = "HIGH",
    topic_tag: str = "RESUME_TOPIC",
    topic_probe_focus: list | None = None,
    job_title: str = "",
    active_stage: str = "definition",
) -> dict:
    """
    Two dedicated LLM calls: Call 1 scores the answer, Call 2 classifies the
    stage signal (+ optional cross-cutting signal). active_stage tells both
    calls which of definition/mechanism/difference/scenario the question just
    answered belongs to (see TopicState.current_rung_name() in eval.py).

    Returns:
      clarity, depth, specificity, grounding, overall  — quality scores
      action       — PROBE | MOVE_ON
      signal       — one stage or response-shape signal name, never null
      cross_cutting_signal — one cross-cutting signal name, or null
      signal_reason — exact quote from their answer that triggered it, or null
      reason       — short phrase for the routing decision
    """
    if is_warmup:
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "is_warmup": True,
            "action": "MOVE_ON", "forced_action": True,
            "signal": None, "cross_cutting_signal": None, "signal_reason": None, "reason": "warmup turn",
        }

    if not candidate_answer or not candidate_answer.strip():
        # Empty answer = the "*_absent" outcome for whichever stage was active.
        # Not a forced MOVE_ON: a denial-tier signal (even an empty one) steps
        # the ladder DOWN one rung and stays on the same skill (see
        # TopicState.register_denial in eval.py). The skill is only closed out
        # after 2 consecutive denial-tier signals (TopicState.should_exit_on_denials
        # -> topic_floor_reached), never on the very first one.
        _absent_signal = {
            "definition": "definition_absent",
            "mechanism": "mechanism_absent",
            "difference": "distinction_absent",
            "scenario": "application_absent",
        }.get(active_stage, "definition_absent")
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "action": "PROBE", "forced_action": False,
            "signal": _absent_signal, "cross_cutting_signal": "pure_denial",
            "signal_reason": None, "reason": "empty answer",
        }

    word_count = len(candidate_answer.strip().split())
    recent_context = "\n".join(transcript_lines[-6:]) if transcript_lines else ""

    logger.info(
        "[EVAL] > evaluate_answer (2-call) | model=%s words=%d follow_ups=%d topic=%s",
        llm_model, word_count, topic_follow_up_count, active_topic or "?",
    )

    _common_kwargs = dict(
        candidate_answer=candidate_answer,
        last_question=last_question,
        recent_context=recent_context,
        client=client,
        llm_model=llm_model,
        org_id=org_id or "",
        active_topic=active_topic,
        topic_importance=topic_importance,
        topic_tag=topic_tag,
    )

    try:
        # Fire both calls concurrently -- scoring and signal classification are independent.
        (scoring_data, _scoring_usage), (raw_signal, raw_cross_cutting, signal_reason, _signal_usage) = (
            await asyncio.gather(
                _call_scoring(
                    **_common_kwargs,
                    topic_follow_up_count=topic_follow_up_count,
                    candidate_band=candidate_band,
                    topic_probe_focus=topic_probe_focus,
                    job_title=job_title,
                ),
                _call_signal_classification(
                    **_common_kwargs,
                    active_stage=active_stage,
                ),
            )
        )

        # One usage entry PER real LLM call made -- never merged -- so
        # downstream "runs" counts (billing.py, report_worker.py) reflect
        # actual API calls billed, not conversational turns.
        _eval_llm_usages: list[dict] = [_scoring_usage, _signal_usage]

        data = scoring_data

        def _clamp(v: Any, lo: float = 0.0, hi: float = 10.0) -> float:
            try:
                return max(lo, min(hi, float(v)))
            except (TypeError, ValueError):
                return 0.0

        # answers_question=false means the answer did not address the question at all.
        # Force all scores to 0 immediately -- no saturation credit for irrelevant answers.
        answers_question = data.get("answers_question", True)
        if answers_question is False:
            logger.info("[EVAL] answers_question=false — forcing all scores to 0")
            clarity = depth = specificity = grounding = overall = 0.0
        else:
            clarity     = _clamp(data.get("clarity", 0))
            depth       = _clamp(data.get("depth", 0))
            specificity = _clamp(data.get("specificity", 0))
            grounding   = _clamp(data.get("grounding", 0))
            overall = (
                clarity * 0.20
                + depth * 0.35
                + specificity * 0.20
                + grounding * 0.25
            )

        # Normalise signals from the dedicated signal call
        signal = str(raw_signal).strip() if raw_signal else None
        cross_cutting_signal = str(raw_cross_cutting).strip() if raw_cross_cutting else None

        _stage_defs = STAGE_SIGNAL_DEFINITIONS.get(active_stage, STAGE_SIGNAL_DEFINITIONS["definition"])
        _stage_absent = {
            "definition": "definition_absent", "mechanism": "mechanism_absent",
            "difference": "distinction_absent", "scenario": "application_absent",
        }.get(active_stage, "definition_absent")

        action = "PROBE"
        forced_action = False
        zero_scores = False

        # Response-shape signals (Part B, orthogonal to the staged taxonomy).
        if signal in RESPONSE_SIGNALS:
            if signal == "clarification_request":
                action, forced_action = "REPHRASE", True
                zero_scores = True
            elif signal == "rephrase_request":
                action, forced_action = "ACCEPT_REPHRASE", True
                zero_scores = True
            elif signal == "off_topic":
                action, forced_action = "REDIRECT", True
                zero_scores = True
        elif signal == "pure_denial" or (cross_cutting_signal == "pure_denial" and signal is None):
            # Cross-cutting pure_denial with no stage signal returned -- treat as
            # this stage's *_absent outcome (Part C.1's denial tier).
            signal = _stage_absent
            zero_scores = True
        elif signal not in _stage_defs and signal is not None:
            logger.warning("[EVAL] unknown/wrong-stage signal %r for stage=%s — ignoring", signal, active_stage)
            signal = None

        # If signal is still None, fall back to stage-scoped classification --
        # never fall back to a generic default probe.
        if signal is None and not zero_scores:
            signal, signal_reason, _fallback_usage = await _classify_signal_from_answer(
                candidate_answer=candidate_answer,
                last_question=last_question,
                client=client,
                llm_model=llm_model,
                active_stage=active_stage,
            )
            if _fallback_usage:
                _eval_llm_usages.append(_fallback_usage)
            logger.info("[EVAL] signal was None — stage best-match classification selected %r", signal)

        # signal_reason comes from the dedicated signal call (already extracted)
        signal_reason = str(signal_reason or "").strip() or None
        if signal is None:
            signal_reason = None

        # Denial-tier stage signal ("*_absent") also zeroes scores -- same
        # treatment as the cross-cutting pure_denial case above.
        if signal == _stage_absent:
            zero_scores = True

        reason = str(data.get("reason", ""))[:120]

        # -- Part D scoring calibration -----------------------------------
        # D.3: distinction_reversed is ACTIVE WRONGNESS, scored WORSE than
        # distinction_absent (which just zeroes). A candidate who confidently
        # states the two concepts' properties backwards should score BELOW a
        # flat "I don't know" -- reversed reveals a real misconception,
        # silence reveals only a gap.
        _ACTIVE_WRONGNESS = {"definition_confused", "mechanism_incorrect", "distinction_reversed"}
        if signal in _ACTIVE_WRONGNESS:
            zero_scores = False  # override -- these get a real (low, penalized) score, not a flat zero
            _wrongness_penalty = 2.0 if signal == "distinction_reversed" else 1.0
            clarity = max(0.0, clarity - _wrongness_penalty)
            depth = max(0.0, depth - _wrongness_penalty)
            specificity = max(0.0, specificity - _wrongness_penalty)
            grounding = max(0.0, grounding - _wrongness_penalty)
            overall = (clarity * 0.20 + depth * 0.35 + specificity * 0.20 + grounding * 0.25)
            reason = f"{signal} — active wrongness, scored below a non-attempt"

        # D.2: self_correction_recovery raises sat relative to the fumble alone
        # -- reward catching and correcting your own mistake. Small, fixed
        # boost (not a full reset to "correct") since the fumble itself still
        # happened; this must not push scores above the stage-correct ceiling.
        if cross_cutting_signal == "self_correction_recovery" and not zero_scores:
            _recovery_boost = 1.5
            clarity = min(10.0, clarity + _recovery_boost)
            depth = min(10.0, depth + _recovery_boost)
            overall = min(10.0, (clarity * 0.20 + depth * 0.35 + specificity * 0.20 + grounding * 0.25))
            reason = f"{reason} — self-correction recovery credited" if reason else "self-correction recovery credited"

        # Apply score zeroing for response-shape/denial-tier signals (overrides
        # answers_question zeroing if both fire).
        if zero_scores:
            clarity = 0.0
            depth = 0.0
            specificity = 0.0
            grounding = 0.0
            overall = 0.0
            reason = f"{signal} — no scoring"

        logger.info(
            "[EVAL] [OK] signal=%s cross_cutting=%s action=%s | clarity=%d depth=%d spec=%d ground=%d | reason=%s",
            signal, cross_cutting_signal, action,
            int(clarity), int(depth), int(specificity), int(grounding),
            repr(reason),
        )
        if signal_reason:
            logger.info("[EVAL] signal_reason=%r", signal_reason)

        return {
            "clarity": clarity, "depth": depth,
            "specificity": specificity, "grounding": grounding,
            "overall": overall,
            "action": action,
            "forced_action": forced_action if action != "PROBE" else False,
            "signal": signal,
            "cross_cutting_signal": cross_cutting_signal,
            "signal_reason": signal_reason,
            "reason": reason,
            "_llm_usage": _eval_llm_usages,
        }

    except Exception as e:
        # Step 0 instrumentation: log the exception type (a TypeError here
        # means a bad call site / signature mismatch, NOT a slow/unavailable
        # LLM -- those two causes need to be distinguishable in logs) plus
        # the actual answer text, so a fallback firing on substantive
        # answers is visible immediately instead of silently flattening sat.
        logger.error(
            "[EVAL_FALLBACK] evaluate_answer failed: %s: %s | stage=%s | answer=%r",
            type(e).__name__, e, active_stage, (candidate_answer or "")[:300],
        )
        return {
            "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0,
            "overall": 1.3,
            "action": "PROBE",
            "signal": None,
            "cross_cutting_signal": None,
            "signal_reason": f"eval recovery — {type(e).__name__}: {str(e)[:120]}",
            "reason": "eval recovery (llm slow/unavailable)",
            "is_eval_recovery": True,
        }
