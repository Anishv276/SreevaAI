"""
signal_precheck.py
Deterministic, code-computed hints for the signals that misfired most in the
transcript audit: clarification_request, pure_denial, off_topic, ownership_diffuse.

WHY THIS EXISTS
----------------
The current single LLM call holds 2 response-shape gates + 10 content dimensions +
self-correction + multi-signal ranking in its head at once. The audit showed it
correctly WRITES the right rule in the prompt (e.g. the pure_denial "not_this"
block literally describes "Okay. Yeah." as a non-denial) and then VIOLATES that
same rule under load. Research on LLM-as-judge reliability is consistent that the
fix for this is decomposition + explicit evidence grounding, not longer prompts:
give the model a narrow, already-computed signal and ask it to confirm/override,
rather than asking it to derive the rule from scratch every turn.

These functions never fire a signal by themselves. They produce a PRECHECK hint
string that gets injected into the classification prompt. The LLM must reconcile
the hint with the actual answer — it can override, but has to explain why. This
turns "trust the model to remember the rule" into "trust the model to explain a
disagreement with a computed fact," which is a much easier and more reliable job.
"""
from __future__ import annotations
import re


# ---------------------------------------------------------------------------
# 1. CLARIFICATION / META-QUESTION PRECHECK
#    Root cause fixed: RS-a only matched a closed list of exemplar phrases, so
#    "Okay so what exactly do you need?" fell through to shallow_label.
#    Fix: match the FUNCTION (talking to the interviewer about the question,
#    not attempting to answer it) via a broader pattern + a structural signal
#    (short utterance, contains a question mark, contains zero domain-shaped
#    tokens like nouns/verbs describing a mechanism).
# ---------------------------------------------------------------------------
_CLARIFICATION_PATTERNS = [
    r"\bwhat do you mean\b", r"\bcan you (please )?(re)?phrase\b",
    r"\bcan you repeat\b", r"\bsay that again\b", r"\bdidn'?t (get|catch|hear) (you|that)\b",
    r"\bi don'?t (get|understand) (it|the question|you)\b",
    r"\bcan you hear me\b", r"\bare you there\b", r"\bcan you clarify\b",
    r"\bwhat exactly (do|are) you\b", r"\bwhat.{0,15}do you need\b",
    r"\bsorry,? (what|come again)\b", r"\bcould you explain the question\b",
    r"\brefresh (it|that|the question)\b", r"\bone more time\b",
]
_CLARIFICATION_RE = re.compile("|".join(_CLARIFICATION_PATTERNS), re.IGNORECASE)


def clarification_precheck(answer: str) -> str | None:
    """Returns a hint string if the answer LOOKS like it's talking to the
    interviewer rather than attempting the question, else None.
    Deliberately broad (function-based, not phrase-list-based) — false
    positives are cheap here because the LLM still confirms against content.
    """
    text = (answer or "").strip()
    if not text:
        return None
    if _CLARIFICATION_RE.search(text):
        return (
            f"PRECHECK (clarification/meta): the phrase pattern-matches a request "
            f"directed AT the interviewer about the question itself, not an attempt "
            f"to answer it. Default to clarification_request unless the remainder of "
            f"the utterance also contains a real technical attempt."
        )
    return None


# ---------------------------------------------------------------------------
# 2. PURE_DENIAL MECHANICAL TEST
#    Root cause fixed: "Okay. Yeah. This is so different, but still I can
#    answer." fired pure_denial despite the prompt's own worked example
#    describing this exact shape as NOT a denial.
#    Fix: run the strip-and-check test in CODE, not prose, so it can't be
#    skipped under cognitive load. Strip denial/filler phrases, then check
#    whether ANY content-bearing token survives.
# ---------------------------------------------------------------------------
_DENIAL_PHRASES = [
    "i don't know", "i dont know", "not sure", "no idea", "i haven't", "i havent",
    "i forgot", "i'm not sure", "im not sure", "i can't recall", "i cant recall",
    "no clue", "i have no idea",
]
_ACK_FILLER = [
    "okay", "ok", "yeah", "yes", "sure", "right", "hmm", "uh", "um", "so",
    "well", "like", "actually", "basically",
]
_STOPWORDS = {
    "the", "a", "an", "is", "it", "this", "that", "and", "but", "still",
    "can", "i", "to", "of", "in", "on", "for", "so", "very", "just",
}


