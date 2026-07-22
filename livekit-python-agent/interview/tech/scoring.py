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
# Signal definitions -- what each signal means and what it maps to.
# Used here to train the scoring LLM. Also imported by probe_strategy.py.
# ---------------------------------------------------------------------------

# Response-level signals (G0) -- fire if candidate's response type is special
RESPONSE_SIGNALS = {
    "pure_denial": {
        "description": "Answer is ONLY denial, zero attempt, nothing substantive.",
        "action": "MOVE_ON (forced)",
    },
    "denial_with_continuation": {
        "description": "Starts with denial but adds substantive content (partial admission).",
        "action": "CONTINUE (score normally, cap at 5 to prevent saturation)",
    },
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

# Content-level signals (G1-G6) -- fire based on answer quality/pattern
SIGNAL_DEFINITIONS = {

    # PATTERN: answer is a rule/habit, not a real event
    "example_evaded": {
        "trigger": "Question asked for ONE real past instance. Answer describes how they GENERALLY operate — a rule, not a memory.",
        "pattern": "The shape is 'usually I...', 'normally...', 'I always...', 'typically we...' — a description of a type of behaviour, not one specific event that happened.",
        "examples": [
            # tech -- describes habit not event
            "Q: Tell me about a time your model gave wrong results. A: Usually I check the training data first and retrain.",
            # sales -- describes approach not incident
            "Q: Tell me about a deal you almost lost. A: I always follow up quickly and stay persistent with the client.",
            # HR -- describes process not moment
            "Q: Describe a time you handled a difficult hire. A: Normally I involve the team and keep the process structured.",
        ],
        "not_this": "NOT this if they gave any real specific instance, even briefly or imperfectly — then null or a different signal. "
                    "NOT this if they tried to recall and ran dry — that is depth_ceiling_hit. "
                    "ONLY fire when they clearly HAVE substance but chose the generic version over the real one.",
    },

    # PATTERN: tried to answer, visibly ran out
    "depth_ceiling_hit": {
        "trigger": "They engaged and tried, then visibly ran out of knowledge — partial start that trails off, one-word non-denial, or 'I don't have much idea' after attempting.",
        "pattern": "Not dodging, not giving a habit — just empty. They reached the edge of what they know and stopped. The answer starts with intent but has no landing.",
        "examples": [
            # tech -- started, ran out
            "I've used FAISS but I don't really have a lot of idea about how the indexing actually works.",
            # sales -- started, ran out
            "I've done territory planning but the forecasting side... yeah, I'm not too sure how that part worked.",
            # HR -- one word after a real question
            "Q: Walk me through how you structured the interview panel. A: Okay.",
        ],
        "not_this": "NOT this if it is a flat 'I don't know' with zero attempt — that is a denial, return null. "
                    "NOT this if they gave a general habit — that is example_evaded. "
                    "Fire only when they attempted and then ran empty.",
    },

    # PATTERN: team language, personal contribution invisible
    "ownership_ambiguous": {
        "trigger": "'We/team/they' throughout — no 'I did', 'I decided', 'I built' anywhere. Contribution is invisible.",
        "pattern": "The work sounds real but collective. Every verb is plural. You cannot tell what this one person specifically did, decided, or delivered.",
        "examples": [
            # tech -- all team verbs
            "We built the retrieval pipeline, the team set up the vector store, they handled the deployment.",
            # sales -- team credit
            "Our team closed the deal, we handled the negotiation together, the account manager did the follow-up.",
            # HR -- collective ownership
            "The hiring team ran the process, we interviewed together, and the decision was made as a group.",
        ],
        "not_this": "NOT this if they said 'I did X' or 'my part was Y' anywhere — ownership is clear. "
                    "NOT this if they claim to have personally done everything but can't explain it — that is explanation_shallow. "
                    "ownership_ambiguous = too little 'I'; explanation_shallow = too much 'I', nothing behind it.",
    },

    # PATTERN: loud personal claim, hollow explanation
    "explanation_shallow": {
        "trigger": "Strong personal ownership claim ('I built it all', 'I'm really strong at X', 'entire thing by me') + description that reads like an outsider's — no internals, no decisions, no friction.",
        "pattern": "Ownership is asserted loudly; understanding is absent. A real owner can open the box. This person describes the label. Works across every domain — the claim can be about a technical build, a sales skill, or an HR process.",
        "examples": [
            # tech -- ownership claim + no internals
            "Entire functionality is completely built by me. It's a RAG-based system. [Claims it all, explains none of it.]",
            # sales -- ability claim + no substance
            "I'm really strong at closing deals. I always know what the client needs and I close it. [Bold claim, zero example or mechanic.]",
            # HR -- process claim + no detail
            "I designed the whole onboarding programme myself. It covers everything a new hire needs. [Owns it, can't describe any of it.]",
        ],
        "not_this": "NOT this if they only named a tool or method without a personal strength/ownership claim — that is tool_named_not_used. "
                    "NOT this if they used 'we/team' language — that is ownership_ambiguous. "
                    "ONLY fires when the personal claim is strong AND the explanation is hollow. "
                    "IMPORTANT: 'I'm really strong at X', 'I'm great at Y', 'I always do best' are personal ability claims → fire this, not example_evaded.",
    },

    # PATTERN: name dropped, nothing behind it
    "tool_named_not_used": {
        "trigger": "A specific tool / method / framework / process is NAMED — then immediately defined, listed, or abandoned. Zero operational memory of using it.",
        "pattern": "The name appears but there is no 'I did X with it', no step they ran, no problem it caused or solved. Could be a tech tool, a sales methodology, an HR framework — any named thing with no usage shown.",
        "examples": [
            # tech -- list of names
            "Vector database — ChromaDB, FAISS, Pinecone. [Three names, zero usage behind any of them.]",
            # sales -- methodology named, defined, not used
            "I use SPIN selling. It stands for Situation, Problem, Implication, Need-payoff. [Names and defines it, never shows using it.]",
            # HR -- framework named, defined, not applied
            "We used a competency framework. It's a structured way to evaluate candidates against defined criteria. [Names it, describes what it is, not what they did with it.]",
        ],
        "not_this": "NOT this if they showed real usage — 'I stored embeddings in ChromaDB', 'I ran discovery calls using SPIN', 'I scored candidates against the framework' — that is tech_choice_unjustified. "
                    "NOT this if they described a general correct flow with no tool name — that is scenario_untested. "
                    "CRITICAL: if they said what they DID with it (any operational verb), do not fire this — check SIGNAL 6.",
    },

    # PATTERN: used it, never said why that one
    "tech_choice_unjustified": {
        "trigger": "Real usage IS shown — they operated it, built with it, ran it — but never said WHY that tool/method over alternatives.",
        "pattern": "Usage is evident; the decision behind the choice is absent. You can't tell if they chose it deliberately or just defaulted to it. Applies to any domain — tech stack, sales method, HR process — wherever a choice was made but not reasoned.",
        "examples": [
            # tech -- used it, no why
            "I stored the embeddings in ChromaDB and queried them through LangChain. It worked fine. [Clear usage — but why ChromaDB over FAISS or Pinecone?]",
            # sales -- used it, no why
            "I ran discovery calls and used SPIN to structure my questions. It went well with most clients. [Used it — but why SPIN over MEDDIC or BANT?]",
            # HR -- used it, no why
            "I ran structured interviews using a scorecard for every candidate. [Clear process — but why a scorecard over panel discussion or work sample?]",
        ],
        "not_this": "NOT this if there is no evidence they used it — that is tool_named_not_used. "
                    "NOT this if they gave even a simple reason ('easier to set up', 'team was familiar with it') — then null. "
                    "tech_choice_unjustified = operational verb present, rationale absent.",
    },

    # PATTERN: correct textbook flow, no lived friction
    "scenario_untested": {
        "trigger": "Correct, complete, process-level description — technically accurate, no specific tool to chase, no personal claim — but reads memorised not lived. No edge case, no failure, no friction.",
        "pattern": "The answer is right but frictionless. It is the version from the documentation or a training course, not from having actually done it. A practitioner would remember something that was hard or broke — this person has only the clean flow.",
        "examples": [
            # tech -- correct flow, zero texture
            "Embedding goes into chunks, chunks become vectors, vectors go into the store, similarity search retrieves top results. [Correct — but no lived friction anywhere in this.]",
            # sales -- correct process, no friction
            "You qualify the lead, do discovery, present the solution, handle objections, then close. [Textbook sales process — no real deal, no real friction.]",
            # HR -- correct sequence, no texture
            "You define the role, write the JD, post it, screen CVs, do interviews, then make an offer. [Correct sequence — but anyone who read an HR guide could say this.]",
        ],
        "not_this": "NOT this if a specific named tool is the center of the answer with no usage — that is tool_named_not_used. "
                    "NOT this if they claimed personal ownership but explained it shallowly — that is explanation_shallow. "
                    "scenario_untested = correct + generic + no tool to chase + no personal claim.",
    },
}

# ---------------------------------------------------------------------------
# SIGNAL DETECTION -- direct classification.
#
# Tested against a feature-extraction + code-resolver alternative (see
# tests/test_signal_ab.py): direct classification won on both gpt-4.1-nano
# (6/10 vs 4/10) and gpt-4.1-mini (7/10 vs 6/10). Splitting the judgment into
# 11 boolean features gave the model 11 chances to be wrong instead of 1 -- 
# worse, not better. Keeping it as a single classification call.
# ---------------------------------------------------------------------------

def _build_signal_prompt_block() -> str:
    return """\
-- SIGNAL DETECTION (EVIDENCE-WEIGHTED GATE CHECK) --

You are a signal classifier. Your job is to pick the ONE signal that BEST describes
the SPECIFIC GAP in this answer. This is NOT a first-match-wins check — it is a
best-match check. Read the answer, then look at every gate, then pick the gate whose
trigger pattern is MOST STRONGLY present in the answer.

This is a SKILL-ONLY technical interview: the candidate is never asked about their own
projects or work history, so gates that only make sense for personal-narrative answers
(team-vs-personal-ownership language, "give me a real instance of using this") do not
apply here and are excluded below.

STEP 0 — RESPONSE-LEVEL GATES (G0). Only these are first-match-wins.
G0 gates describe the SHAPE of the reply itself (denial, clarification ask, off-topic).
If any G0 gate fires, return that signal immediately. CANDIDATE for this signal.

STEP 1 — CONTENT-LEVEL GATES (G1-G4). NOT first-match-wins.
Every content gate is checked. For each one, ask: "How strongly does THIS answer match
this pattern?" Then pick the gate with the STRONGEST match.

STEP 2 — VARIETY RULE (HARD). If the sidebar shows signals already fired on THIS topic,
those signals are BANNED for this turn unless literally no other content gate matches
the answer at all. Pick the STRONGEST gate that has NOT already fired on this topic.
This is a hard requirement — even if depth_ceiling_hit looks like the "best" fit, if it
already fired, choose the second-best gate. Every content signal has a real interpretation
of nearly every answer — find it.
  - Depth-ceiling-hit already fired? → look for explanation_shallow, tech_choice_unjustified, scenario_untested.
  - Scenario_untested already fired? → look for explanation_shallow, tech_choice_unjustified, depth_ceiling_hit.
  - Explanation_shallow already fired? → look for tech_choice_unjustified, scenario_untested, depth_ceiling_hit.
  The point of variety is that a fresh signal produces a fresh probe angle.
  Firing the same signal again produces the same question and wastes a turn.

STEP 3 — REINTERPRET RULE. Because gates overlap, the SAME answer can honestly fit
multiple content gates. Use the variety rule to break ties:
  - "It's basically a RAG pipeline" could be explanation_shallow OR scenario_untested.
    Pick the one that HASN'T fired yet.
  - "Chunks become vectors, vectors go into the store" could be scenario_untested OR
    explanation_shallow. Pick the one that hasn't fired yet.
Reinterpretation is not cheating — it is picking a different lens on the same gap.

---- RESPONSE-LEVEL GATES (G0) — check these FIRST ----

G0a — PURE_DENIAL: STRICT. Fires ONLY for a flat "I don't know / I'm not sure" about their
      OWN knowledge, and ONLY when that is the ENTIRE answer, nothing substantive.
      ONLY these phrasings qualify: "I don't know" | "I'm not sure" | "I don't remember" |
      "I have no idea" | "Not sure" | "No idea" — and equivalents that say the SAME thing
      (candidate genuinely doesn't know the answer to the question asked).
      NOT this — denying exposure to a specific tool/tech/concept is NOT pure_denial, even
      standing alone. "No experience with Kubernetes" | "Never used Docker" | "I haven't done
      DevOps" are about a TOOL/TOPIC, not a genuine "I don't know" — these fall through to
      G1-G4 content scoring (e.g. depth_ceiling_hit) or off_topic, NOT G0a.
      NOT this if they're saying they didn't understand the QUESTION rather than denying they
      have the answer — "I didn't get you" / "I don't get it" / "I don't understand" are about
      not following the question, not about lacking knowledge. That is G0c, not G0a.
      NOT this if they're checking the connection or whether you can hear them — "Can you hear
      me?" / "Are you there?" is not an attempt to deny knowledge, it's not addressing the
      question at all. That is also G0c, not G0a.
      EXAMPLE (pure_denial): Q: "What's the difference between an index and a full scan?"
        A: "I don't know, not sure how that works." → SIGNAL = pure_denial.
      EXAMPLE (NOT pure_denial): Q: "How would you decide between these two approaches?"
        A: "I haven't worked with this before" → this denies EXPOSURE, not KNOWLEDGE of
        the answer — falls through to G1-G4, NOT pure_denial.
      → YES: SIGNAL = pure_denial. STOP (G0 gates ARE first-match).

G0b — DENIAL_WITH_CONTINUATION: Starts with denial BUT adds substantive content?
      "...but I think it's related to X" | "...though I'd guess Y" | "...I'd try Z"
      → YES: SIGNAL = denial_with_continuation. STOP.

G0c — CLARIFICATION_REQUEST: Is candidate asking YOU to clarify/rephrase the question,
      saying they didn't understand/follow the question, OR checking the connection/
      whether you can hear them (not answering the question at all, just checking in)?
      "What do you mean?" | "Can you rephrase?" | "Can you repeat?" | "I didn't get you" |
      "I don't get it" | "I don't understand" | "Sorry, can you repeat that?" |
      "Hey, can you hear me?" | "Are you there?" | "Hello? Can you hear me?"
      → YES: SIGNAL = clarification_request. STOP.

G0d — REPHRASE_REQUEST: Is candidate asking to RESTART or correct THEIR OWN answer?
      "Let me say that again" | "I misspoke, what I meant..." | "Sorry, I said that wrong"
      → YES: SIGNAL = rephrase_request. STOP.

G0e — OFF_TOPIC: Did candidate answer a COMPLETELY DIFFERENT question — one that has
      NOTHING to do with the topic or question asked?
      Q: "Kubernetes scaling?" A: "I love React" | Q: "Indexing tradeoffs?" A: "I like Python"
      → YES: SIGNAL = off_topic. STOP.
      NOT this if they attempted to address the topic but gave a vague, shallow, or
      generic answer — a partial technical attempt is ON-TOPIC even if it lacks detail.
      Vague answers that attempt the question → fall through to G1-G4 (explanation_shallow,
      scenario_untested, etc).
      NOT this if the signal_reason would be "vague", "lacks detail", "not specific",
      "generic", or similar — those are content-level signal reasons, not off_topic.
      off_topic ONLY fires when the subject matter itself is unrelated to what was asked.

If G0a-G0e = NO: evaluate ALL of G1-G4 and pick the STRONGEST match.

---- CONTENT-LEVEL GATES (G1-G4) — only if no G0 fired ----
For each gate: rate how strongly the answer matches (strong / weak / not-present).
DO NOT stop at the first strong match — check every gate, then pick the strongest
overall that has NOT already fired on this topic (variety rule).

G1 — DEPTH_CEILING_HIT: Did they name a SPECIFIC technical detail (a mechanism, a term,
     a distinction) AND EXPLICITLY admit they don't know more about it?
     REQUIRES BOTH: (1) real named substance BEFORE the gap AND (2) an explicit
     "I don't know / not sure / no idea / can't recall" acknowledgement about it.
     "Indexes speed up reads but I don't really know how the internal structure works" ✓
     "I know embeddings are vectors but I'm not too sure how they're generated" ✓
     NOT this if the answer is just vague, shallow, or generic without an explicit
     "I don't know" admission — vague explanations of a mechanism fall through to
     G2/G3/G4 (hollow explanation, no justification, textbook flow with no friction).
     "Chunks become vectors and vectors go into a store" is NOT depth_ceiling_hit — it's
     scenario_untested (G4). A bare claim with zero specific technical detail is G2, not G1.
     G1 requires: real named substance + explicit "I don't know / not sure" about it.
     → YES: SIGNAL = depth_ceiling_hit. CANDIDATE for this signal.

G2 — EXPLANATION_SHALLOW: Confident claim about the skill + hollow explanation with no
     real mechanism, decision, or internals behind it?
     "It's basically just a RAG system" [names it, explains nothing about how/why]
     "Indexes just make things faster" [true but zero mechanism, no internals]
     → YES: SIGNAL = explanation_shallow. CANDIDATE for this signal.

G3 — TECH_CHOICE_UNJUSTIFIED: Named a real tradeoff or choice BUT never said WHY one
     option over the alternative?
     "You'd use an index here." [states the choice, no reasoning for why it's the right one]
     → YES: SIGNAL = tech_choice_unjustified. CANDIDATE for this signal.

G4 — SCENARIO_UNTESTED: Correct textbook flow but ZERO lived friction/edge case/failure mode?
     "Chunks become vectors, vectors go into store, search retrieves results"
     [Correct but memorized, no sense of what breaks or when it goes wrong]
     → YES: SIGNAL = scenario_untested. CANDIDATE for this signal.

Output exactly ONE signal. Never null, never multiple.\
"""


async def _classify_signal_from_answer(
    *,
    candidate_answer: str,
    last_question: str,
    client: Any,
    llm_model: str,
    signals_already_fired: list | None = None,
) -> tuple[str, str | None, dict | None]:
    """
    Fallback: compare the answer against every content-level signal definition
    and return (signal, signal_reason). Called only when the main eval LLM
    failed to return a valid signal.

    Respects the variety rule: banned signals (already fired on this topic) are
    excluded from the candidate set.
    """
    # Skill-only tech interviews exclude personal-narrative-only signals -- see
    # the matching exclusion note in _call_signal_classification's _CONTENT_SIGNALS.
    _ACTIVE_SIGNALS = {
        name for name in SIGNAL_DEFINITIONS
        if name not in ("ownership_ambiguous", "example_evaded", "tool_named_not_used")
    }
    _fired = set(signals_already_fired or [])
    _remaining = [name for name in _ACTIVE_SIGNALS if name not in _fired]
    if not _remaining:
        _remaining = list(_ACTIVE_SIGNALS)
    _signal_descriptions = "\n".join(
        f'"{name}": {SIGNAL_DEFINITIONS[name]["trigger"]}'
        for name in _remaining
    )
    _system = (
        "You are a signal classifier for an interview evaluation system.\n"
        "Given a question and a candidate's answer, pick the ONE signal from the list below "
        "that best describes the gap or pattern in the answer.\n"
        "Signals already fired on this topic have been EXCLUDED — pick only from the list.\n\n"
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
        if not reason and chosen in SIGNAL_DEFINITIONS:
            reason = SIGNAL_DEFINITIONS[chosen]["trigger"]
        if chosen in _remaining:
            return chosen, reason, _usage
        if chosen in _ACTIVE_SIGNALS:
            return chosen, reason, _usage
    except Exception as exc:
        logger.warning("[EVAL] _classify_signal_from_answer failed (%s) — rotating fallback", exc)
    # Deterministic rotation across banned/unfired signals -- never always the same one.
    _rotation_order = [
        "tech_choice_unjustified", "scenario_untested", "explanation_shallow", "depth_ceiling_hit",
    ]
    for name in _rotation_order:
        if name in _remaining:
            return name, SIGNAL_DEFINITIONS[name]["trigger"], _usage
    _fallback = _rotation_order[len(_fired) % len(_rotation_order)]
    return _fallback, SIGNAL_DEFINITIONS[_fallback]["trigger"], _usage


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
    signals_already_fired: list | None,
) -> tuple[str | None, str | None, dict]:
    """
    Call 2 — signal classification only, with its own 400-600 token reasoning budget.
    Brief chain-of-thought is allowed before the final JSON to reduce conjunctive-logic
    collapse that occurred when scoring and signal detection shared 200 tokens.

    Returns (signal, signal_reason, llm_usage_dict).
    """
    # Skill-only tech interviews never involve the candidate narrating their own
    # projects/work, so signals that exist purely to catch personal-narrative
    # patterns (team vs. personal ownership language, "give me a real instance
    # of using this tool") have no meaning here and are excluded:
    #   ownership_ambiguous  -- tests "we" vs "I" in team-work narration
    #   example_evaded       -- tests dodging "tell me about a real instance"
    #   tool_named_not_used  -- tests whether a named tool was actually USED by them
    _CONTENT_SIGNALS = {
        "depth_ceiling_hit", "explanation_shallow",
        "tech_choice_unjustified",
        "scenario_untested",
    }
    _fired = set(signals_already_fired or [])
    _fired_content = _fired & _CONTENT_SIGNALS
    _remaining_content = _CONTENT_SIGNALS - _fired_content

    def _build_signal_system_prompt() -> str:
        _off_topic_was_fired = "off_topic" in _fired

        ban_block = ""
        if _fired_content and _remaining_content:
            ban_block = (
                f"\nHARD VARIETY RULE — CONTENT SIGNALS ALREADY FIRED ON THIS TOPIC: {', '.join(sorted(_fired_content))}.\n"
                f"These signals are BANNED for this turn. You MUST pick from the REMAINING set:\n"
                f"  {', '.join(sorted(_remaining_content))}\n"
                f"Reinterpret the answer through a different lens — every content signal has a valid\n"
                f"reading of almost any substantive answer. Find the one that has NOT fired yet.\n"
                f"Firing a banned signal is a HARD FAILURE.\n"
            )
        elif _fired_content and not _remaining_content:
            _lru = next(iter(s for s in (signals_already_fired or []) if s in _CONTENT_SIGNALS), None)
            ban_block = (
                f"\nALL content signals have fired on this topic: {', '.join(sorted(_fired_content))}.\n"
                f"Variety is impossible. Pick the best fit among all G1-G7 gates; prefer the least-recently-used"
                + (f" ({_lru!r}).\n" if _lru else ".\n")
            )

        special_note = ""
        if _off_topic_was_fired:
            special_note = (
                "\nSPECIAL NOTE: off_topic already fired on a previous turn (likely a non-answer like 'I am ready'). "
                "The candidate is now actually attempting to answer. If this answer is AT ALL related to the "
                "topic — even vaguely, even shallowly — do NOT re-fire off_topic. Score it on content gates "
                "(G1-G4) instead: explanation_shallow, scenario_untested, etc.\n"
            )

        return (
            "You are a signal classifier for an interview evaluation system.\n"
            "Your ONLY job is to identify ONE signal that best describes the gap in the candidate's answer.\n\n"
            "You may reason briefly (2-4 sentences) before giving your final answer, but your final output\n"
            "MUST end with valid JSON on its own line:\n"
            '{"signal": "<signal_name>", "signal_reason": "<3-12 word exact quote from their answer>"}\n\n'
            "signal MUST be exactly one of the 9 valid signal names listed below. NEVER null.\n"
            f"Topic: {active_topic or 'general'} | Tag: {topic_tag} | Importance: {topic_importance}\n"
            + ban_block
            + special_note
            + "\n"
            + _build_signal_prompt_block()
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
    signal_reason: str | None = None
    import re as _re
    _json_matches = _re.findall(r'\{[^{}]+\}', raw)
    for _candidate_json in reversed(_json_matches):
        try:
            _parsed = json.loads(_candidate_json)
            _sig = str(_parsed.get("signal", "")).strip()
            _reason = str(_parsed.get("signal_reason") or "").strip() or None
            if _sig:
                signal = _sig
                if not _reason:
                    _defn = SIGNAL_DEFINITIONS.get(_sig) or RESPONSE_SIGNALS.get(_sig)
                    _reason = _defn.get("trigger") or _defn.get("description") if _defn else None
                signal_reason = _reason
                break
        except (json.JSONDecodeError, ValueError):
            continue

    return signal, signal_reason, _llm_usage


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
    signals_already_fired: list | None = None,
) -> dict:
    """
    Two dedicated LLM calls: Call 1 scores the answer, Call 2 classifies the signal.

    Returns:
      clarity, depth, specificity, grounding, overall  — quality scores
      action       — PROBE | MOVE_ON
      signal       — one signal name, never null
      signal_reason — exact quote from their answer that triggered it, or null
      reason       — short phrase for the routing decision
    """
    if is_warmup:
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "is_warmup": True,
            "action": "MOVE_ON", "forced_action": True,
            "signal": None, "signal_reason": None, "reason": "warmup turn",
        }

    if not candidate_answer or not candidate_answer.strip():
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            # Not a forced MOVE_ON: a denial (even an empty one) steps the ladder
            # DOWN one rung and stays on the same skill (see TopicState.register_denial
            # in eval.py). The skill is only closed out after 2 consecutive denials
            # (TopicState.should_exit_on_denials), never on the very first one.
            "action": "PROBE", "forced_action": False,
            "signal": "pure_denial", "signal_reason": None, "reason": "empty answer",
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
        (scoring_data, _scoring_usage), (raw_signal, signal_reason, _signal_usage) = (
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
                    signals_already_fired=signals_already_fired,
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

        # Normalise signal from the dedicated signal call
        signal = str(raw_signal).strip() if raw_signal else None

        _response_signals = {
            # pure_denial is NOT a forced topic exit: it steps the ladder down one
            # rung and stays on the same skill (TopicState.register_denial). The
            # skill only closes after 2 consecutive denials
            # (TopicState.should_exit_on_denials), applied in eval.py's decision
            # block -- not here, since that requires per-topic denial-streak state
            # this function doesn't have access to.
            "pure_denial": ("PROBE", False),                    # scores=0, ladder steps down
            "denial_with_continuation": ("CAP_SCORES", False),  # mark for scoring cap at 5, ladder steps down
            "clarification_request": ("REPHRASE", True),       # forced_action=True, scores=0
            "rephrase_request": ("ACCEPT_REPHRASE", True),     # forced_action=True, don't score this answer
            "off_topic": ("REDIRECT", True),                   # forced_action=True, scores=0
        }

        action = "PROBE"
        forced_action = False
        cap_scores_at_5 = False
        zero_scores = False

        if signal in _response_signals:
            action, forced_action = _response_signals[signal]
            if signal == "denial_with_continuation":
                cap_scores_at_5 = True
            elif signal in ("pure_denial", "clarification_request", "off_topic", "rephrase_request"):
                zero_scores = True

        # Validate content-level signals against defined signals
        if signal not in _response_signals and signal not in SIGNAL_DEFINITIONS and signal is not None:
            logger.warning("[EVAL] unknown signal %r — ignoring", signal)
            signal = None

        # If signal is still None, compare the answer against all content-level signal
        # definitions and pick the best match -- never fall back to the default probe.
        if signal is None and not zero_scores and not cap_scores_at_5:
            signal, signal_reason, _fallback_usage = await _classify_signal_from_answer(
                candidate_answer=candidate_answer,
                last_question=last_question,
                client=client,
                llm_model=llm_model,
                signals_already_fired=signals_already_fired,
            )
            if _fallback_usage:
                _eval_llm_usages.append(_fallback_usage)
            logger.info("[EVAL] signal was None — best-match classification selected %r", signal)

        # signal_reason comes from the dedicated signal call (already extracted)
        signal_reason = str(signal_reason or "").strip() or None
        if signal is None:
            signal_reason = None

        # Post-hoc variety enforcement: even if the eval LLM ignored the ban above,
        # rewrite banned content-signals to an unfired one. Response signals (G0)
        # legitimately re-fire -- only content signals are ever banned.
        _CONTENT = {
            "depth_ceiling_hit", "ownership_ambiguous", "explanation_shallow",
            "tool_named_not_used", "tech_choice_unjustified", "example_evaded",
            "scenario_untested",
        }
        _already = set(signals_already_fired or [])
        _fired_content = _already & _CONTENT
        if signal in _CONTENT and signal in _fired_content:
            _remaining = _CONTENT - _fired_content
            if _remaining:
                _reroll, _reroll_reason, _reroll_usage = await _classify_signal_from_answer(
                    candidate_answer=candidate_answer,
                    last_question=last_question,
                    client=client,
                    llm_model=llm_model,
                    signals_already_fired=list(_fired_content),
                )
                if _reroll_usage:
                    _eval_llm_usages.append(_reroll_usage)
                if _reroll and _reroll != signal:
                    logger.info(
                        "[EVAL] variety-enforcement: LLM picked banned %r on topic — rerolled to %r",
                        signal, _reroll,
                    )
                    signal = _reroll
                    signal_reason = _reroll_reason

        reason = str(data.get("reason", ""))[:120]

        # Apply score zeroing/capping for response signals (overrides answers_question zeroing if both fire)
        if zero_scores:
            clarity = 0.0
            depth = 0.0
            specificity = 0.0
            grounding = 0.0
            overall = 0.0
            reason = f"{signal} — no scoring"
        elif cap_scores_at_5:
            clarity = min(clarity, 5.0)
            depth = min(depth, 5.0)
            specificity = min(specificity, 5.0)
            grounding = min(grounding, 5.0)
            overall = min(overall, 5.0)
            reason = "denial with continuation — scores capped at 5"

        logger.info(
            "[EVAL] [OK] signal=%s action=%s | clarity=%d depth=%d spec=%d ground=%d | reason=%s",
            signal, action,
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
            "signal_reason": signal_reason,
            "reason": reason,
            "_llm_usage": _eval_llm_usages,
        }

    except Exception as e:
        logger.error("[EVAL] evaluate_answer failed (%s) — returning low-confidence recovery", e)
        return {
            "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0,
            "overall": 1.3,
            "action": "PROBE",
            "signal": None,
            "signal_reason": None,
            "reason": "eval recovery (llm slow/unavailable)",
            "is_eval_recovery": True,
        }
