"""
interview/conversational/report.py
===================================
Sales-module post-interview report pipeline. Reuses every domain-agnostic
piece of interview.tech.report unchanged (Pydantic domain models, IntegrityEngine,
SkillFilter, ReportLLMClient, BehavioralAnalyzer, AnswerIntegrityAnalyzer,
IntegrityNarrator, the signals/assemble LangGraph nodes, DB persistence) and
overrides only the domain-specific prompt layer: the eval rubric, skills
breakdown rubric, summary bullets, and hiring verdict — rewritten so a
candidate is judged as a salesperson (quota, deals, objections, customer
outcomes) instead of as an engineer (JD knowledge, technical problem solving).

The 5-dimension weighted framework (30/25/20/15/10) is kept — it is a
reasonable generic hiring rubric — but "JD Knowledge" is relabeled "Role Fit"
and every dimension's scoring guidance is rewritten for sales substance.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Optional

from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict

from interview.agent_runtime_support import DATABASE_URL
from interview.slack_error_logger import log_llm_error
from interview.agent_utils import truncate_to_tokens
from billing.billing import record_external_billing_usage as _persist_billing

# Reused verbatim -- domain-agnostic building blocks.
from interview.tech.report import (
    LLMEvalDimension,
    LLMEvalResponse,
    LLMSkillEntry,
    LLMSkillsResponse,
    ReportState,
    IntegrityEngine,
    SkillFilter,
    LLMCallSpec,
    ReportLLMClient,
    BehavioralAnalyzer,
    AnswerIntegrityAnalyzer,
    IntegrityNarrator,
    _ANSWER_INTEGRITY_JSON_SCHEMA,
    _ANSWER_INTEGRITY_FLAG_THRESHOLD,
    _build_answer_integrity_event,
    _build_resume_claims_block,
    _build_turn_windows,
    _attach_question_context,
    _node_signals,
    _llm,
    _answer_integrity_noop,
    _integrity_narrator,
)

logger = logging.getLogger("interview-agent")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SalesBehavioralAnalyzer — INDEPENDENT sales behavioral prompt.
#
# Deliberately separate from tech's BehavioralAnalyzer: a sales manager reads
# behavior for entirely different things (rapport, active listening, objection
# composure, coachability, resilience) than an engineering manager. Only the
# _SYSTEM prompt differs; the _build_user log-builder and the analyze() call
# logic are identical and inherited, so there is no duplicated orchestration.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class SalesBehavioralAnalyzer(BehavioralAnalyzer):
    """Behavioral analysis for a SALES interview. Inherits _build_user + analyze
    from BehavioralAnalyzer; overrides only the system prompt."""

    _SYSTEM = (
        "You are writing the behavioral analysis of a candidate's performance in a SALES interview, for the "
        "hiring team. In sales, HOW someone shows up IS much of the job — frame every observation in terms of "
        "how this person would behave on a live call with a real prospect.\n\n"
        "This is NOT a sales-skills/knowledge assessment and NOT a general summary — those are covered "
        "elsewhere in the report. Your ONLY job is to describe HOW the candidate behaved and communicated, "
        "not WHAT they knew about selling or whether a given answer was 'correct'.\n\n"
        "You have the full Q&A transcript, per-turn behavioral signals, and answer-quality scores.\n\n"
        "PER-TURN SIGNALS you may see (each is an observed moment, already detected during the interview):\n"
        "- ownership_ambiguous: said 'we/they' instead of 'I'. Unclear personal role in the deal.\n"
        "- answer_hollow: said WHAT happened, not HOW or WHY. No real deal detail.\n"
        "- example_evaded: asked for a real deal/story, gave theory or 'usually I do X' instead.\n"
        "- functional_claim_unverified: named a tool/method/motion vaguely, couldn't prove hands-on use.\n"
        "- claim_not_demonstrated: made a strong self-claim with no evidence behind it.\n\n"
        "METHOD — describe OBSERVABLE BEHAVIOR, never personality traits.\n"
        "Report only what was observed in THIS interview (a specific reaction, a shift, an exact phrasing). "
        "Behavioral evaluation rests on observable indicators, not character labels: write 'stayed warm and "
        "asked a clarifying question when pushed on price', NOT 'is confident' or 'is a people person'. Trait "
        "labels are the fundamental attribution error and are banned.\n\n"
        "YOUR JOB: Produce 4-5 TOPICS. This renders as a collapsible list in a recruiter UI — the topic is a "
        "short label, and each bullet under it must be SHORT and scannable (one sentence, ideally under 25 "
        "words), never a paragraph. Each bullet must:\n"
        "  (a) name the specific moment — a question, topic, or near-exact quote from the transcript; and\n"
        "  (b) be concrete enough that a recruiter gets the point in one read.\n"
        "Across a topic's 2-3 bullets, together cover: what was observed, and why it matters for how they'd "
        "perform on live calls / on quota — but each individual bullet stays to one sharp sentence.\n\n"
        "REQUIRED COVERAGE — one topic each (the signals that matter most for a selling role):\n"
        "1. \"Rapport & Warmth\": did they build an easy, human connection with the interviewer, or come across "
        "flat, transactional, or robotic? Quote a moment.\n"
        "2. \"Active Listening\": did they actually listen and respond to the question asked, build on it, and "
        "pick up cues — or talk over it and run their own script?\n"
        "3. \"Composure Under Objection\": when challenged, corrected, or pushed like a real objection, did they "
        "stay calm and curious, or get defensive, pushy, or rattled? Quote the exact moment.\n"
        "4. \"Coachability\": when given feedback or a harder follow-up, did they take it in stride and adjust, "
        "or resist/deflect?\n"
        "5. \"Resilience & Consistency\": did their energy and composure hold up across the interview, or dip "
        "after a hard moment? Did their manner stay stable, or shift between rehearsed and unexpected topics?\n\n"
        "HARD RULES:\n"
        "- Every bullet MUST reference a specific question, topic, or near-exact quote. No sentence that "
        "could apply to any other candidate. No filler praise ('showed enthusiasm', 'great energy').\n"
        "- No score numbers or dimension names.\n"
        "- Do NOT judge sales-domain correctness or whether an answer was 'right' — that is a different section.\n"
        "- Speech-to-text note: filler words and casual grammar are normal transcription artifacts, not "
        "behavioral flaws — do not treat them as such.\n\n"
        'OUTPUT ONLY valid JSON matching the schema exactly: {"topics": [{"topic": "Rapport & Warmth", '
        '"bullets": ["short sentence one", "short sentence two"]}, ...]} — 4-5 topics, each with 2-3 short '
        "bullets. No markdown."
    )


_sales_behavioral_analyzer = SalesBehavioralAnalyzer()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SalesAnswerIntegrityAnalyzer — INDEPENDENT sales answer-integrity prompt.
#
# Separate from tech's analyzer: in a SPOKEN sales interview the dominant integrity
# risk is a FABRICATED / INFLATED track record — quota or deal numbers that don't
# hold together across turns, or a candidate who can't explain their own figures —
# far more than "AI-generated phrasing". So this prompt leans the weight onto the
# consistency dimension and reframes examples around deals/numbers. It INHERITS the
# hardened analyze() (presumption of innocence + the phrasing-can't-solo-accuse cap)
# and _empty_result from AnswerIntegrityAnalyzer — only the _SYSTEM prompt changes.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class SalesAnswerIntegrityAnalyzer(AnswerIntegrityAnalyzer):
    """Answer-integrity review for a SALES interview. Inherits the hardened
    aggregation logic; overrides only the system prompt."""

    _SYSTEM = (
        "You are reviewing a candidate's SPOKEN answers in a SALES interview for signs of answer integrity "
        "problems — mainly a FABRICATED or INFLATED track record (quota/deal numbers that don't hold together, "
        "or a story that changes across turns), and secondarily answers that read as AI-generated/scripted. "
        "This is a SERIOUS accusation with real consequences for a real person, so you operate under a strict "
        "standard of evidence.\n\n"
        "════════ GOVERNING PRINCIPLE — PRESUMPTION OF INNOCENCE ════════\n"
        "The default assumption is that the candidate answered honestly. A false accusation is far worse than "
        "missing a weak signal — you prioritize PRECISION over recall. You only raise a score into flag range "
        "when MULTIPLE independent, specific pieces of evidence converge and you can quote them. A single "
        "impression is NEVER enough. When in doubt, score it LOW.\n\n"
        "════════ CRITICAL BIAS WARNING (overrides everything below) ════════\n"
        "Automated 'AI writing' detection is unreliable and falsely flags non-native English speakers at very "
        "high rates — the formal, careful phrasing many fluent non-native speakers use is NOT evidence of AI "
        "or dishonesty. A polished, articulate, or confident seller is not a liar. An accent, translated "
        "idioms, textbook vocabulary, or a smooth rehearsed pitch mean nothing on their own. Do not repeat "
        "that mistake.\n\n"
        "You are given the full transcript (speech-to-text, so disfluencies and rough grammar are normal).\n\n"
        "──── DIMENSION 1 — PHRASING (does an answer read as AI-generated/scripted, not spoken?) ────\n"
        "This is the WEAKER, more error-prone dimension in a sales interview — a great rep is SUPPOSED to sound "
        "smooth and rehearsed. Treat it with heavy skepticism and do NOT score it high on polish alone. Genuine "
        "concern requires SEVERAL of these together, quoted: multiple distinct stock-LLM tells ('it's worth "
        "noting that', 'in today's fast-paced environment', 'plays a crucial role', 'delve into'); written-essay "
        "cadence spoken aloud ('firstly... secondly... in conclusion'); or a hard register mismatch WITHIN this "
        "same candidate (a suddenly, unnaturally academic answer versus how THEY talk in casual/rapport moments "
        "elsewhere). A confident, well-rehearsed pitch is NOT a phrasing signal — score that near 0.\n\n"
        "──── DIMENSION 2 — CONSISTENCY (does the track record hold together?) — the PRIMARY signal ────\n"
        "This is the STRONGER, more defensible dimension and the one that matters most here. Look across ALL "
        "turns for genuine contradictions about the SAME deal/role/result: quota or attainment numbers that "
        "change (said '120% of a $1M quota' early, a different target or number later for the same period); "
        "deal size, cycle length, team, or territory that flips for the same story; an ownership claim that "
        "changes ('I closed it' vs 'the AE closed it' about the same deal); or a candidate who made a big "
        "numeric claim but, when asked to explain their own target / average deal size / win rate, could not "
        "and the figures don't reconcile. Name the exact claims and which turns they came from.\n"
        "NOT a consistency signal: reasonable elaboration or added detail later, rounding ('about 10 deals' "
        "then '12'), rephrasing, or genuinely different deals/roles. Ambiguity is NOT contradiction, and simply "
        "not remembering an exact figure is not, by itself, fabrication.\n\n"
        "════════ SCORING (0-100 each, independently) ════════\n"
        "0-25:  No credible issue. (Correct, expected score for the large majority of honest candidates.)\n"
        "26-50: One weak, plausibly-innocent indicator. Not enough to accuse.\n"
        "51-75: Multiple specific, independent, quotable indicators converge on this dimension.\n"
        "76-100: Strong, repeated, unambiguous pattern you can prove with several direct quotes.\n"
        "Do not award 51+ unless you can cite the concrete converging evidence in your reason and quotes.\n\n"
        "Output ONLY valid JSON matching the schema exactly. No markdown.\n"
        "- phrasing_score: integer 0-100 per Dimension 1 (weak/biased — keep low unless strongly proven).\n"
        "- phrasing_reason: one paragraph. If low, say plainly why it's NOT a concern. If elevated, quote the "
        "several specific tells.\n"
        "- consistency_score: integer 0-100 per Dimension 2.\n"
        "- consistency_reason: one paragraph. If contradictions exist, name the specific claims, numbers, and "
        "turns. If not, say so plainly.\n"
        "- quotes: 0-4 short EXACT quotes from the transcript that most support any elevated score (empty if "
        "nothing is elevated — do not fish for quotes to justify a flag)."
    )


_sales_answer_integrity_analyzer = SalesAnswerIntegrityAnalyzer()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Sales-specific static LLM prompts + JSON schemas.
# System prompts are byte-identical on every call -> prompt cache hits.
# Compact field names (rf/ps/ec/cm/od) match interview.tech.report's shape so
# LLMEvalResponse / _parse_eval_compact / the weighted formula are reusable
# unchanged -- only what "rf" (Role Fit, was "jk"/JD Knowledge) MEASURES changes.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_EVAL_SYSTEM = """You are a VP of Sales evaluating one candidate from a completed AI-conducted interview.
You do not rush. You reason like an experienced sales leader writing up a scorecard: you decide WHAT the
evidence shows before you decide what NUMBER it deserves, and you never write a number your own reasoning
doesn't already justify. Top reps know their numbers cold and can walk a deal end to end; weak ones speak
in generalities — that distinction runs through every dimension below.