def pure_denial_mechanical_test(answer: str) -> str:
    """Implements the mechanical test the prompt already specifies in prose:
    strip denial phrases and conversational filler, then check whether any
    content-bearing (non-stopword, non-filler) token remains.
    Returns a PRECHECK hint string — never a final verdict.
    """
    text = (answer or "").lower().strip()
    if not text:
        return "PRECHECK (denial): empty answer — pure_denial is correct."

    stripped = text
    for phrase in _DENIAL_PHRASES:
        stripped = stripped.replace(phrase, " ")
    tokens = re.findall(r"[a-z']+", stripped)
    remaining = [
        t for t in tokens
        if t not in _STOPWORDS and t not in _ACK_FILLER and len(t) > 2
    ]

    if not remaining:
        return (
            "PRECHECK (denial): after stripping denial phrases and filler, NO "
            "content-bearing words remain. This supports pure_denial."
        )
    return (
        f"PRECHECK (denial): after stripping denial phrases and filler, these "
        f"words remain: {remaining[:8]}. Per the mechanical test, this is NOT "
        f"pure_denial — classify on the remaining content instead (if the "
        f"remainder is just acknowledgement with no technical attempt at all, "
        f"e.g. 'this is so different but still I can answer', treat it as a "
        f"non-answer to be RE-PROMPTED via clarification_request, not scored "
        f"as a denial)."
    )


# ---------------------------------------------------------------------------
# 3. OWNERSHIP POLARITY HINT
#    Root cause fixed: "I would check... I would start... I also commonly
#    use..." fired ownership_diffuse, the exact opposite of its definition.
#    Fix: compute first-person vs. collective/passive pronoun density in code
#    and hand it to the model as a fact to reconcile, instead of trusting a
#    single pass to hold the polarity correctly under load.
# ---------------------------------------------------------------------------
_FIRST_PERSON = re.compile(r"\b(i|i'd|i'll|i've|i'm|my|me)\b", re.IGNORECASE)
_COLLECTIVE_PASSIVE = re.compile(
    r"\b(we|our|the team|it was|was decided|was built|was migrated|they decided)\b",
    re.IGNORECASE,
)


def ownership_polarity_hint(answer: str) -> str | None:
    text = answer or ""
    first_person = len(_FIRST_PERSON.findall(text))
    collective = len(_COLLECTIVE_PASSIVE.findall(text))
    if first_person == 0 and collective == 0:
        return None
    if first_person > collective:
        return (
            f"PRECHECK (ownership): first-person markers ({first_person}) outnumber "
            f"collective/passive markers ({collective}). ownership_diffuse requires "
            f"collective/passive language to DOMINATE with personal contribution "
            f"invisible — this count pattern argues AGAINST firing it here. Only "
            f"override if the first-person language is generic ('I think', 'I "
            f"guess') rather than describing a specific personal action or decision."
        )
    if collective > first_person:
        return (
            f"PRECHECK (ownership): collective/passive markers ({collective}) "
            f"outnumber first-person markers ({first_person}). This is consistent "
            f"with ownership_diffuse IF the described work is a specific real "
            f"instance (not a hypothetical or generic checklist)."
        )
    return None


# ---------------------------------------------------------------------------
# 4. OFF_TOPIC vs. CONFUSED-ON-TOPIC PRECHECK
#    Root cause fixed: an incoherent but subject-matter-relevant ramble
#    ("middleware... front end and back end... reject that") fired off_topic,
#    which is reserved for a DIFFERENT SUBJECT entirely.
#    Fix: cheap lexical overlap check between the answer and the topic's own
#    key terms (already known to the caller — active_topic / probe_focus).
#    This can't decide off_topic on its own (needs semantics) but can rule it
#    OUT with reasonable confidence when there's real term overlap.
# ---------------------------------------------------------------------------
def off_topic_overlap_hint(answer: str, topic_keywords: list[str]) -> str | None:
    if not topic_keywords:
        return None
    text = (answer or "").lower()
    hits = [kw for kw in topic_keywords if kw.lower() in text]
    if hits:
        return (
            f"PRECHECK (off_topic): the answer contains topic-relevant terms "
            f"{hits}. off_topic requires the SUBJECT MATTER to be unrelated — "
            f"term overlap like this argues the candidate is attempting (even if "
            f"confused/wrong/incoherent) the actual topic, which should fall "
            f"through to a content signal (shallow_label / factual_error), not "
            f"off_topic."
        )
    return None


