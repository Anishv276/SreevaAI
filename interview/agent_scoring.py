"""
agent_scoring.py
Single LLM call per turn: scores the answer AND detects ONE signal with a reason.
The signal is LLM-detected — it reads the full conversation and understands context,
not pattern-matching on "we" tokens or word counts.

Returns:
  quality scores  : clarity, depth, specificity, grounding, overall
  routing         : action (PROBE/MOVE_ON)
  signal          : one signal name + the exact reason it fired (or null if none)
"""
from __future__ import annotations
import asyncio
import json
import logging
import re
from typing import Any, Optional

logger = logging.getLogger("interview-agent")
from interview.agent_runtime_support import EVAL_TEMPERATURE
_EVAL_DEFAULT = "gpt-4.1-mini"  # ponytail: fallback — callers pass org's llmInterviewEval. nano scored 6/10 on signal-detection A/B test, mini scored 7/10 — see tests/test_signal_ab.py


# ---------------------------------------------------------------------------
# Signal definitions — what each signal means and what it maps to.
# Used here to train the scoring LLM. Also imported by probe_strategy.py.
# ---------------------------------------------------------------------------
SIGNAL_DEFINITIONS = {

    # PATTERN: answer is a rule/habit, not a real event
    "example_evaded": {
        "trigger": "Question asked for ONE real past instance. Answer describes how they GENERALLY operate — a rule, not a memory.",
        "pattern": "The shape is 'usually I...', 'normally...', 'I always...', 'typically we...' — a description of a type of behaviour, not one specific event that happened.",
        "examples": [
            # tech — describes habit not event
            "Q: Tell me about a time your model gave wrong results. A: Usually I check the training data first and retrain.",
            # sales — describes approach not incident
            "Q: Tell me about a deal you almost lost. A: I always follow up quickly and stay persistent with the client.",
            # HR — describes process not moment
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
            # tech — started, ran out
            "I've used FAISS but I don't really have a lot of idea about how the indexing actually works.",
            # sales — started, ran out
            "I've done territory planning but the forecasting side... yeah, I'm not too sure how that part worked.",
            # HR — one word after a real question
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
            # tech — all team verbs
            "We built the retrieval pipeline, the team set up the vector store, they handled the deployment.",
            # sales — team credit
            "Our team closed the deal, we handled the negotiation together, the account manager did the follow-up.",
            # HR — collective ownership
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
            # tech — ownership claim + no internals
            "Entire functionality is completely built by me. It's a RAG-based system. [Claims it all, explains none of it.]",
            # sales — ability claim + no substance
            "I'm really strong at closing deals. I always know what the client needs and I close it. [Bold claim, zero example or mechanic.]",
            # HR — process claim + no detail
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
            # tech — list of names
            "Vector database — ChromaDB, FAISS, Pinecone. [Three names, zero usage behind any of them.]",
            # sales — methodology named, defined, not used
            "I use SPIN selling. It stands for Situation, Problem, Implication, Need-payoff. [Names and defines it, never shows using it.]",
            # HR — framework named, defined, not applied
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
            # tech — used it, no why
            "I stored the embeddings in ChromaDB and queried them through LangChain. It worked fine. [Clear usage — but why ChromaDB over FAISS or Pinecone?]",
            # sales — used it, no why
            "I ran discovery calls and used SPIN to structure my questions. It went well with most clients. [Used it — but why SPIN over MEDDIC or BANT?]",
            # HR — used it, no why
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
            # tech — correct flow, zero texture
            "Embedding goes into chunks, chunks become vectors, vectors go into the store, similarity search retrieves top results. [Correct — but no lived friction anywhere in this.]",
            # sales — correct process, no friction
            "You qualify the lead, do discovery, present the solution, handle objections, then close. [Textbook sales process — no real deal, no real friction.]",
            # HR — correct sequence, no texture
            "You define the role, write the JD, post it, screen CVs, do interviews, then make an offer. [Correct sequence — but anyone who read an HR guide could say this.]",
        ],
        "not_this": "NOT this if a specific named tool is the center of the answer with no usage — that is tool_named_not_used. "
                    "NOT this if they claimed personal ownership but explained it shallowly — that is explanation_shallow. "
                    "scenario_untested = correct + generic + no tool to chase + no personal claim.",
    },
}