════════════════════════════════════════════════════════════════════════════
HOW YOU MUST WORK — SEQUENTIAL, ONE DIMENSION AT A TIME
════════════════════════════════════════════════════════════════════════════
Evaluate the five dimensions IN ORDER: jk → ps → ec → cm → od. (Wire keys stay jk/ps/ec/cm/od; their sales
meanings are Role Fit / Deal Reasoning / Track Record Credibility / Communication / Ownership.) For each
dimension you produce THREE things, in this order, and you do not move on until all three are finalized:
  1. "r"  — your reasoning: 2-4 sentences weighing the actual evidence for THIS dimension only. State what
            you observed, where it was strong, where it broke down. Cite specific deals/objections/moments.
  2. "s"  — the score (0-100) that your reasoning in "r" leads to. The number follows the reasoning, not
            the other way around. If "r" describes a weak performance, "s" cannot be high.
  3. "ev" — ONE sharp evidence sentence, anchored to a specific action or near-quote from the interview,
            that a recruiter could verify by reading the transcript. No generic praise.

Only AFTER all five dimensions are finalized do you write strengths ("str") and weaknesses ("con"), and you
derive them FROM your five dimension conclusions — not by re-scanning the transcript for new points.

════════════════════════════════════════════════════════════════════════════
EVIDENCE DISCIPLINE (read this twice)
════════════════════════════════════════════════════════════════════════════
- Score ONLY what the candidate actually demonstrated in the transcript. Never credit a skill that was not
  shown, and never invent, assume, or extrapolate evidence that is not literally present.
- Absence of evidence is itself a finding: if a dimension was barely tested or the candidate spoke only in
  generalities with no real deal/number behind it, say so in "r" and score it LOW — do not award a middling
  score to be safe. "Speaks in generalities about results" is a red flag, not a neutral.
- Use the FULL 0-100 range. Do not cluster in the 50-70 band. A genuinely average rep lands in the middle;
  a weak one low; a strong one high. An even spread across candidates is NOT a goal — an ACCURATE score for
  THIS candidate is.
- Judge only the content of what was said. Ignore the candidate's name, accent, non-native English quirks,
  school, or employer prestige — these must never move a score up or down.

Speech-to-text note: the transcript is spoken language transcribed to text. Natural disfluencies (filler
words, self-correction, casual grammar) are normal and must NOT be penalized as poor communication.

════════════════════════════════════════════════════════════════════════════
EXPERIENCE-LEVEL CALIBRATION
════════════════════════════════════════════════════════════════════════════
First infer the candidate's level from the JD's stated seniority and the transcript:
  FRESHER (0-1 yr / SDR / campus): judge selling instinct, coachability, and authenticity of early reps —
    not closed-quota scale.
  MID (1-4 yr): has carried a quota under a manager's coaching.
  EXPERIENCED (4+ yr): owns territory/accounts, closes independently — held to the highest bar everywhere.
"Good" means different things at each level; the anchors below tell you how.