def build_precheck_block(
    *, answer: str, topic_keywords: list[str] | None = None
) -> str:
    """Assembles all applicable prechecks into one block for injection into
    the classification prompt. Silent (returns "") if nothing fired — keeps
    the prompt uncluttered on ordinary turns."""
    hints = []
    c = clarification_precheck(answer)
    if c:
        hints.append(c)
    hints.append(pure_denial_mechanical_test(answer))
    o = ownership_polarity_hint(answer)
    if o:
        hints.append(o)
    ot = off_topic_overlap_hint(answer, topic_keywords or [])
    if ot:
        hints.append(ot)
    if not hints:
        return ""
    return "\n\n---- COMPUTED PRECHECKS (facts, not verdicts — reconcile, don't ignore) ----\n" + "\n".join(
        f"- {h}" for h in hints
    )

    """
signal_detection_prompt.py
Rewritten signal classifier. Same 10-dimension taxonomy as your existing
scoring.py (kept, because the dimension definitions themselves were mostly
well-written — the audit showed the FAILURE was execution under load, not
the taxonomy). What changes:

  1. QUOTE-FIRST ORDERING. The model must extract verbatim evidence BEFORE
     naming a signal, not after. "signal_reason" was previously requested as
     an afterthought and the model filled it with a plausible-sounding
     paraphrase instead of a real quote (see turn 1 of the audit: reason
     text didn't appear anywhere in the candidate's answer). Forcing
     evidence-then-verdict is the single most consistently cited fix for
     ungrounded LLM judgments in the reliability literature.

  2. PROGRAMMATIC QUOTE VALIDATION. validate_evidence() checks the returned
     quote is an actual (fuzzy) substring of the transcript. If it isn't,
     the signal is REJECTED in code, not trusted — closing the exact gap
     that let turn 1 through.

  3. COMPUTED PRECHECKS injected as facts to reconcile (see
     signal_precheck.py) for the four signals proven unreliable in the
     audit: clarification_request, pure_denial, ownership_diffuse, off_topic.

  4. SELF-VERIFICATION PASS baked into the output contract: the model must
     state, for its own top signal, "does my quote actually satisfy this
     signal's trigger condition — yes/no" before finalizing. A "no" forces
     it to reconsider rather than submit a contradiction (this is exactly
     what would have caught the ownership_diffuse inversion on turns 12-13).

  5. CONTRASTIVE PAIRS added directly next to the four signals that
     misfired, instead of relying on the general "not_this" prose alone.

This module produces the SYSTEM PROMPT and a validator. It intentionally
does not touch scoring.py's quality-scoring call or the orchestrator —
those are separate concerns you asked to set aside for now.
"""
from __future__ import annotations
import difflib
import re
from typing import Any

from signal_precheck import build_precheck_block


MAX_SIGNALS_PER_TURN = 2