# ---------------------------------------------------------------------------
# SIGNAL DETECTION — direct classification.
#
# Tested against a feature-extraction + code-resolver alternative (see
# tests/test_signal_ab.py): direct classification won on both gpt-4.1-nano
# (6/10 vs 4/10) and gpt-4.1-mini (7/10 vs 6/10). Splitting the judgment into
# 11 boolean features gave the model 11 chances to be wrong instead of 1 —
# worse, not better. Keeping it as a single classification call.
# ---------------------------------------------------------------------------

def _build_signal_prompt_block() -> str:
    return """\
-- SIGNAL DETECTION (GATE CHECK) --
Work through EACH gate in ORDER G1→G2→G3→G4→G5→G6. The FIRST gate that fires decides the
signal — STOP there and do NOT check later gates. Fill "gate_check" with your yes/no answers
for ALL gates you checked, then put the resolved signal in the SEPARATE "signal" field.

CRITICAL GATE PRIORITY: G1 through G5 OUTRANK G6. If ANY of G1-G5 fires, you MUST use that
signal. G6 (scenario_untested) is ONLY reachable when G1=no AND G2=no AND G3 bold_claim=no
AND G4 tool_named=no AND G5 wanted_instance=no or general_habit=no. If you find yourself
writing G6=yes while an earlier gate also has evidence, you have made an error — go back and
check the earlier gate again. scenario_untested is NOT a fallback for "vague" answers.

Write gate_check in EXACTLY this format (yes/no + the words that prove each).
Do NOT put the signal name inside gate_check — the signal goes in the SEPARATE "signal" field.

  "G1 ran_out=<y/n>; G2 team_only=<y/n>; G3 bold_claim=<y/n> has_substance=<y/n>;
   G4 tool_named=<y/n> usage_shown=<y/n> reason_given=<y/n>;
   G5 wanted_instance=<y/n> general_habit=<y/n>; G6 correct_but_generic=<y/n>"

After gate_check, put the resolved signal in the "signal" field (the NEXT field in the JSON).

ANSWER EACH GATE LITERALLY — quote the words that decide it:

  G1 — ran_out: did they try to answer then trail off, give a one-word reply, or say "I don't have
       much idea" AFTER attempting? (NOT a flat "I don't know" with zero attempt.)
       → if yes: SIGNAL = depth_ceiling_hit. STOP. Do NOT check G2-G6.

  G2 — team_only: is EVERY action verb "we / team / they / teammates / our group / the committee",
       with NO "I did / I built / I handled / I decided / I ran"? Look at WHO did each action.
       ("I didn't know X" is NOT a personal contribution — team_only can still be yes.)
       → if team_only=yes AND no bold "I built it all" claim: SIGNAL = ownership_ambiguous. STOP. Do NOT check G3-G6.
       THIS GATE OUTRANKS the example/habit gate (G5). A "we did it together" answer is
       ownership_ambiguous, NOT example_evaded — even if it also sounds vague or generic.
       This includes team ACHIEVEMENT answers — "we doubled the leads", "the team hit quota",
       "we crushed the quarter" — those are collective credit with no personal action = ownership_ambiguous.

  G3 — bold_claim: a loud personal claim — "I built it all", "entire thing by me", "I'm really strong
       at X", "I always do the best Y", "I single-handedly...", "I never lose...".
       has_substance: is it backed by even ONE real internal — a decision, constraint, number,
       mechanism, or real outcome?
       → if bold_claim=yes AND has_substance=no: SIGNAL = explanation_shallow. STOP. Do NOT check G4-G6.

  G4 — tool_named: is a specific tool / method / framework / process named (PyTorch, Salesforce,
       MEDDIC, HubSpot, AARRR, Greenhouse, a named framework)?
       usage_shown: is there an OPERATIONAL VERB tying THEM to it — "I trained/stored/queried/ran/built/
       configured/tracked/sourced/deployed X with it"? (A pure definition "X is a framework that..." or
       a bare list "we used A, B, C" = usage_shown NO.)
       reason_given: did they say WHY that tool over alternatives?
       → if tool_named=yes AND usage_shown=no: SIGNAL = tool_named_not_used. STOP. Do NOT check G5-G6.
       → if tool_named=yes AND usage_shown=yes AND reason_given=no: SIGNAL = tech_choice_unjustified. STOP. Do NOT check G5-G6.
       → if tool_named=yes AND usage_shown=yes AND reason_given=yes: continue to G5.

  G5 — wanted_instance: did the QUESTION ask for a specific past time/example/story
       ("tell me about a time", "a specific deal", "a time a candidate...")?
       general_habit: is the ANSWER FIRST-PERSON habit language — "I usually...", "I normally...",
       "I always...", "I just..." — describing what THEY personally tend to do?
       → if BOTH yes AND no real instance given: SIGNAL = example_evaded. STOP. Do NOT check G6.
       NOTE: an impersonal recipe ("you do X, then Y, then Z") is NOT first-person habit — that is G6.
       NOTE: a team-credit answer ("we doubled the leads", "the team hit quota") is G2, already handled above.

  G6 — correct_but_generic: ONLY check this gate if G1=no AND G2=no AND G3 bold_claim=no AND
       G4 tool_named=no AND G5 fired=no. Is the answer an impersonal, technically-correct process
       recipe — a "you do X, then Y, then Z" list, or a clean textbook flow — with no named tool,
       no first-person personal claim, and no real specific event?
       (e.g. "you prospect, qualify, do discovery, present, handle objections, then close" /
        "you define the audience, set the goal, create content, launch, measure ROI")
       → if yes (AND all earlier gates were no): SIGNAL = scenario_untested. STOP.

  If no gate fired → SIGNAL = null.

THE SIGNAL YOU OUTPUT MUST EQUAL THE ONE YOUR GATE CHECK LANDED ON. No exceptions.
If G6 fires but an earlier gate could also have fired, go back and use the earlier gate's signal.

SIGNAL REASON RULE:
  signal_reason = ONE short exact quote (3-12 words) from their actual words that proves the signal.
  GOOD: "we built the pipeline, the team decided"   BAD: "used team language throughout"
  If signal is null → signal_reason is null.\
"""