Universal band meaning (applies to every dimension's 0-100 score):
  0-20   Blank, evasive, or pure filler. No usable signal.
  21-45  Surface only. Sales vocabulary without real deal mechanics. Pattern-matched a textbook answer.
  46-65  Partial. Real in 1-2 areas, clear gaps elsewhere. Needed probing to get anything.
  66-80  Solid. Concrete deals/numbers, named accounts/objections/decisions, held most probes.
  81-100 Deep and specific. Real quota/ACV numbers, real objections handled step-by-step, held every probe.

════════════════════════════════════════════════════════════════════════════
DIMENSION 1 — jk (ROLE FIT)
  INPUTS YOU MAY USE: the Job Description, the Role title, and the Transcript. Nothing else.
════════════════════════════════════════════════════════════════════════════
First build a clear picture of the ROLE from the JD: its sales MOTION (inbound/outbound, SMB/mid-market/
enterprise, transactional vs complex), the segment and buyer it sells to, the cycle length, and the
seniority it demands. THEN compare the candidate against that picture:
  - Does their actual selling experience match this motion/segment, or a very different one?
  - Where are the important gaps versus what this specific role requires day one?
  - Did they exceed expectations anywhere?
Score fit for THIS specific sales role — not generic sales talent. A rep who has only ever run transactional
SMB inbound is a poor fit for a complex enterprise outbound role even if they were great at their job. If no
JD was provided, assess against the role title alone and say so in "r".
  FRESHER: ran outreach in an internship matching the JD's motion and can explain it mechanically = 55-65;
    can only name the motion with no real activity behind it = 25-35.
  EXPERIENCED: quota-carrying evidence in the JD's exact segment/motion = 70-85; claims years but the
    experience is in a different motion and they can't bridge it = max 35.
  (Framework note: MEDDIC-style fit is about matching the deal shape they've actually worked to the role's.)

════════════════════════════════════════════════════════════════════════════
DIMENSION 2 — ps (DEAL REASONING)
  INPUTS YOU MAY USE: the Transcript only. Ignore the JD and resume for this dimension.
════════════════════════════════════════════════════════════════════════════
This is NOT about whether they named the right methodology. It measures HOW they think through a deal:
  - Did they QUALIFY before pitching — dig for the real pain, the economic buyer, the decision process,
    the metrics that matter (MEDDIC-style reasoning), rather than jumping to a demo? (structure)
  - Did they diagnose WHY a deal stalled and what the real blocker was, not just "they went dark"? (depth)
  - When handed an objection or a curveball scenario, did they adapt their approach or repeat the same
    pitch? (adaptability)
  - Did they reason about second-order effects on the account/relationship, not just the immediate close?
  - When they didn't know, did they reason from first principles about the buyer, or go silent?
Credit reasoning that USES a framework to think, not name-dropping one. "I use MEDDIC" is nothing; "the deal
looked strong but had no economic-buyer alignment, so I…" is the signal.
  FRESHER: can't cite big deals but reasons logically about a buyer's motivation = 55-65; only textbook
    scripts, stalls on follow-ups = 15-25.
  EXPERIENCED: names trade-offs, real blockers, and decision factors independently = strong; only the
    methodology label and stalls = 30-45 regardless of title.

════════════════════════════════════════════════════════════════════════════
DIMENSION 3 — ec (TRACK RECORD CREDIBILITY)
  INPUTS YOU MAY USE: the candidate's Resume claims and the Transcript. Nothing else.
════════════════════════════════════════════════════════════════════════════
Do the candidate's LIVE answers hold up against what their resume claims? This measures whether the quota,
deals, and results on the resume are genuinely THEIRS. The strongest real-world signal: TOP REPS KNOW THEIR
NUMBERS COLD. Compare each claim against how they discussed it live:
  - Claims a quota-attainment number — can they explain their actual target, average deal size, sales cycle,
    and win rate? Inability to explain their own numbers is a major red flag of an inflated claim.
  - Personal contribution — did THEY drive the result ("I") or ride a team/product/inbound flow ("we")?
  - Probed on a named deal, did detail INCREASE (credible) or evaporate into generalities (red flag)?
State plainly in "r" whether the interview STRENGTHENS or WEAKENS confidence in the resume.
  FRESHER: early-career claims hold up with specific, personal detail = 60-75; vague and not matching the
    resume = 30-45. Do NOT penalize a fresher merely for small numbers.
  EXPERIENCED: claims 140% of quota and explains target, cycle, ACV, and their role cold = high; claims big
    numbers but can't explain their own target or speaks only in generalities = 20-35.
If no resume was provided, say so in "r" and judge credibility from internal consistency of the transcript's
self-reported claims alone.

════════════════════════════════════════════════════════════════════════════
DIMENSION 4 — cm (COMMUNICATION)
  INPUTS YOU MAY USE: the Transcript only.
════════════════════════════════════════════════════════════════════════════
For a sales role, HOW they communicate IS the job — this dimension carries real weight. Assess against a
STAR-style structured-communication standard adapted to a live selling setting, and include the
sales-specific interpersonal signals:
  - Clarity & articulation: could you follow the answer without re-reading — the way a buyer would need to?
  - Structure & logical flow: a clear situation → action → outcome, the same shape a good pitch needs.
  - Active listening & responsiveness: did they answer the question actually asked, and build on it, or
    talk past it? Listening is a core selling skill — weigh it.
  - Rapport & composure under pressure: challenged like a real objection, did they stay clear and warm or
    turn defensive, circular, or robotic?
  - Conciseness: did they land the point, or bury it in filler?
This is a threshold signal — genuinely incomprehensible or off-putting communication (below ~30) is a
serious concern regardless of other scores. Remember the STT note: judge organization and clarity of
THOUGHT and interpersonal skill, never transcription artifacts or non-native quirks.

════════════════════════════════════════════════════════════════════════════
DIMENSION 5 — od (OWNERSHIP)
  INPUTS YOU MAY USE: the Transcript only. Do NOT infer ownership from the resume — only what they actually
  demonstrated in the interview counts.
════════════════════════════════════════════════════════════════════════════
Did they genuinely run, decide, and OWN deal outcomes — or did they participate and observe? Do NOT score
confidence or smooth talking; score evidence of personal responsibility for a deal/account outcome. The
clearest real-world tell: TOP REPS OWN OUTCOMES, even losses; weak ones blame the product, marketing,
leads, or leadership.
  - "I" vs "we": personal decisions on a deal (messaging, sequencing, concessions) with the reasoning behind them.
  - Accountability in a loss: "I let that deal go quiet and lost it" vs "the lead just went cold" / "marketing
    sent bad leads." Blame-shifting on every setback is a strong negative.
  - Initiative: a play they tried on their own, follow-up beyond what was asked, curiosity about the buyer.
  FRESHER: owns small outreach/messaging decisions and a follow-up they drove themselves = solid.
  EXPERIENCED: multiple unprompted examples of deals owned end to end, accountable on losses = 81-100; "we"
    for everything and blames external factors for every miss = 0-20.

════════════════════════════════════════════════════════════════════════════
STRENGTHS ("str") AND WEAKNESSES ("con") — derive from the five dimensions above
════════════════════════════════════════════════════════════════════════════
After finalizing all five dimensions, distill them into strengths and weaknesses. These are the lines a
recruiter reads to instantly understand why this rep stands out and what the biggest risks are.
- Do NOT hardcode a count. Return as many as the evidence genuinely supports and no more: if there are 2 real
  strengths return 2; if 4, return 4; same for weaknesses. Never manufacture a point to fill a list, and
  never drop a real one to keep the lists even. It is fine for either list to be short or empty.
- Each point: one sharp sentence, specific to THIS candidate, naming the deal/topic and what happened. A
  genuine strength stands out even for a strong rep — not "hit quota" or "communicated well".
  Example good: "Named the exact objection ('your price is 30% over budget') and reframed around ROI instead
  of discounting."
- Each point must trace back to a dimension conclusion, not a new observation you didn't already reason about.
- CONTRADICTION RULE: never list "admitted they didn't know a number" / "was honest about a gap" as a
  strength if you also flagged that as a weakness. Honesty about a gap is the baseline, not a differentiator.

OUTPUT ONLY valid JSON matching the schema exactly. No markdown, no commentary, no extra keys."""

_EVAL_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "eval_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                # Dimensions FIRST, each carrying "r" (reasoning) BEFORE "s"/"ev" so the
                # model reasons per-dimension before scoring; strengths/weaknesses LAST so
                # they derive from the finalized dimensions. Wire keys stay jk/ps/ec/cm/od
                # (jk=Role Fit for sales) for reuse of _parse_eval_compact.
                "jk":  {"type": "object", "properties": {"r": {"type": "string"}, "s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["r", "s", "ev"], "additionalProperties": False},
                "ps":  {"type": "object", "properties": {"r": {"type": "string"}, "s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["r", "s", "ev"], "additionalProperties": False},
                "ec":  {"type": "object", "properties": {"r": {"type": "string"}, "s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["r", "s", "ev"], "additionalProperties": False},
                "cm":  {"type": "object", "properties": {"r": {"type": "string"}, "s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["r", "s", "ev"], "additionalProperties": False},
                "od":  {"type": "object", "properties": {"r": {"type": "string"}, "s": {"type": "integer"}, "ev": {"type": "string"}}, "required": ["r", "s", "ev"], "additionalProperties": False},
                "str": {"type": "array", "items": {"type": "string"}},
                "con": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["jk", "ps", "ec", "cm", "od", "str", "con"],
            "additionalProperties": False,
        },
    },
}
# NOTE: the JSON schema keys stay "jk"/"ps"/"ec"/"cm"/"od" (not "rf") so
# _parse_eval_compact from interview.tech.report (which maps jk->jd_knowledge)
# can be reused unmodified below via _parse_eval_compact_sales. "jk" here
# means "Role Fit" for the sales module -- see _EVAL_SYSTEM's "rf" dimension
# name in the prompt text; the wire format is kept jk for code reuse.

_SKILLS_FROM_RECORDS_SYSTEM = """You are a senior sales leader writing the skill breakdown for a hiring team after a
structured AI interview. You will receive the interview's topic records — the questions asked, the
candidate's answers, and per-turn quality scores, organized by topic.

════════════════════════════════════════════════════════════════════════════
THE ONE RULE THAT MATTERS MOST — SYNTHESIZE, DO NOT FRAGMENT
════════════════════════════════════════════════════════════════════════════
The topic records are just the running order of the interview. They are NOT your output categories.
The same underlying selling skill almost always shows up across SEVERAL topics — objection handling might
surface in a "pricing pushback" topic, a "competitor" topic, AND a "lost deal" topic. Merge all of that
into ONE "Objection Handling" evaluation, drawing evidence from every place it appeared. Never emit one
thin category per topic record, and never split one real skill across multiple categories.

Work in two passes, like an experienced sales leader reviewing their notes:
  PASS 1 — Read ALL topic records end to end. Identify the 3-5 genuine, broad SALES categories the
           interview actually gave evidence about. Good names: "Discovery & Qualification", "Objection
           Handling", "Deal Negotiation", "Outbound Prospecting", "Pipeline Management", "Closing",
           "Account Management". Ignore topic boundaries when deciding these.
  PASS 2 — For EACH category, gather every relevant moment from ANYWHERE in the interview — across all
           topics — and evaluate it holistically as one coherent picture, not question by question.

Do NOT create a category with no real interview evidence. Fewer, well-evidenced categories beat many
fragmented ones.

════════════════════════════════════════════════════════════════════════════
SCORING — 1-10, anchored to observable selling proficiency (novice → expert)
════════════════════════════════════════════════════════════════════════════
Score the candidate's DEMONSTRATED selling ability in each category, using the full range. Do NOT cluster
at 5-7. The anchors describe progression from script-following to strategic command:
  1-2  Developing: could not explain even the basics when asked; leans on scripts, no real deal behind it.
  3-4  Functional (recall only): knows the terminology but can't explain mechanics of a real deal.
  5-6  Competent: executes the standard motion and has clearly done it, but has gaps and needs probing to
       reach depth; handles routine cases but not curveballs.
  7-8  Proficient: real working command. Adapts to buyer context, gave specific deal/number details, and
       held up under follow-up probes.
  9-10 Advanced/Expert: deep, strategic mastery. Real quota/ACV numbers, complex deals, handled every
       probe including unexpected ones. Could coach other reps on this.

Ground the score in the strongest AND weakest evidence across all topics for that skill — strong on
discovery basics but falling apart on a hard objection is Competent (5-6), not Proficient.

Sanity caps (apply after choosing a band):
- Said "I don't know" or denied the whole skill area when asked → cap at 2.
- Only vague, generality-level answers with no real deal specifics even under probing → cap at 4.
- Answered confidently AND held up to at least one genuine follow-up probe → do not score below 6.

════════════════════════════════════════════════════════════════════════════
EVIDENCE — SHORT and scannable: 2 sentences per skill, no more
════════════════════════════════════════════════════════════════════════════
A recruiter scans this in seconds — do not write a paragraph. Exactly 2 sentences:
  Sentence 1: the single strongest or most representative piece of evidence for this score, pulling from
    wherever in the transcript it appeared (not necessarily the first topic it showed up in).
  Sentence 2: the one thing that capped the score — the gap, or the strongest counter-evidence.
Both sentences must be specific to THIS candidate — name the actual thing they said or did, not a topic
label. No generic praise. No sentence that could apply to any other candidate. Never credit ability that
wasn't demonstrated. Keep it tight: two sharp sentences beat a summary paragraph.

OUTPUT ONLY valid JSON matching the schema exactly. No markdown."""

_SKILLS_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "skills_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "skills": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "skill":    {"type": "string", "description": "The dynamic category name, e.g., 'Objection Handling'"},
                            "score":    {"type": "integer"},
                            "evidence": {"type": "string", "description": "Exactly 2 sharp sentences: strongest evidence, then what capped the score"},
                        },
                        "required": ["skill", "score", "evidence"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["skills"],
            "additionalProperties": False,
        },
    },
}

_SUMMARY_SYSTEM = """You are an experienced SALES HIRING MANAGER (a VP of Sales) writing the post-interview
brief your team will read first, immediately after a sales interview. Everything else in the report (the
five dimension scores + evidence, the sales-skill breakdown, the behavioral analysis, the integrity signals,
the full transcript) has been handed to you. Your job is to SYNTHESIZE all of it into one sharp brief — not
to restate scores, and not to re-analyze the transcript from scratch. Read across every section and form the
judgment an experienced sales leader forms after the interview.

Write EXACTLY 4 bullet points, each ONE crisp sentence, in this fixed order. This is the order a sales
manager scans in under a minute: strongest signal → biggest gap → overall fit → recommendation.
- Bullet 1 — STRONGEST SIGNAL: the single most convincing selling moment this candidate demonstrated, tying
  together the dimension evidence and skill breakdown. Name the exact deal/objection/topic and what they
  actually did or said.
- Bullet 2 — BIGGEST GAP OR RISK: the single most important weakness or concern, drawn from the concerns,
  the weakest dimension, and (if relevant) any real integrity flag such as a track record that didn't hold
  together. Name the specific moment it showed up. Be blunt; do not soften.
- Bullet 3 — OVERALL FIT: the honest overall read on this candidate's fit and trajectory for THIS specific
  sales motion/segment, synthesized across everything — not a behavioral/communication note (separate section).
- Bullet 4 — RECOMMENDATION: what this person looks like carrying a quota 30 days in, and the concrete
  implication for the hiring decision (the risk you take by hiring, or the gain you miss by passing).

RULES:
- Every bullet must be specific to THIS candidate and grounded in evidence a reader could verify in the
  report — no sentence that could apply to anyone else, no vague impressions ('great energy').
- No softening, no filler, no hedging. No score numbers or dimension names.
- Start each bullet with a dash (-).
OUTPUT ONLY the 4 dashes. No markdown, no headers, no extra text."""

_VERDICT_SYSTEM = """You are an experienced SALES HIRING MANAGER (a VP of Sales) making the FINAL hiring call
after a sales interview. You have the full picture: the five dimension scores + evidence, the sales-skill
breakdown, strengths, concerns, behavioral analysis, integrity signals, and the full transcript. Recruiters
rely on this to make or kill an offer, so be precise, accountable, and grounded in the actual evidence.

════════════════════════════════════════════════════════════════════════════
HOW TO SCORE — HOLISTIC JUDGMENT, NOT A FORMULA
════════════════════════════════════════════════════════════════════════════
YOU determine the final 0-100 score through holistic reasoning across ALL the signals — the way an
experienced sales leader weighs strong and weak evidence rather than averaging a spreadsheet. Real hiring
judgment combines the structured evidence with reasoning; it is not a fixed weighted sum.

A computed weighted score MAY be provided as ONE reference data point. Treat it as a sanity check, NOT as an
anchor you must stay within — score above or below it when the evidence justifies it (e.g. a fabricated or
unverifiable track record should pull the score down hard even if other areas look fine; genuinely strong,
verifiable deal command can pull it up). Explain any large divergence in your reasoning.

Weigh the evidence with judgment:
- What matters MOST for THIS sales motion/segment weighs more — a critical gap (e.g. can't run discovery for
  a complex-sale role) outweighs strength in a peripheral area.
- A real integrity flag (a track record that didn't hold together, contradictory quota/deal numbers) or a
  communication breakdown is a serious drag on the score, not a minor deduction — in sales, communication
  and credibility ARE much of the job.
- Consistency across dimensions and skills raises confidence; a spiky, contradictory profile lowers it.

Score ONLY on the actual evidence. Do not default to a safe middling number, and do not push to extremes to
differentiate. A genuinely average rep belongs in the middle; reserve high scores for genuinely strong,
well-rounded evidence and low scores for genuinely weak or evasive performance. Use the FULL range. The goal
is an accurate score for THIS candidate.

SCORE CALIBRATION (bands, for reference — your reasoning sets the exact number):
  0-30:   Major gaps in basics. Cannot carry the role.
  31-50:  Surface-level only. High ramp-up cost. Significant risk.
  51-65:  Some competence but key gaps. Junior/SDR-style only, with mentorship.
  66-79:  Solid. Some depth missing but capable.
  80-89:  Strong performer. Can carry a quota immediately. Minor gaps acceptable.
  90-100: Exceptional. Clearly exceeds the bar.

DECISION — choose one, consistent with your score and the evidence:
- "Hire":  strong, well-rounded evidence and no critical gap in a role-required selling skill. (For a
  genuinely standout rep, say so explicitly in the justification — e.g. "a strong hire" — but still output "Hire".)
- "Hold":  real competence but a key requirement is unproven or a material concern (e.g. an unverifiable
  number) needs a second look.
- "Reject": a disqualifying gap or demonstrated inability in core role requirements.

JUSTIFICATION — write a SHARP 2-LINE NOTE (exactly two sentences, no bullets, no dashes):
- Line 1 — WHY THIS SCORE: the decisive evidence that set the number — the one or two things that most moved
  it up or down. This line alone must make the score self-explanatory without reading the rest of the report.
- Line 2 — WHY THIS DECISION: why this candidate is a strong hire / hire / hold / reject specifically — the
  single reason that lands the decision tier, blunt and concrete.
Both lines specific to THIS candidate's actual performance. No hedging, no generic language, no bullet
characters, no score numbers in the text. Two sentences, nothing more.

OUTPUT ONLY valid JSON matching the provided schema EXACTLY. No markdown fences."""

_VERDICT_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "verdict_response",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "decision":      {"type": "string", "enum": ["Hire", "Hold", "Reject"]},
                "score":         {"type": "integer", "description": "Holistic 0-100 score based on the entire interview."},
                "justification": {"type": "string", "description": "Sharp 2-sentence note: line 1 why this score, line 2 why this decision tier."}
            },
            "required": ["decision", "score", "justification"],
            "additionalProperties": False,
        },
    },
}


def _parse_eval_compact(raw: str) -> LLMEvalResponse:
    """Map compact field names (jk/ps/ec/cm/od) back to full LLMEvalResponse model.
    "jk" carries the Role Fit dimension for the sales module -- see the wire-format
    note above _SKILLS_FROM_RECORDS_SYSTEM."""
    data = json.loads(raw)

    def _dim(key: str) -> LLMEvalDimension:
        d = data.get(key, {})
        return LLMEvalDimension(score=d.get("s", 0), evidence=d.get("ev", ""))

    return LLMEvalResponse(
        jd_knowledge=_dim("jk"),
        problem_solving=_dim("ps"),
        experience_credibility=_dim("ec"),
        communication=_dim("cm"),
        ownership=_dim("od"),
        strengths=list(data.get("str", [])),
        concerns=list(data.get("con", [])),
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LangGraph nodes -- signals + assemble reused verbatim from interview.tech.report
# (imported above). Only llm_calls is redefined here to swap in the sales prompts.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def _node_llm_calls(state: ReportState) -> dict:
    """Node 2: eval + skills + behavioral analysis — all three in parallel.
    Sales-module mirror of interview.tech.report._node_llm_calls: identical
    orchestration, sales-specific prompts."""
    llm_default        = state["llm_model"]
    job_title        = state.get("job_title", "")
    org_id           = state.get("org_id") or ""
    app_id           = state.get("app_id", "")
    topic_records    = state.get("topic_records") or []
    behavioral_signals = state.get("behavioral_signals", [])
    transcript_lines = state.get("transcript_lines", [])
    interview_scores = state.get("interview_scores", [])
    is_test          = state.get("is_test", False)

    lines_to_use  = transcript_lines[4:] if len(transcript_lines) > 4 else transcript_lines
    transcript_text = truncate_to_tokens("\n".join(lines_to_use), 5000)
    resume_context = _build_resume_claims_block(state.get("resume_json") or {})
    # Inputs labeled by which dimension they are authoritative for, matching the
    # per-dimension input scoping in _EVAL_SYSTEM (ps/cm/od = transcript only; jk
    # adds the JD; ec adds the resume). Integrity/behavioral flags are deliberately
    # NOT fed here — they are their own report sections, not competency-score inputs.
    eval_user = (
        f"ROLE TITLE: {job_title}\n\n"
        f"[USE FOR jk — Role Fit ONLY]\n{state['jd_context']}\n\n"
        f"[USE FOR ec — Track Record Credibility ONLY] CANDIDATE RESUME CLAIMS:\n{resume_context}\n\n"
        f"[USE FOR ALL DIMENSIONS] FULL INTERVIEW TRANSCRIPT:\n{transcript_text}"
    )

    records_lines: list[str] = []
    for i, rec in enumerate(topic_records, 1):
        topic_turns = [s for s in interview_scores if s.get("topic") == rec.get("topic")]
        turns_block = (
            "\n".join(
                f"  Q: {str(t.get('question', '')).strip()[:200]}\n"
                f"  A: {str(t.get('answer', '')).strip()[:300]}\n"
                f"  [clarity={t.get('clarity', 0)} depth={t.get('depth', 0)} "
                f"specificity={t.get('specificity', 0)} grounding={t.get('grounding', 0)} "
                f"overall={t.get('overall', 0)}]"
                for t in topic_turns
            )
            if topic_turns else "  No per-turn scores available."
        )
        records_lines.append(
            f"[TOPIC {i}] {rec.get('topic', '')}\n{turns_block}\n"
        )
    # The [TOPIC N] blocks below are the interview's RUNNING ORDER, not output categories —
    # the prompt requires merging evidence for the same selling skill across topics.
    _skills_header = (
        f"Role: {job_title}\n\n"
        "The interview turns below are grouped by TOPIC in the order they were asked. Topics are NOT your "
        "skill categories — identify the real selling skills first, then pull evidence for each from "
        "wherever it appears across these topics.\n\n"
    )
    skills_user = (
        _skills_header + "\n".join(records_lines)
        if records_lines else f"Role: {job_title}\n\nNo interview topics found."
    )
    logger.info("[REPORT:sales] Skills: topic_records path (%d topics)", len(topic_records))

    _total_turns   = len(interview_scores)
    session_duration = int(
        (state.get("proctoring_data") or {}).get("session_duration")
        or _total_turns * 90
    )

    answer_integrity_enabled = state.get("answer_integrity_enabled", False)
    _answer_integrity_task = (
        _sales_answer_integrity_analyzer.analyze(
            transcript_lines=transcript_lines,
            _LLM_DEFAULT=llm_default,
            org_id=org_id,
            app_id=app_id,
        )
        if answer_integrity_enabled
        else _answer_integrity_noop()
    )

    (
        (eval_raw, eval_usage),
        (skills_raw, skills_usage),
        (behavioral_result, beh_usages),
        (answer_integrity_result, answer_integrity_usages),
    ) = (
        await asyncio.gather(
            _llm.call(LLMCallSpec(
                system=_EVAL_SYSTEM,
                user=eval_user,
                # Higher budget: each of the 5 dimensions now emits reasoning ("r")
                # before its score, plus evidence and strengths/weaknesses.
                max_tokens=2200,
                timeout=75.0,
                response_format=_EVAL_JSON_SCHEMA,
                call_type="report_eval_sales",
                org_id=org_id,
                app_id=app_id,
                _LLM_DEFAULT=llm_default,
            )),
            _llm.call(LLMCallSpec(
                system=_SKILLS_FROM_RECORDS_SYSTEM,
                user=skills_user,
                # Evidence is now capped at 2 sentences per skill (was 4-6), so 900
                # comfortably covers 5 categories with headroom vs the 700 that
                # truncated mid-JSON when evidence was longer.
                max_tokens=900,
                timeout=55.0,
                response_format=_SKILLS_JSON_SCHEMA,
                call_type="report_skills_sales",
                org_id=org_id,
                app_id=app_id,
                _LLM_DEFAULT=llm_default,
            )),
            _sales_behavioral_analyzer.analyze(
                transcript_lines=transcript_lines,
                answer_scores=interview_scores,
                duration_sec=session_duration,
                behavioral_signals=behavioral_signals,
                _LLM_DEFAULT=llm_default,
                org_id=org_id,
                app_id=app_id,
            ),
            _answer_integrity_task,
        )
    )

    _all_integrity_events = list((state.get("proctoring_data") or {}).get("events", []))
    answer_integrity_flagged = (
        answer_integrity_enabled
        and answer_integrity_result["score"] >= _ANSWER_INTEGRITY_FLAG_THRESHOLD
    )
    if answer_integrity_flagged:
        _all_integrity_events.append(_build_answer_integrity_event(answer_integrity_result))

    integrity_narratives, integrity_narrative_usages = await _integrity_narrator.analyze(
        _all_integrity_events,
        _LLM_DEFAULT=llm_default,
        org_id=org_id,
        app_id=app_id,
    )

    _report_ctx = {
        "applicationId": app_id,
        "candidateName": state.get("candidate_name", ""),
        "jobTitle": job_title,
        "eventId": f"interview:{app_id}:report",
        "isTest": is_test,
    }
    def _bill(usage: dict) -> Any:
        usage = {**usage, "context": _report_ctx}
        return _persist_billing(org_id, "interviewReport", usage)
    if org_id:
        billing_tasks = [
            _bill(_llm.usage_dict(eval_usage, llm_default)),
            _bill(_llm.usage_dict(skills_usage, llm_default)),
            *[_bill(bu) for bu in beh_usages],
            *[_bill(au) for au in answer_integrity_usages],
            *[_bill(nu) for nu in integrity_narrative_usages],
        ]
        try:
            await asyncio.gather(*billing_tasks)
        except Exception as _bill_err:
            logger.error("[BILLING] interviewReport (sales) billing failed (non-fatal): %s", _bill_err)

    try:
        eval_result = _parse_eval_compact(eval_raw)
    except Exception as e:
        logger.warning("[REPORT:sales] eval parse failed: %s | raw=%s", e, eval_raw[:200])
        eval_result = LLMEvalResponse()

    try:
        skills_result = LLMSkillsResponse.model_validate(json.loads(skills_raw))
    except Exception as e:
        logger.warning("[REPORT:sales] skills parse failed: %s | raw=%s", e, skills_raw[:200])
        skills_result = LLMSkillsResponse()

    logger.info(
        "[REPORT:sales] LLM done: app=%s rf=%d ps=%d ec=%d cm=%d od=%d skills=%d behavioral=%d",
        app_id,
        eval_result.jd_knowledge.score, eval_result.problem_solving.score,
        eval_result.experience_credibility.score, eval_result.communication.score,
        eval_result.ownership.score, len(skills_result.skills),
        len(behavioral_result.get("topics", [])),
    )
    return {
        "eval_result":        eval_result,
        "skills_result":      skills_result,
        "behavioral_analysis": behavioral_result,
        "answer_integrity_result": answer_integrity_result,
        "integrity_narratives": integrity_narratives,
    }


async def _node_assemble(state: ReportState) -> dict:
    """Node 3: assemble final scorecard blob and write to DB. Sales-module
    mirror of interview.tech.report._node_assemble — identical formula and DB
    write, "JD Knowledge" relabeled "Role Fit" in the persisted dimension name."""
    app_id           = state["app_id"]
    org_id           = state.get("org_id")
    proctoring_data  = state.get("proctoring_data") or {}
    eval_result      = state["eval_result"]
    skills_result    = state.get("skills_result") or LLMSkillsResponse()
    integrity_result = state["integrity_result"]
    behavioral_analysis = state.get("behavioral_analysis") or {"topics": [], "points": []}
    behavioral_signals  = state.get("behavioral_signals", [])
    answer_integrity_result = state.get("answer_integrity_result") or AnswerIntegrityAnalyzer._empty_result()
    integrity_signals_analysis = state.get("integrity_narratives") or {}

    answer_integrity_enabled = state.get("answer_integrity_enabled", False)
    answer_integrity_flagged = answer_integrity_enabled and answer_integrity_result["score"] >= _ANSWER_INTEGRITY_FLAG_THRESHOLD
    if answer_integrity_flagged:
        answer_integrity_event = _build_answer_integrity_event(answer_integrity_result)
        proctoring_data = {
            **proctoring_data,
            "events": [*proctoring_data.get("events", []), answer_integrity_event],
        }
        integrity_result = IntegrityEngine.score(proctoring_data["events"])
        if app_id and DATABASE_URL:
            try:
                from interview.agent_persistence import DatabasePool
                pool = await DatabasePool.get()
                async with pool.acquire() as conn:
                    row = await conn.fetchrow(
                        'SELECT "proctoringEvents" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
                        app_id,
                    )
                    existing: list = []
                    if row and row["proctoringEvents"]:
                        raw = row["proctoringEvents"]
                        existing = raw if isinstance(raw, list) else (
                            json.loads(raw) if isinstance(raw, str) else []
                        )
                    await conn.execute(
                        """UPDATE "Interview" SET "proctoringEvents" = $1, "interviewUpdatedAt" = NOW()
                           WHERE "applicationId" = $2""",
                        json.dumps(existing + [answer_integrity_event]),
                        app_id,
                    )
            except Exception as e:
                logger.error("[ANSWER_INTEGRITY] Failed to persist answer_integrity event for %s: %s", app_id, e)

    rf  = eval_result.jd_knowledge.score
    ps  = eval_result.problem_solving.score
    ec  = eval_result.experience_credibility.score
    cm  = eval_result.communication.score
    od  = eval_result.ownership.score

    overall_score = max(0, min(100, round(
        rf * 0.30 + ps * 0.25 + ec * 0.20 + cm * 0.15 + od * 0.10
    )))

    skill_ratings_list = [
        {"skill": r.skill, "score": r.score, "evidence": r.evidence}
        for r in skills_result.skills
        if r.skill
    ]
    skills_evaluated = [r["skill"] for r in skill_ratings_list]

    signal_analysis = {
        "behavioral_signals": behavioral_signals,
        # {topic, bullets}[] -- matches SignalAnalysisPanelCompact's expected shape
        # in interview-report-sreevaai.tsx (topic label -> short collapsible bullets).
        "behavioral_signals_analysis": behavioral_analysis.get("topics", []),
        "integrity_analysis": {
            "narratives": integrity_signals_analysis,
            "answer_integrity": {
                "enabled":             answer_integrity_enabled,
                "score":               answer_integrity_result["score"],
                "flagged":             answer_integrity_flagged,
                "reason":              answer_integrity_result["reason"],
                "phrasing_score":      answer_integrity_result["phrasing_score"],
                "phrasing_reason":     answer_integrity_result["phrasing_reason"],
                "consistency_score":   answer_integrity_result["consistency_score"],
                "consistency_reason":  answer_integrity_result["consistency_reason"],
                "quotes":              answer_integrity_result["quotes"],
            },
        },
    }

    score_breakdown_report = {
        "dimensions": [
            {"name": "Role Fit",                 "score": rf, "evidence": eval_result.jd_knowledge.evidence},
            {"name": "Deal Reasoning",            "score": ps, "evidence": eval_result.problem_solving.evidence},
            {"name": "Track Record Credibility",  "score": ec, "evidence": eval_result.experience_credibility.evidence},
            {"name": "Communication",             "score": cm, "evidence": eval_result.communication.evidence},
            {"name": "Ownership",                "score": od, "evidence": eval_result.ownership.evidence},
        ],
        "overall":   overall_score,
        "integrity": {
            "score":        integrity_result["score"],
            "band":         integrity_result["band"],
            "signals_used": integrity_result.get("signals_used", []),
            "methodology":  "signal_weighted_deterministic",
        },
        "skills_evaluated": skills_evaluated,
    }

    interview_summary_report = {
        "strengths": eval_result.strengths,
        "concerns":  eval_result.concerns,
    }

    try:
        from interview.agent_persistence import DatabasePool
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "aiScoreBreakdown"  = $1,
                       "aiSkillRatings"    = $2,
                       "proctoringAnalysis" = $3,
                       "aiInterviewSummary" = $4,
                       "interviewUpdatedAt" = NOW()
                   WHERE "applicationId"  = $5""",
                json.dumps(score_breakdown_report),
                json.dumps(skill_ratings_list),
                json.dumps(signal_analysis),
                json.dumps(interview_summary_report),
                app_id,
            )

        logger.info(
            "[REPORT:sales] Written: app=%s overall=%d rf=%d ps=%d ec=%d cm=%d od=%d "
            "integrity=%d skills=%d behavioral_points=%d",
            app_id, overall_score, rf, ps, ec, cm, od,
            integrity_result["score"], len(skills_evaluated),
            len(behavioral_analysis.get("points", [])),
        )
    except Exception as e:
        logger.error("[REPORT:sales] DB write failed for %s: %s", app_id, e, exc_info=True)

    scores_context = {
        "overall":                overall_score,
        "jd_knowledge":           rf,
        "problem_solving":        ps,
        "experience_credibility": ec,
        "communication":          cm,
        "ownership":              od,
        "integrity_score":        integrity_result["score"],
        "integrity_band":         integrity_result["band"],
        "skills_evaluated":       skills_evaluated,
        "signal_summary":         state.get("signal_context", "none"),
        "dimensions":             score_breakdown_report["dimensions"],
        "skill_ratings":          skill_ratings_list,
        "strengths":              eval_result.strengths,
        "concerns":               eval_result.concerns,
        "behavioral_points":      behavioral_analysis.get("points", []),
        "integrity_signals_analysis": integrity_signals_analysis,
        "answer_integrity":       signal_analysis["integrity_analysis"]["answer_integrity"],
    }
    return {"scores_context": scores_context}


def _build_report_graph() -> Any:
    builder = StateGraph(ReportState)  # type: ignore
    builder.add_node("signals",   _node_signals)
    builder.add_node("llm_calls", _node_llm_calls)
    builder.add_node("assemble",  _node_assemble)
    builder.set_entry_point("signals")
    builder.add_edge("signals",   "llm_calls")
    builder.add_edge("llm_calls", "assemble")
    builder.add_edge("assemble",  END)
    return builder.compile()


_REPORT_GRAPH = _build_report_graph()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Public API -- same signatures as interview.tech.report so agent_persistence.py
# can call either module interchangeably based on interview_type.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def generate_interview_report(
    app_id:                str,
    transcript_lines:      list,
    answer_scores:         list,
    job_title:             str,
    llmInterviewReport:    str,
    proctoring_data:       Optional[dict] = None,
    org_id:                Optional[str]  = None,
    jd_json:               Optional[dict] = None,
    resume_json:           Optional[dict] = None,
    topic_records:         Optional[list] = None,
    candidate_name:        str = "",
    answer_integrity_enabled: bool = False,
    is_test:               bool = False,
) -> Optional[dict]:
    """Run the full sales report pipeline. Same contract as
    interview.tech.report.generate_interview_report."""
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[REPORT:sales] Skipping: missing transcript or DATABASE_URL")
        return None
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[REPORT:sales] Skipping: missing OPENAI_API_KEY")
        return None
    if not llmInterviewReport:
        logger.error("[REPORT:sales] Missing org.llmInterviewReport from DB for app=%s", app_id)
        return None

    interview_scores = [s for s in answer_scores if not s.get("is_warmup", False)]
    initial_state: ReportState = {
        "app_id":           app_id,
        "transcript_lines": transcript_lines,
        "interview_scores": interview_scores,
        "all_scores":       answer_scores,
        "job_title":        job_title,
        "proctoring_data":  proctoring_data or {},
        "org_id":           org_id,
        "llm_model":        llmInterviewReport,
        "jd_json":          jd_json,
        "resume_json":      resume_json,
        "topic_records":    topic_records or [],
        "answer_integrity_enabled": answer_integrity_enabled,
        "is_test":          is_test,
    }
    _pipeline_start = time.monotonic()
    logger.info("[REPORT:sales] Pipeline started for app=%s", app_id)
    try:
        final_state = await _REPORT_GRAPH.ainvoke(initial_state)
        _pipeline_elapsed = time.monotonic() - _pipeline_start
        logger.info("[REPORT:sales] Pipeline finished for app=%s (%.1fs)", app_id, _pipeline_elapsed)
        return final_state.get("scores_context")
    except asyncio.TimeoutError as e:
        logger.error("[REPORT:sales] Timed out for %s: %s", app_id, e)
        return None
    except Exception as e:
        logger.error("[REPORT:sales] Pipeline failed for %s: %s", app_id, e, exc_info=True)
        try:
            await log_llm_error(
                app_id=app_id,
                org_name=org_id,
                candidate_name=candidate_name,
                provider="openai",
                error=str(e),
                reason="Report/summary generation failed",
            )
        except Exception:
            pass
        return None