# ---------------------------------------------------------------------------
# Contrastive pairs for the four signals proven unreliable in the audit.
# Each pair is a REAL vs. LOOK-ALIKE case, phrased so the model has to check
# a distinguishing feature, not just recognize a category.
# ---------------------------------------------------------------------------
_CONTRASTIVE_PAIRS = """\
---- CONTRASTIVE PAIRS — the four signals most often confused. Check the
     distinguishing feature explicitly before firing any of these. ----

clarification_request vs. shallow_label:
  "Okay so what exactly do you need?" -> clarification_request. The sentence
    is DIRECTED AT the interviewer, asking them to specify something. There
    is no technical claim in it at all, not even a hollow one.
  "It just makes lookups fast, that's the whole point." -> shallow_label.
    The sentence is DIRECTED AT the question, offering a (thin) answer.
  Distinguishing check: is the sentence a question ABOUT the question, or an
  attempt AT the question? If the candidate is asking you something, it is
  response-shape, never a content signal.

pure_denial vs. conversational filler / a real (if weak) attempt:
  "Okay. Yeah. This is so different, but still I can answer." -> NOT
    pure_denial. Nothing here declines to answer — "still I can answer" is
    the opposite of a denial. This is a non-answer to be RE-PROMPTED
    (clarification_request), because they haven't actually answered yet, not
    a knowledge gap to be scored.
  "I don't know, it might be something like a hash function though." -> NOT
    pure_denial either — "hash function" is a real (if unsure) attempt,
    score it as content (shallow_label or factual_error depending on
    whether it's right).
  "..." (silence) or "I don't know." (nothing else) -> pure_denial.
  Distinguishing check: run the mechanical test (strip denial/filler
  phrases; if a content-bearing word survives, it is not pure_denial) before
  picking this signal, every single time — it is checked in code too, but
  confirm it yourself in your reasoning.

off_topic vs. confused-but-on-subject:
  Q: "Why put validation after auth middleware?" A: "Middleware protects
    between front end and back end, it will reject if not final access." ->
    NOT off_topic. It's incoherent and doesn't answer the specific question,
    but it's still talking about middleware/validation/access — the actual
    subject. Score it shallow_label or factual_error.
  Q: "Why put validation after auth middleware?" A: "I really like React for
    building UIs." -> off_topic. Genuinely unrelated subject matter.
  Distinguishing check: does the answer contain ANY term, however loosely
  used, from the topic's own vocabulary? If yes, it is on-topic-but-weak,
  never off_topic.

ownership_diffuse — polarity check (fires on COLLECTIVE language, not
personal language):
  "I would check whether the model is overfitting, I'd start by reviewing
    train vs. validation metrics." -> NOT ownership_diffuse. This is
    first-person, individually-owned language. If anything this is a
    STRONG answer — do not fire this signal just because a topic is
    normally associated with team decisions.
  "We moved off the monolith and split out payments, decided to use gRPC."
    -> ownership_diffuse. Real, specific work, but "we/decided" throughout
    with no individual action named.
  Distinguishing check: count "I" vs "we" in the specific sentence you're
  about to cite as evidence. If "I" dominates, this signal cannot fire on
  that sentence — pick a different gap or none at all.
"""


def _dimension_walk_block(reachable: list[str]) -> str:
    numbered = "\n".join(f"  {i+1}. {name}" for i, name in enumerate(reachable))
    return f"""\
PHASE 1 — QUOTE FIRST, THEN JUDGE (do this for every reachable dimension)
For each dimension below, in order:
  a) Find the exact span of the candidate's answer (copy it verbatim, do not
     paraphrase) that is most relevant to this dimension.
  b) Only THEN decide: does that exact span reveal a gap on this dimension,
     yes or no?
If you cannot find a real verbatim span relevant to a dimension, it cannot
be a gap on that dimension — move on.

Reachable dimensions this turn:
{numbered}
"""


def render_signal_classification_prompt(
    *,
    level: int,
    active_topic: str,
    question_type: str,
    reachable_signal_defs: dict[str, dict],
    signals_already_fired: list[str] | None,
    candidate_answer: str,
    topic_keywords: list[str] | None = None,
) -> str:
    """Builds the full system prompt for the signal-classification call."""
    reachable = list(reachable_signal_defs.keys())
    fired_list = ", ".join(signals_already_fired) if signals_already_fired else "None"

    gate_defs = """\
---- RESPONSE-SHAPE, checked FIRST, exactly one, never combines with a content signal ----
clarification_request — candidate is talking TO YOU about the question (asking you to
  repeat/rephrase/clarify, or checking if you can hear them) rather than attempting it.
  This is a FUNCTION check, not a phrase-match — "what exactly do you need" counts just
  as much as "can you rephrase that", even though it doesn't share vocabulary with any
  example. Ask yourself: is this sentence addressed to me, or is it an attempt at the
  question?
rephrase_request — candidate wants to redo THEIR OWN just-given answer.
off_topic — the SUBJECT MATTER is unrelated to what was asked (see contrastive pair
  above — confused-but-on-subject is never this).
If none of these fired: exactly one content-signal judgment happens below.
"""

    dim_defs = "\n\n".join(
        f"\"{name}\" [{d['dimension']}]\nTrigger: {d['trigger']}\nNOT this: {d['not_this']}"
        for name, d in reachable_signal_defs.items()
    )

    precheck_block = build_precheck_block(
        answer=candidate_answer, topic_keywords=topic_keywords
    )

    return f"""\
You are a strict, evidence-first signal classifier for a technical interview.
Topic: {active_topic or 'general'} | Level: {level} | Question type: {question_type or 'n/a'}
Signals already fired on this topic: [{fired_list}]

Your ONLY job: find real, quotable evidence in the candidate's answer, then
pick up to {MAX_SIGNALS_PER_TURN} signals it actually supports. A signal
with no verbatim quote behind it is not allowed to fire.

{gate_defs}

{_dimension_walk_block(reachable)}

{dim_defs}

{_CONTRASTIVE_PAIRS}
{precheck_block}

PHASE 2 — SELF-VERIFY BEFORE YOU FINALIZE
For your chosen PRIMARY signal: re-read its trigger condition and your quote
side by side. Does the quote actually satisfy the condition, word for word —
not "sounds like it might," but actually does? If no, discard it and pick
the next-best supported signal instead. Do this check silently but honestly;
a plausible-sounding signal with a quote that doesn't really back it is
exactly the failure mode this process exists to prevent.

PHASE 3 — OUTPUT
End your response with exactly one JSON object:
{{
  "evidence": [
    {{"signal": "<name>", "quote": "<verbatim span from the candidate's answer, 3-15 words>"}}
  ],
  "signals": ["<primary>", "<secondary optional>"],
  "signal_reason": "<the PRIMARY signal's quote, copied exactly, not paraphrased>",
  "self_corrected": true/false
}}
Rules: "signals" entries must each appear in "evidence" with a matching quote.
Max {MAX_SIGNALS_PER_TURN} signals, from different dimensions. Never empty —
if truly nothing else fits, fall back to the single best-supported gap rather
than fabricating a second one.
"""