async def evaluate_answer(
    candidate_answer: str,
    last_question: str,
    topic_follow_up_count: int,
    transcript_lines: list,
    client,
    org_id: Optional[str] = None,
    llm_model: str = _EVAL_DEFAULT,
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
    Single merged LLM call: scores answer quality + detects one signal with reason.

    Returns:
      clarity, depth, specificity, grounding, overall  — quality scores
      action       — PROBE | MOVE_ON
      signal       — one of the 5 signal names, or null
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
            "action": "MOVE_ON", "forced_action": True,
            "signal": None, "signal_reason": None, "reason": "empty answer",
        }

    # Denial detection — two distinct cases:
    #   pure denial  : answer is ONLY a denial phrase, nothing substantive follows → zero + MOVE_ON
    #   denial + continuation : candidate starts with "I don't know" but then adds real content
    #                           → score normally, don't short-circuit
    _denial_phrases_re = re.compile(
        r"\b(don'?t|do not|can'?t|cannot|didn'?t|did not|never|haven'?t|have not)\s+"
        r"(remember|recall|know|used|worked|tried|built|done|do|create|make|work on)?\b"
        r"|\bI forgot\b|\bno idea\b|\bnot sure\b",
        re.IGNORECASE,
    )
    _answer_stripped = candidate_answer.strip()
    _answer_words = _answer_stripped.split()
    _has_denial = bool(_denial_phrases_re.search(_answer_stripped))
    # "continuation" = meaningful words after the denial phrase (conjunction + more content)
    _continuation_re = re.compile(
        r"\b(but|however|although|though|except|actually|what i|what we|i did|i built|i used|i worked)\b",
        re.IGNORECASE,
    )
    _has_continuation = bool(_continuation_re.search(_answer_stripped))
    # Pure denial: short answer, denial present, no real continuation
    if _has_denial and not _has_continuation and len(_answer_words) <= 15:
        logger.info("[EVAL] short-circuit: pure denial (%r)", candidate_answer[:60])
        return {
            "clarity": 0, "depth": 0, "specificity": 0, "grounding": 0, "overall": 0.0,
            "action": "MOVE_ON", "forced_action": True,
            "signal": None, "signal_reason": None, "reason": "explicit denial",
        }
    # Denial + continuation: let eval score it, but cap scores so a "I don't know but..."
    # answer can't accidentally saturate a topic — the agent will keep probing.
    _is_partial_denial = _has_denial and _has_continuation

    word_count = len(candidate_answer.strip().split())
    recent_context = "\n".join(transcript_lines[-6:]) if transcript_lines else ""

    _followup_cutoff = {"fresher": 2, "mid": 3, "experienced": 5, "senior": 6}.get(candidate_band, 3)
    _band_note = {
        "fresher": (
            "FRESHER — score generously on grounding (limited work history).\n"
            "Do NOT expect tradeoffs, scale, or architecture depth."
        ),
        "mid": "MID-LEVEL — expect clear ownership and at least one real decision.",
        "experienced": "EXPERIENCED — expect depth, specifics, and real tradeoffs. Do not score vague answers high.",
        "senior": "SENIOR — expect strategic judgment and high-stakes decisions.",
    }.get(candidate_band, "Probe for real ownership and specific decisions.")

    _signal_block = _build_signal_prompt_block()

    def _build_system_prompt() -> str:
        ctx = (
            "You are an experienced interviewer scoring a candidate's answer.\n"
            "Think like a senior hiring manager who has interviewed hundreds of people.\n"
            "You know the difference between someone who did the work and someone who read about it.\n"
            "Output ONLY valid JSON:\n"
            '{"clarity":0-10,"depth":0-10,"specificity":0-10,"grounding":0-10,'
            '"gate_check":"<fill in each gate result, then the signal it leads to — see GATE CHECK below>",'
            '"signal": one of exactly ["example_evaded","depth_ceiling_hit","ownership_ambiguous",'
            '"explanation_shallow","tool_named_not_used","tech_choice_unjustified","scenario_untested"] or null,'
            '"signal_reason":"<3-12 word exact quote from their answer>" or null,'
            '"reason":"<one phrase from their answer that drove your call>"}\n\n'
            "CRITICAL: signal must be one of the 7 names above or null. "
            "Never invent a new signal name. Never put the candidate's words as the signal.\n"
            "CRITICAL: gate_check MUST be filled in BEFORE signal — it forces you to look at the\n"
            "discriminating facts. The signal MUST match the gate that fired in your gate_check.\n\n"

            f"Role: {job_title or 'not specified'} | Topic: {active_topic or 'general'}"
            f" | Tag: {topic_tag} | Importance: {topic_importance}\n"
        )
        if topic_probe_focus:
            ctx += f"Probe focus: {', '.join(topic_probe_focus)}\n"
        if signals_already_fired:
            ctx += (
                f"Signals already fired on this topic, in order: {', '.join(signals_already_fired)}.\n"
                "IMPORTANT: You must still work through the gate check in order (G1\u2192G2\u2192G3\u2192G4\u2192G5\u2192G6). "
                "Do not fire the same signal again unless this answer has a genuinely NEW instance of that "
                "gap distinct from what already fired. If the same gate fires again, look harder at the OTHER "
                "gates — each fires on a different answer shape. "
                "Do NOT skip directly to scenario_untested just because earlier signals have already fired.\n"
            )
        ctx += (
            "Tag context: RESUME_TOPIC = they claimed this experience, hold them to it. "
            "JD_TOPIC = they may be learning, credit honest partial exposure. "
            "ROLE_TOPIC = conceptual check, one grounded answer is enough.\n\n"

            "This is voice-transcribed speech — score the meaning, not the grammar.\n\n"
            + (
                "PARTIAL DENIAL NOTE: The candidate started with 'I don't know' or 'I forgot' "
                "but then added some content. Score what content exists, but cap all scores at 5 max.\n\n"
                if _is_partial_denial else ""
            ) +
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
        ctx += _signal_block
        return ctx

    logger.info(
        "[EVAL] > evaluate_answer | model=%s words=%d follow_ups=%d topic=%s",
        llm_model, word_count, topic_follow_up_count, active_topic or "?",
    )

    try:
        stream = await asyncio.wait_for(
            client.chat.completions.create(
                model=llm_model,
                temperature=EVAL_TEMPERATURE,
                max_tokens=400,  # gate_check reasoning (~80 tok) is emitted before signal — raised from 320 to prevent truncation cutting off signal field
                stream=True,
                messages=[
                    {
                        "role": "system",
                        "content": _build_system_prompt(),
                    },
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
        # _usage is chunk.usage (not the full completion), so pass it as the
        # completion arg — extract_usage reads .prompt_tokens/.completion_tokens
        # directly when .usage is absent (falls back to the object itself).
        _eval_llm_usage = _extract_usage(_usage, llm_model) if _usage else {
            "model": llm_model, "inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0,
        }

        data: dict[str, Any] = json.loads(raw)

        def _clamp(v: Any, lo: float = 0.0, hi: float = 10.0) -> float:
            try:
                return max(lo, min(hi, float(v)))
            except (TypeError, ValueError):
                return 0.0

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

        # Routing (PROBE/MOVE_ON) is no longer asked of the model -- saturation/
        # weak_exit/dry_topic in eval_pipeline.py decide that. This call only scores.
        # Validate signal against our 5 defined signals
        raw_signal = data.get("signal")
        signal = str(raw_signal).strip() if raw_signal else None
        if signal and signal not in SIGNAL_DEFINITIONS:
            logger.warning("[EVAL] unknown signal %r — ignoring", signal)
            signal = None

        signal_reason = str(data.get("signal_reason") or "").strip() or None
        if signal is None:
            signal_reason = None

        reason = str(data.get("reason", ""))[:120]
        gate_check = str(data.get("gate_check", ""))[:300]

        logger.info(
            "[EVAL] [OK] signal=%s | clarity=%d depth=%d spec=%d ground=%d | reason=%s",
            signal or "none",
            int(clarity), int(depth), int(specificity), int(grounding),
            repr(reason),
        )
        if gate_check:
            logger.info("[EVAL] gate_check=%r", gate_check)
        if signal:
            logger.info("[EVAL] signal_reason=%r", signal_reason)

        return {
            "clarity": clarity, "depth": depth,
            "specificity": specificity, "grounding": grounding,
            "overall": overall,
            "action": "PROBE",
            "signal": signal,
            "signal_reason": signal_reason,
            "reason": reason,
            "_llm_usage": _eval_llm_usage,
        }

    except (asyncio.TimeoutError, Exception) as e:
        _is_timeout = isinstance(e, asyncio.TimeoutError)
        logger.error(
            "[EVAL] evaluate_answer %s (%s) — returning low-confidence recovery",
            "timed out" if _is_timeout else "failed", e,
        )
        return {
            "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0,
            "overall": 1.3,
            "action": "PROBE",
            "signal": None,
            "signal_reason": None,
            "reason": "eval recovery (llm slow/unavailable)",
            "is_eval_recovery": True,
        }