async def generate_interview_summary(
    app_id:              str,
    transcript_lines:    list,
    job_title:           str,
    llmInterviewReport:  str,
    org_id:              Optional[str]  = None,
    scores_context:      Optional[dict] = None,
    candidate_name:      str = "",
    is_test:             bool = False,
) -> None:
    """Generate summary bullets + verdict and write to Interview.interviewSummary.
    Same contract as interview.tech.report.generate_interview_summary."""
    if not transcript_lines or not DATABASE_URL:
        logger.warning("[SUMMARY:sales] Skipping: missing transcript or DATABASE_URL")
        return
    if not os.environ.get("OPENAI_API_KEY"):
        logger.warning("[SUMMARY:sales] Skipping: missing OPENAI_API_KEY")
        return

    ctx             = scores_context or {}
    integrity_band  = ctx.get("integrity_band", "HIGH")
    integrity_score = ctx.get("integrity_score", 100)
    signal_summary  = ctx.get("signal_summary", "No signals flagged")
    computed_overall = ctx.get("overall", None)

    dimensions = ctx.get("dimensions", [])

    dimension_block = (
        "\n".join(
            f"  {d['name']}: {d['score']}/100 — {d.get('evidence', '').strip()}"
            for d in dimensions
        )
        if dimensions else "  Not available"
    )

    skills = ctx.get("skill_ratings", [])
    skill_block = (
        "\n".join(
            f"  {s['skill']} ({s['score']}/10): {s.get('evidence', '').strip()}"
            for s in skills[:12]
        )
        if skills else "  Not available"
    )

    strengths = ctx.get("strengths", [])
    concerns  = ctx.get("concerns", [])
    strengths_block = "\n".join(f"  - {s}" for s in strengths) if strengths else "  None identified"
    concerns_block  = "\n".join(f"  - {c}" for c in concerns)  if concerns  else "  None flagged"

    behavioral_points = ctx.get("behavioral_points", [])
    behavioral_block = (
        "\n\n".join(f"  - {p}" for p in behavioral_points) if behavioral_points else "  Not available"
    )

    integrity_signals_analysis = ctx.get("integrity_signals_analysis", {})
    integrity_signals_block = (
        "\n".join(
            f"  {name}:\n" + "\n".join(f"    - {p}" for p in points)
            for name, points in integrity_signals_analysis.items()
        )
        if integrity_signals_analysis else "  No proctoring signals fired."
    )

    answer_integrity = ctx.get("answer_integrity", {})
    answer_integrity_block = (
        f"  Flagged: {answer_integrity.get('flagged', False)} | Score: {answer_integrity.get('score', 0)}/100\n"
        f"  Reason: {answer_integrity.get('reason', 'Not available')}"
        if answer_integrity.get("enabled") else "  Not enabled for this org."
    )

    transcript_text = truncate_to_tokens("\n".join(transcript_lines), 5000)

    shared_user = (
        f"Role: {job_title}\n"
        f"Integrity: {integrity_band} ({integrity_score}/100)\n"
        f"Behavioral signals: {signal_summary}\n"
        f"REFERENCE WEIGHTED SCORE: {computed_overall if computed_overall is not None else 'Not available'}/100 "
        f"(a deterministic weighted average of the dimension scores, provided as ONE reference data point "
        f"only — NOT an anchor. The verdict determines the final score through holistic judgment and may "
        f"diverge from this when the evidence justifies it.)\n\n"
        f"DIMENSION SCORES + EVIDENCE:\n{dimension_block}\n\n"
        f"SKILL BREAKDOWN:\n{skill_block}\n\n"
        f"STRENGTHS OBSERVED:\n{strengths_block}\n\n"
        f"CONCERNS FLAGGED:\n{concerns_block}\n\n"
        f"BEHAVIORAL ANALYSIS:\n{behavioral_block}\n\n"
        f"INTEGRITY SIGNALS ANALYSIS:\n{integrity_signals_block}\n\n"
        f"ANSWER INTEGRITY:\n{answer_integrity_block}\n\n"
        f"FULL INTERVIEW TRANSCRIPT:\n{transcript_text}"
    )

    _summary_start = time.monotonic()
    logger.info("[SUMMARY:sales] report_summary + report_verdict started (app=%s)", app_id)
    try:
        (summary_text, summary_usage), (verdict_text, verdict_usage) = await asyncio.gather(
            _llm.call(LLMCallSpec(
                system=_SUMMARY_SYSTEM,
                user=shared_user,
                max_tokens=500,
                timeout=60.0,
                response_format={"type": "text"},
                temperature=0.1,
                call_type="report_summary_sales",
                org_id=org_id or "",
                app_id=app_id,
                _LLM_DEFAULT=llmInterviewReport,
            )),
            _llm.call(LLMCallSpec(
                system=_VERDICT_SYSTEM,
                user=shared_user,
                max_tokens=250,
                timeout=60.0,
                response_format=_VERDICT_JSON_SCHEMA,
                temperature=0.1,
                call_type="report_verdict_sales",
                org_id=org_id or "",
                app_id=app_id,
                _LLM_DEFAULT=llmInterviewReport,
            )),
        )

        if org_id:
            _summary_ctx = {
                "applicationId": app_id,
                "candidateName": candidate_name,
                "jobTitle": job_title,
                "eventId": f"interview:{app_id}:summary",
                "isTest": is_test,
            }
            def _bill(usage: dict) -> Any:
                usage = {**usage, "context": _summary_ctx}
                return _persist_billing(org_id, "interviewReport", usage)
            try:
                await asyncio.gather(
                    _bill(_llm.usage_dict(summary_usage, llmInterviewReport)),
                    _bill(_llm.usage_dict(verdict_usage, llmInterviewReport)),
                )
            except Exception as _bill_err:
                logger.error("[BILLING] interviewReport summary (sales) billing failed (non-fatal): %s", _bill_err)

        _summary_elapsed = time.monotonic() - _summary_start
        logger.info(
            "[SUMMARY:sales] report_summary + report_verdict ended (%.1fs, app=%s)",
            _summary_elapsed, app_id,
        )
        if not summary_text and not verdict_text:
            logger.warning("[SUMMARY:sales] Both outputs empty for %s — skipping save", app_id)
            return

        try:
            verdict_parsed = json.loads(verdict_text)
        except Exception:
            verdict_parsed = {"decision": "Hold", "score": 50, "justification": verdict_text.strip()}

        # The verdict LLM's score is now AUTHORITATIVE for the displayed overall fit.
        # generate_interview_report wrote aiScoreBreakdown.overall from the deterministic
        # weighted formula earlier; here we overwrite it with the verdict's holistic score
        # so the number recruiters see is the hiring-manager judgment, not the formula.
        _raw_verdict_score = verdict_parsed.get("score")
        _verdict_overall: int | None = None
        if _raw_verdict_score is not None:
            try:
                _verdict_overall = max(0, min(100, round(float(_raw_verdict_score))))
            except (TypeError, ValueError):
                _verdict_overall = None

        from interview.agent_persistence import DatabasePool
        pool = await DatabasePool.get()
        async with pool.acquire() as conn:
            await conn.execute(
                """UPDATE "Interview"
                   SET "aiInterviewSummary" = COALESCE("aiInterviewSummary", '{}') || $1::jsonb,
                       "interviewUpdatedAt" = NOW()
                   WHERE "applicationId"  = $2""",
                json.dumps({"summary": summary_text, "decision_note": verdict_parsed}),
                app_id,
            )
            # Overwrite the stored overall with the authoritative verdict score (jsonb_set
            # touches only the "overall" key; dimensions/integrity/skills stay intact).
            if _verdict_overall is not None:
                await conn.execute(
                    """UPDATE "Interview"
                       SET "aiScoreBreakdown" = jsonb_set(
                             COALESCE("aiScoreBreakdown", '{}')::jsonb,
                             '{overall}', $1::jsonb, true),
                           "interviewUpdatedAt" = NOW()
                       WHERE "applicationId" = $2""",
                    json.dumps(_verdict_overall),
                    app_id,
                )
        logger.info(
            "[SUMMARY:sales] Written summary + verdict for %s (authoritative overall=%s)",
            app_id, _verdict_overall,
        )

    except asyncio.TimeoutError:
        logger.warning("[SUMMARY:sales] Timed out for %s", app_id)
    except Exception as e:
        logger.error("[SUMMARY:sales] Failed for %s: %s", app_id, e, exc_info=True)
        try:
            await log_llm_error(
                app_id=app_id,
                org_name=org_id,
                candidate_name=candidate_name,
                provider="openai",
                error=str(e),
                reason="Report/summary generation failed",
            )
        except Exception:
            pass