# ---------------------------------------------------------------------------
# Programmatic evidence validation — the enforcement half of "quote first".
# A prompt instruction to quote verbatim is not a guarantee; this is.
# ---------------------------------------------------------------------------
def _normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", (s or "").lower()).strip()


def quote_is_grounded(quote: str, answer: str, threshold: float = 0.82) -> bool:
    """Fuzzy substring check: is `quote` really present in `answer`?
    Tolerant of ASR punctuation/casing noise, not of fabrication.
    Slides a window over the answer roughly the size of the quote and takes
    the best similarity ratio — cheap, dependency-free, good enough to catch
    "reworded paraphrase presented as a quote" (the turn-1 failure mode).
    """
    q = _normalize(quote)
    a = _normalize(answer)
    if not q or not a:
        return False
    if q in a:
        return True
    q_words = q.split()
    a_words = a.split()
    win = max(3, len(q_words))
    best = 0.0
    for i in range(0, max(1, len(a_words) - win + 1)):
        window = " ".join(a_words[i : i + win + 2])
        ratio = difflib.SequenceMatcher(None, q, window).ratio()
        best = max(best, ratio)
    return best >= threshold


def validate_and_filter_signals(
    parsed: dict[str, Any], candidate_answer: str
) -> tuple[list[str], str | None, list[str]]:
    """Cross-checks every claimed signal against its quoted evidence.
    Returns (validated_signals, signal_reason, dropped_signals_for_logging).
    A signal whose quote isn't actually in the transcript is dropped —
    this is the hard enforcement of the "exact quote" contract that the
    prompt-only version silently failed on turn 1 of the audit.
    """
    evidence = {e.get("signal"): e.get("quote", "") for e in parsed.get("evidence", [])}
    claimed = list(parsed.get("signals", []))[:MAX_SIGNALS_PER_TURN]

    validated: list[str] = []
    dropped: list[str] = []
    for sig in claimed:
        quote = evidence.get(sig, "")
        if quote and quote_is_grounded(quote, candidate_answer):
            validated.append(sig)
        else:
            dropped.append(sig)

    reason = None
    if validated:
        reason = evidence.get(validated[0])
    return validated, reason, dropped
    """
probe_generation_prompt.py
Rewritten follow-up question generator. Takes the OUTPUT of
signal_detection_prompt.py (validated signals + their grounding quotes) and
builds one natural interviewer follow-up.

WHAT CHANGES FROM probe_strategy.py
------------------------------------
1. The directive is now built FROM THE QUOTES, not just the signal names.
   Old flow: "SIGNALS FIRED: shallow_label / TRIGGER REASON: <maybe-fabricated
   reason>" — the question-generation LLM had no guaranteed real evidence to
   anchor on. New flow: it receives the exact verbatim span that triggered
   each signal, so "walk me through what happens" can reference the specific
   thing they said instead of a generic template.

2. Two validated signals get ONE composite directive with an explicit
   priority: lead with whichever signal's quote is more specific/concrete;
   let the second shape word choice only. This directly answers "we use 2
   signals most so it generates best question using those 2" — the model is
   told which of the two is the spine of the question and which is seasoning,
   so it doesn't produce two stapled-together questions.

3. Socratic framing is now a hard constraint, not a suggestion: for
   factual_error specifically, the directive explicitly forbids correcting
   the candidate and requires a falsifying scenario instead (this was already
   true in scoring.py's language but is restated here because probe.py is
   where it actually has to be obeyed).

4. A single-question, single-scenario constraint plus a real interviewer
   phrasing example is attached per signal so the LLM has a concrete anchor,
   not just an abstract instruction ("ask about tradeoffs" vs. an example of
   what that sounds like out loud).
"""
from __future__ import annotations
from typing import Any


# ---------------------------------------------------------------------------
# Per-signal probe strategy: {instruction, forbidden move, worked example}
# Only the signals that drive an actual next-question decision are here;
# response-shape signals (clarification/rephrase/off_topic) have fixed
# non-generative actions already (repeat / accept / redirect) and don't need
# a generative probe.
# ---------------------------------------------------------------------------
PROBE_STRATEGY: dict[str, dict[str, str]] = {
    "factual_error": {
        "instruction": (
            "Do NOT correct them or say they're wrong. Build a concrete scenario or "
            "input that only makes sense if their stated claim were true, and ask "
            "what happens. Let the contradiction surface itself when they trace it."
        ),
        "forbidden": "Never say 'actually' or state the correct fact yourself.",
        "example": (
            "They said hash maps keep things sorted. -> 'If I insert 5, then 1, then "
            "3 into your hash map and iterate over it, what order do the elements "
            "come out in?'"
        ),
    },
    "shallow_label": {
        "instruction": (
            "Ask them to trace the mechanism step-by-step for ONE concrete input. "
            "Never ask 'what is X' again — they already gave you the label; you need "
            "the internals."
        ),
        "forbidden": "Never re-ask a definition question.",
        "example": (
            "They said 'generators are memory efficient and lazy.' -> 'Say I call "
            "next() on your generator three times in a row — walk me through what "
            "the interpreter is actually doing at each call.'"
        ),
    },
    "cost_blind": {
        "instruction": (
            "Force a choice under a specific constraint (scale, latency, memory). "
            "Never ask an open 'what are the tradeoffs' question — hand them a number "
            "or a limit and ask what they'd do."
        ),
        "forbidden": "Never accept another benefit as an answer to a cost question.",
        "example": (
            "They said 'I'd add an index on every filtered column.' -> 'Say this "
            "table takes 500 writes a second and storage is tight — does that change "
            "which columns you'd index?'"
        ),
    },
    "edge_case_blind": {
        "instruction": (
            "Hand them one specific boundary condition (empty input, concurrent "
            "access, partial failure, null) and ask what happens at that exact point."
        ),
        "forbidden": "Never ask a vague 'what about edge cases in general'.",
        "example": (
            "'What happens in your rate limiter if two requests land in the exact "
            "same millisecond, right at the window boundary?'"
        ),
    },
    "ambiguity_unchecked": {
        "instruction": (
            "Name the missing constraint explicitly and ask whether it changes their "
            "answer — don't just ask 'what would you clarify', hand them the actual "
            "hidden requirement."
        ),
        "forbidden": "Never let them re-answer the same way without addressing the constraint.",
        "example": (
            "'Say this needs to be exactly-once, not best-effort — does that change "
            "your Kafka setup?'"
        ),
    },
    "impact_disconnected": {
        "instruction": (
            "Force the connection to a concrete outcome: ask what changed for a real "
            "user or the business, in a number or specific result, not a category."
        ),
        "forbidden": "Never accept 'it's more scalable/modern' as a complete answer.",
        "example": "'What did that actually save — response time, cost, incidents? Any number you remember?'",
    },
    "ownership_diffuse": {
        "instruction": (
            "Ask specifically which PART was theirs and what THEY personally decided "
            "or built inside the collective effort they just described."
        ),
        "forbidden": "Never phrase it as doubting whether they did the work — assume the work is real, ask for their slice of it.",
        "example": "'Inside that migration, what was the piece you personally owned or decided on?'",
    },
    "conflict_avoidant": {
        "instruction": "Name the friction/stakeholder explicitly and ask how they actually handled it.",
        "forbidden": "Never ask a generic 'tell me about a conflict' unrelated to what they described.",
        "example": "'When the PM pushed for that timeline, did you push back at all, or go along with it?'",
    },
    "growth_deflected": {
        "instruction": "Ask directly what they would do differently now, or what changed in how they work because of it.",
        "forbidden": "Never let 'that's just how it happened' stand as the final word.",
        "example": "'Looking back, is there anything you'd have caught earlier if you were doing it again?'",
    },
    "confident_uncertain": {
        "instruction": "Re-ask the SAME fact from a different angle or input — a guess flips, real knowledge holds.",
        "forbidden": "Never just ask 'are you sure' — test it, don't interrogate the confidence itself.",
        "example": "They hedged their way to a correct Big-O. -> Give a slightly different input shape and ask for the complexity again.",
    },
    "mastery_demonstrated": {
        "instruction": "Either push one genuine unseen edge case, or close the topic — there's nothing hollow left to probe.",
        "forbidden": "Never manufacture a gap that isn't there just to keep probing.",
        "example": "'One more — what if two of those ran concurrently on the same key?'",
    },
}


def _quote_evidence_block(evidence: list[dict[str, str]]) -> str:
    if not evidence:
        return "(no grounding quote available — ground the question in their last answer directly)"
    lines = [f'  {e["signal"]}: "{e["quote"]}"' for e in evidence]
    return "\n".join(lines)


def render_probe_directive(
    *,
    signals: list[str],
    evidence: list[dict[str, str]],
    level: int,
    active_topic: str,
) -> str:
    """Builds the composite directive handed to the question-generation LLM.
    `signals` and `evidence` come straight from
    signal_detection_prompt.validate_and_filter_signals — i.e. already
    verified against the transcript, never fabricated.
    """
    if not signals:
        return "No validated signal — ground the next question in the candidate's last answer directly, asking them to go one level deeper."

    primary, secondary = signals[0], (signals[1] if len(signals) > 1 else None)
    p_strat = PROBE_STRATEGY.get(primary, PROBE_STRATEGY["shallow_label"])

    block = [
        f"VALIDATED EVIDENCE (real quotes, checked against the transcript):",
        _quote_evidence_block(evidence),
        "",
        f"PRIMARY SIGNAL: {primary}",
        f"  Move: {p_strat['instruction']}",
        f"  Never: {p_strat['forbidden']}",
        f"  Sounds like: {p_strat['example']}",
    ]

    if secondary:
        s_strat = PROBE_STRATEGY.get(secondary, {})
        block += [
            "",
            f"SECONDARY SIGNAL (let this shape word choice, don't build a second question): {secondary}",
            f"  Angle: {s_strat.get('instruction', '')}",
            "COMPOSITE RULE: the primary signal decides WHAT you ask (the scenario, "
            "the mechanism, the boundary). The secondary signal only decides HOW you "
            "phrase it — e.g. if the secondary is ownership_diffuse, phrase the "
            "primary's scenario as 'what would YOU do' rather than 'what would "
            "happen'. If weaving both cleanly isn't possible in one natural "
            "sentence, drop the secondary and ask the primary's question alone — "
            "never staple two questions together and never ask two question marks.",
        ]

    block += [
        "",
        "HARD CONSTRAINTS:",
        "- Exactly ONE question mark in your output.",
        "- Ground it in something concrete from THIS answer — quote or closely "
        "paraphrase the evidence above so the candidate recognizes their own words.",
        "- 40-80 words total. React briefly first (one clause, no 'Great!'/'Awesome!').",
        "- Never repeat the wording of the question that produced this answer.",
    ]
    return "\n".join(block)


def render_question_generation_system(
    *, level: int, level_guide: str, code_card_contract: str = ""
) -> str:
    """Top-level system prompt. Level-guide and code-card-contract are
    unchanged inputs from your existing probe_strategy.py — only the body
    around signal handling changes."""
    return f"""\
You are Ishitha, a sharp and warm AI interviewer conducting a live technical
interview. You are not reading a script. You listen to what was actually
said, then ask the one next question a strong human interviewer would ask.

{level_guide}

YOUR JOB THIS TURN
Read the VALIDATED EVIDENCE block you're given below (it contains the exact
words the candidate used — never invent evidence beyond it) and the per-signal
directive. Write ONE follow-up question that a real interviewer would say out
loud, grounded in that evidence, following the HARD CONSTRAINTS exactly.

Do not sound like a rubric or checklist. Do not announce which signal fired.
Just ask the question a sharp interviewer would ask next.

{code_card_contract}
"""