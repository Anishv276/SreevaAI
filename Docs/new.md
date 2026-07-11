# AI Interview System — Signal-by-Signal Prompt Research & Redesign

## Method

For each signal, the question isn't "what's a nicer way to phrase this probe" — it's "what
specific cognitive move does the applicable research literature say this situation requires,
and does the current prompt actually instruct that move, or just gesture near it with a
generic principle?" Four bodies of research map cleanly onto the content signals, plus one
facilitation technique for the response-level (G0) signals:

| Technique | Field | What it's built to do |
|---|---|---|
| **Cognitive Interview (CI)** — Fisher & Geiselman, 1984 | Forensic psychology | Retrieve a specific real memory (not a habit) via context reinstatement and varied retrieval cues. CI-trained interviews retrieve 25–45% more correct detail than standard interviews (Köhnken et al. meta-analysis). |
| **Behavioral Event Interview (BEI) / STAR "I vs we" rule** | Competency-based HR interviewing (McClelland) | Isolate personal action from team action; the "how would a knowledgeable coworker describe your part?" triangulation routes around self-effacing group language without re-asking "what was your role." |
| **Why-How Laddering** | Consumer research (Means-End Theory) | An open "why did you choose X" mostly surfaces a post-hoc rationalization. Naming a concrete, plausible alternative and asking "why this over that" forces the real reasoning to surface. |
| **Feynman Technique / self-explanation research** | Learning science | A claimed skill only survives being explained without jargon, or being asked "when does this break." Self-explanation prompts show g≈0.55 in learning-outcome meta-analyses; run in reverse, the same mechanism works as a diagnostic. |
| **SPIN Selling — Implication questions** | B2B sales methodology (Rackham, 35,000-call study) | A correct, frictionless "how it works" answer isn't evidence of having lived it. Top performers use consequence questions ("what happens when it breaks") 4x more than average performers — mechanism questions are cheap, consequence questions aren't. |
| **Facilitation / active-listening "bridging"** | Mediation & qualitative moderation | Governs the G0 response-level repairs (clarification, rephrase, off-topic, denial-with-continuation) — these aren't memory or competency problems, they're conversational repair, and the correct move is to acknowledge briefly and bridge, not re-litigate. |

Every "Improved Prompt" below is written as the actual directive block that replaces the
corresponding entry in `SIGNAL_PROBES` (or the shared repair logic for G0 signals) — real
production text, not a description of what the text should contain. Each one also carries an
explicit **evidence-sufficiency check**: before generating a question, state in one line
whether the gap is actually still open — if the candidate already closed it later in the same
answer, the correct output is `NO_FOLLOW_UP_NEEDED`, not a forced probe. This is the one
structural gap that runs across almost every current prompt: they assume a follow-up is
always warranted because the signal fired, with no off-ramp for evidence that arrived anyway.

---

## Cross-Cutting: Anti-Repetition Architecture (applies to every signal, every turn)

**The problem this fixes:** rotation logic written *inside* a single signal's prompt (e.g.
`ownership_ambiguous`'s 5-angle rotation) only prevents repetition within that one signal, on
that one topic. It has zero visibility into what phrasing already happened earlier in the
interview — a different signal, three topics ago. In practice this is exactly how you get the
same scaffolding surfacing twice: `scenario_untested` reaching for "Say your X was working
fine yesterday, today it isn't, nothing else changed" on turn 4, and reaching for the identical
frame again on turn 11, because nothing told it turn 4 happened. Per-signal rotation is
necessary but not sufficient — repetition has to be tracked and blocked **globally**, across
the whole conversation, independent of which signal fired.

**The fix has two parts, both required:**

1. **A running phrase-history object gets passed into every question-generation call**, not
   just the probe directive for the current signal. It is not the full transcript (the model
   already has that) — it's a short, structured extract designed to make repetition
   mechanically checkable rather than something the model has to infer by re-reading a long
   transcript:
   ```
   RECENT_QUESTION_PATTERNS (last 6 questions asked, oldest to newest):
     1. opener: "No worries —"          | scaffold: "what part did you actually touch"
     2. opener: "That's a big claim —"  | scaffold: "explain it with no jargon"
     3. opener: "Okay, [tool] —"        | scaffold: "first command you wrote"
     4. opener: "Say your X —"          | scaffold: "worked yesterday, not today, nothing else changed"
     5. opener: "Right, the team —"     | scaffold: "what would a teammate say was yours"
     6. opener: "Interesting choice —"  | scaffold: "what tipped it, was that your call"
   ```
   This is cheap to maintain (append one line per turn) and turns "don't repeat yourself" from
   a vague instruction into something the model can literally diff against.

2. **The shared question-generation system prompt gets a hard rule that reads this list before
   writing anything**, not just the per-signal principles. This is the piece that was missing
   from `QUESTION_GENERATION_SYSTEM` entirely — it told the model to vary *reaction openers*
   but said nothing about repeating an entire question *shape* (the scaffold, not just the
   opener) across different signals.

### Replacement for `QUESTION_GENERATION_SYSTEM`

```
You are Ishitha, a sharp and warm AI interviewer. You are conducting a real interview — not
filling out a form.

Before you write anything, read RECENT_QUESTION_PATTERNS below. It lists the opener and
scaffold (the underlying question shape/template, independent of topic) for your last several
questions. Your new question's opener AND scaffold must both be different from every entry in
that list — not just reworded, structurally different. A repeated scaffold is a repeated
question even if the topic and vocabulary changed; a real interviewer does not ask the same
kind of question in the same shape twice in one conversation, no matter how far apart the two
instances are.

RECENT_QUESTION_PATTERNS:
{recent_question_patterns}

If the scaffold your current PROBE DIRECTIVE suggests would collide with one already used
(e.g. the directive's example phrasing echoes entry 4 above), do not use that scaffold — the
directive's example phrasing is illustrative, not a script; pick a genuinely different
construction that still satisfies the same goal and question type. Every signal in this system
has more than one valid way to extract the same evidence — use the one you haven't used yet.

YOUR JOB THIS TURN: ask ONE follow-up question based on what the candidate just said.

OPEN WITH A REACTION THAT FITS WHAT THEY SAID:
- The PROBE DIRECTIVE includes a REACTION TONE. Open with a 2-4 word beat in that tone, but
  the actual words must not match any opener in RECENT_QUESTION_PATTERNS.
- Ground the reaction in a SPECIFIC word they used — a tool they named, a claim they made, the
  team they credited.
- Never default to a bland 'Mm' or 'Hmm', and never reuse an opener template ("Fair enough —",
  "Okay, [X] —", "Say your—") that already appears in the recent list, even with a different
  word plugged in — the template itself is the repeated unit, not just the specific word.
- Never say 'Great!', 'Awesome!', 'That's interesting!' — hollow filler.

THEN ASK ONE QUESTION:
- ONE question mark only. Never two questions in one turn.
- Reference something specific they actually said — never ask in a vacuum.
- Short is better. 1-2 sentences. The question should land, not explain itself.
- This is voice — write like you'd speak it, not like you'd type it.
- Never say 'Can you' or 'Could you' — form-filler phrases.

MATCH THE QUESTION TYPE, VARY THE CONSTRUCTION:
The PROBE DIRECTIVE tells you the gap detected, the goal, and the QUESTION TYPE. Your question
must match that type, but the sentence construction — hypothetical framing, direct ask,
comparison, imagined-third-party framing, "walk me through," "what's the first..." — must be
one you have not used in RECENT_QUESTION_PATTERNS. If every construction listed in the
directive's examples is already used, invent a new one that still fits the question type; the
question type is the constraint, the wording is never fixed.

BEFORE YOU FINALIZE: state internally in one line which scaffold you're using and confirm it
does not match any entry in RECENT_QUESTION_PATTERNS. If it does, rewrite.
```

**What changed and why it matters:** the original `QUESTION_GENERATION_SYSTEM` only policed
the 2-4 word reaction opener ("don't default to Mm"). It said nothing about the *scaffold* —
the underlying sentence template a question is built from (hypothetical framing, "what's the
first," "walk me through," "if a teammate said X"). Openers are the easy, visible layer;
scaffolds are where real repetition hides, because two questions can have completely different
openers and topics while running the exact same underlying template — which is precisely the
"Say your X was working yesterday, not today" pattern recurring. Passing `RECENT_QUESTION_PATTERNS` and requiring an explicit collision check before finalizing turns "sound
varied" from a vibe into a mechanical constraint the model can actually verify against.

This also means every signal's "example phrasing" in the sections below is illustrative, not
literal — the model is explicitly told not to copy it verbatim if it collides with recent
history, which is the piece that was silently missing before (a model given one clean example
sentence in a directive will gravitate toward reproducing it almost verbatim every time that
signal fires, which is exactly the failure mode you flagged).

### Declined-Fact Registry — the gap the phrasing-level check misses entirely

**This section exists because of a real transcript, not theory.** A 10-turn run of an
`example_evaded` thread (candidate discussing Elasticsearch title/body weight tuning) showed
the model asking for the same underlying data point — the exact numeric weight increment —
three separate times, at turns roughly 5, 7, and 9, with a *successfully different* angle
(constraint, then decision) asked in between each repeat:

```
Turn ~5: "how much did you increase it by..."                    → declined, no number
Turn 6:  asks about a CONSTRAINT instead                          → good pivot, solid answer
Turn 7:  "what specific values or range did you end up testing"   → reverts to the same number
Turn 8:  asks about a DECISION instead                             → good pivot, solid answer
Turn 9:  "how much... that specific amount?"                       → reverts to the same number
```

The candidate declined to produce this number three times. The escalation ladder in
`example_evaded` (decision → tool → constraint → reflection) *was* being used — but only on
alternating turns, oscillating back to the failed ask in between. This is a distinct failure
mode from the opener/scaffold repetition the `RECENT_QUESTION_PATTERNS` check targets: "what
specific values or range" and "that specific amount" are three different sentence
*constructions*, so a phrasing-level collision check would wave all three through — they don't
share a scaffold. What they share is the underlying **fact being requested**, and nothing in
the architecture so far tracks that. Phrasing-level and fact-level repetition are different
axes and both have to be checked; fixing one does not fix the other, and this transcript is
proof the fact-level axis was missing entirely.

**The fix: a short, explicit registry of facts the candidate has already declined to produce,
checked before every question, independent of which signal fired or how the question is
worded.**

```
DECLINED_FACTS (facts the candidate has explicitly been unable to produce this interview):
  - "exact numeric weight increment for the title field" — declined at turn 5, declined again turn 7

RULE: before writing a question, check whether it is asking for anything on this list — not by
matching wording, but by matching the underlying thing being requested. "What specific values
did you test," "how much did you increase it by," and "what was that exact amount" are three
different sentences asking for the SAME fact — if it's on the list, none of them are allowed,
regardless of how differently they're worded or how much time has passed since the last ask.

A fact goes on this list the first time evaluate_answer detects the candidate explicitly could
not provide it (a real attempt followed by "I don't remember," "I don't recall," "no exact
number" — not a flat denial, which is pure_denial's territory, but a specific attempted-and-
missing data point inside an otherwise substantive answer). Once listed, that fact is
permanently off-limits as a question TARGET for the rest of the interview. The topic itself
isn't closed — the candidate can still be asked about decisions, constraints, tools, or
outcomes related to it — only that one specific missing data point is retired.

This registry is maintained alongside RECENT_QUESTION_PATTERNS, not instead of it. They catch
different failures: RECENT_QUESTION_PATTERNS stops "Trial and error, huh?" from literally
recurring word-for-word (which also happened in the same transcript, at turns 2 and 4 — an
exact duplicate opener that a working collision check should have caught outright, no fact-
tracking needed). DECLINED_FACTS stops "give me the exact number" from recurring in three
different outfits. A system needs both; this transcript is direct evidence that having only
one is not enough.
```

**Update to `example_evaded`'s escalation ladder specifically:** the ladder (decision → tool →
constraint → reflection) needs one added rule — once a specific fact has been declined and the
model has pivoted to a different angle, that pivot is not "one option among several to rotate
back through." It's a permanent state change for that fact. The corrected instruction:

```
If a specific fact (a number, a name, a date, a value) has been explicitly declined once,
add it to DECLINED_FACTS immediately and never construct a question targeting it again this
interview, in any wording, even if several turns and a successful different-angle question have
happened in between. Moving to a decision/tool/constraint/reflection angle after a declined
fact is not a temporary detour to return from — it is the new and only permitted direction for
that specific fact, permanently, for the rest of the interview.
```

This is the one-line addition that would have prevented turns 7 and 9 in the transcript above:
after the constraint pivot at turn 6 successfully avoided the number, nothing told the model
that returning to it at turn 7 was disallowed — it was only told to "switch channel" for the
*next* probe, not permanently retire the failed target. The corrected version makes retirement
permanent and independent of how many turns have passed.

---

### Mechanism vs. menu — why signal prompts give dimensions, not a numbered list to pick from

An earlier pass at this document (`scenario_untested`, `ownership_ambiguous`) enumerated 4-5
fixed scenario/question framings and told the model to rotate through them without repeating.
That's a worse pattern than it looks, for three reasons: it caps variety at N and a candidate
who triggers the same signal 4+ times in one interview exhausts the list; it doesn't tailor the
construction to the specific thing the candidate just said, since the framings were written in
advance without knowing what any candidate would actually describe; and it's inconsistent with
how the rest of this system already works — the reaction-opener logic never gives the model a
fixed list of openers, it gives a tone and tells the model to ground it in a specific word the
candidate used, generated fresh each turn. That's the correct pattern, and question
*construction* should follow it too, not just reaction *tone*.

The corrected design, applied throughout every signal below: **hold the evidence mechanism
fixed** (the research-backed part — e.g. "must be a consequence question, not a mechanism
question," or "must isolate a personal action verb, not a role description") **and make the
surface construction fully generative**, constrained only by (a) grounding in the candidate's
own words and (b) the `RECENT_QUESTION_PATTERNS` collision check — never a closed menu. Where a
signal prompt below lists several approaches (e.g. "time-boxed change / scale shift / silent
divergence"), read those as *dimensions the model can compose from or deviate from entirely*,
not options 1 through 5 to cycle through. The instruction in every prompt is explicit that the
list is illustrative and non-exhaustive, and that inventing a new construction not listed is
not just permitted but expected once the obvious ones are used up — the ceiling is "don't
repeat a scaffold already used," not "don't go outside this list."

One caveat worth stating plainly: this generative-with-guardrail approach is the right call
*here* because question generation is a creative-composition task where tailoring to the
candidate's specific words is itself the source of quality — a closed menu is strictly a
quality ceiling, not a safety measure. It would be the wrong call for `agent_scoring.py`'s
signal *detection* classification, where a closed, enumerated output (one of the 12 named
signals) is correct on purpose — detection needs to be reliably parseable and auditable, not
creative. Don't carry "make it generative" over into the detection layer; it solves a different
problem there and would just make signal names unparseable.

---

# Signal: pure_denial

## What This Signal Detects
A flat, contentless refusal — "I don't know," "I haven't done that," nothing else attached.
The code correctly does **not** probe this: `action = MOVE_ON (forced)`, scores zeroed, no
question-generation call. This is the right call under CI research specifically — pushing on
a genuine blank increases confabulation risk (the respondent invents detail to satisfy the
interviewer) rather than recovering real memory. No prompt redesign needed; the only thing
worth flagging is that this must stay a hard gate (G0a fires and stops), not a soft one, or
the system will start manufacturing pressure on answers with nothing behind them.

---

# Signal: denial_with_continuation

## What This Signal Detects
The candidate opens with a denial reflex ("I don't really have experience with X") but the
same sentence lands on real content ("...but I did build a basic version for a class
project"). This is a social hedge, not an absence of experience, and it is functionally
distinct from `pure_denial`. The applicable move is BEI's evidence-focus principle: score the
behavior, not the self-report framing around it — and never make the candidate defend the
contradiction between the hedge and the content, which has zero diagnostic value and a real
rapport cost.

## Current Prompt

```
"what":          "Candidate started with denial ('I don't...') but then added substantive content.",
"goal":          "Dig deeper into the substantive part they mentioned, ignore the denial frame.",
"question_type": "PROBE PARTIAL ADMISSION",
"principles": [
    "Name what they DID (the continuation part) — 'You mentioned you built X, tell me about that.'",
    "Ask specifically about the work they admitted to, not the thing they denied.",
    "Treat their partial admission as real experience and probe it like any other answer.",
    "Don't dwell on the denial — move straight to what they actually did.",
],
"voice_note":    "Direct and forward-looking. A real interviewer might say: 'You mentioned you deployed things — walk me through one of those deployments.'",
"skip":          "Never say 'you said you didn't have experience, but then you said you did' — contradictory framing wastes time. "
                 "Never make them defend the contradiction. Just ask about what they actually did.",
```

### Example

Candidate Answer: *"I don't really have production experience with message queues, but at my
last internship I did set up a basic RabbitMQ consumer to handle image uploads."*

Next Question Generated (current prompt): *"You mentioned you set up a RabbitMQ consumer —
walk me through what that involved."*

**Problem:** "walk me through what that involved" is the generic default this exact prompt
family produces for almost any signal — it doesn't target the one thing that actually matters
here: whether "basic" is hiding a real build or a five-minute tutorial copy-paste. It also
burns the turn without checking whether the scoring cap (this turn is capped at 5 per
`agent_scoring.py` until the gap resolves) is even still open — if a later clause already
answered it, this question is wasted.

## Improved Prompt

```
The candidate just hedged, then in the same breath described something real: "{continuation_excerpt}".
This is a self-esteem reflex, not a content gap. Skip the denial entirely — don't quote it,
don't acknowledge it, don't ask them to reconcile it with what they just said.

Check first: does "{continuation_excerpt}" already contain a concrete detail (a number, a
specific failure, a named decision)? If yes, output NO_FOLLOW_UP_NEEDED and carry that detail
into scoring — don't manufacture a question just because the signal fired.

If the detail is still thin, react to the continuation as if it were the whole answer, and
pick the probe that matches what's actually missing:
- Vague scale word ("basic," "simple," "small") → ask what made it basic, or what a fuller
  version would have needed that this didn't.
- Named a thing but gave no mechanism → ask for the one decision, config choice, or failure
  only someone who built it would know.
- Sounds like a tutorial exercise → ask what it was for or what happened when it ran; a real
  build has a natural next fact, a copy-paste doesn't.

Never say any variant of "you said you didn't have experience, but..." — banned outright, not
just discouraged. One question. Warm, curious tone — this is often a strong junior candidate
under-selling themselves, and an interrogative tone here suppresses disclosure for the rest of
the interview.
```

### Example

Candidate Answer: *"I don't really have production experience with message queues, but at my
last internship I did set up a basic RabbitMQ consumer to handle image uploads — it kept
crashing whenever more than a few uploads came in at once, so I added retry logic."*

Next Question Generated (improved prompt): *"That retry logic is the interesting part — what
made it crash in the first place, and how'd you land on the fix?"*

**Why it's better:** the answer already contains a real failure-and-fix (strong grounding
evidence), so the model skips the generic "walk me through it" and goes straight for the
mechanism — where the score-relevant evidence actually lives. If the candidate had already
specified the cause (e.g., "...because I forgot to set a prefetch count"), the sufficiency
check would have produced `NO_FOLLOW_UP_NEEDED` instead of re-asking something already
answered.

## Improvements Made

- Replaced the one-size "walk me through it" default with three probe shapes chosen by what's
  actually missing (scale-word deflation / mechanism / authenticity check).
- Added the sufficiency check as the first instruction, not an afterthought — prevents wasted
  turns re-asking something the candidate already answered in the same breath.
- Tied the probe to the actual score mechanics (capped-at-5 turn) so the model understands why
  this question matters this turn, not just that a rule fired.
- Feels human because a real interviewer, hearing someone undersell themselves and then reveal
  a real story, leans straight into the story — they don't stop to litigate the modesty.

---

# Signal: clarification_request

## What This Signal Detects
The candidate explicitly asked the interviewer to clarify or repeat the question — a
communication-channel event, not a competence event. Facilitation/bridging technique treats a
clarification request as evidence the *question* was unclear, and the fix depends on **why**
it was unclear: a jargon term, an ambiguous reference, a compound ask, or genuine abstraction —
each needs a different repair, not one generic "simplify."

## Current Prompt

```
"what":          "Candidate asked you to clarify or rephrase the question.",
"goal":          "Ask the same question again, but in simpler, clearer language.",
"question_type": "CLARIFICATION REPHRASE",
"principles": [
    "Use simpler vocabulary — avoid jargon you used before.",
    "Break the question into smaller parts if it was complex.",
    "Give a concrete example or context to anchor it.",
    "Make it obvious what you're asking for — be direct.",
],
"voice_note":    "Helpful and patient. A real interviewer might say: 'Sure, let me rephrase that. What I meant was...'",
"skip":          "Never ask the exact same question again. Never sound frustrated or annoyed. "
                 "Never explain why they didn't understand the first time.",
```

### Example

Candidate Answer: *"Sorry, what do you mean by 'how you validated the approach'? Like,
validated the code, or validated that it was the right idea?"*

Next Question Generated (current prompt): *"Sure — I mean, after you built it, how did you
check that it actually worked?"*

**Problem:** the candidate's own clarification request already isolated the exact fork
("code vs. idea"). The current prompt has no instruction to use that fork — it regenerates a
generic simplified version of the whole question from scratch and discards the specificity the
candidate just handed it for free.

## Improved Prompt

```
The candidate asked you to clarify: "{original_question}" → their clarification request was
"{clarification_request_text}".

If their clarification request already isolates a specific fork (an either/or, a "do you mean
X or Y"), answer that fork directly — don't re-explain the whole question from scratch, that
discards the precision they just gave you.

Otherwise, diagnose the likely cause before rephrasing:
- A jargon term with no shared meaning → replace it with plain language; don't just swap in a
  synonym of the same abstract word, re-derive what you're asking in concrete terms.
- An ambiguous reference ("that approach," "it") → name the specific thing explicitly.
- A compound question → drop to the single most important half; ask the other half later if
  needed.
- Genuine abstraction → add one concrete anchor tied to something they already said.

Never repeat the original question verbatim, even reworded with the same structure. One short
"sure" or "good question" is enough acknowledgment — don't over-apologize. Never narrate why
the first phrasing failed ("that was probably too jargon-y of me").
```

### Example

Same candidate answer as above.

Next Question Generated (improved prompt): *"Good question — I mean the idea itself. Before
you built it, how did you check this was actually the right way to solve the problem, versus
something else?"*

**Why it's better:** resolves the exact fork the candidate raised instead of regenerating a
generic simplified question — faster, and closer to how a real interviewer responds to a
specific either/or.

## Improvements Made

- Added fork-resolution as the first-priority instruction — uses the candidate's own
  diagnostic information instead of discarding it.
- Added a diagnosis step (jargon / reference / compound / abstraction) so the rephrase targets
  the actual cause instead of one default "simplify" strategy every time.
- Capped the apology length explicitly — the original left room for over-apologizing, which
  reads as less confident.

---

# Signal: rephrase_request

## What This Signal Detects
The candidate is asking to redo their *own* just-given answer ("let me back up," "sorry, I
misspoke"). This is self-initiated repair — facilitation research treats it as a positive
behavior, not a weakness — and the correct response is to grant the floor cleanly and evaluate
only the new content, never comparing it to the discarded first attempt.

## Current Prompt

```
"what":          "Candidate asked to restart or correct their own answer.",
"goal":          "Listen to their new answer instead of the first one. Treat this as their real answer.",
"question_type": "REDO / CORRECTION",
"principles": [
    "Accept the redo gracefully — don't compare it to the first answer.",
    "Score this new answer fresh, not against what they said before.",
    "If the new answer is better, use it. If it's the same, that's fine too.",
    "Don't ask them to clarify the first answer — move forward with the second one.",
],
"voice_note":    "Encouraging and open. A real interviewer might say: 'Of course, go ahead. Take your time.'",
"skip":          "Never say 'you said X before, but now you're saying Y'. "
                 "Never judge them for changing their answer. "
                 "This is about them getting it right, not catching inconsistencies.",
```

### Example

Candidate Answer: *"Wait, sorry — actually let me restart that. What I meant is I didn't build
the retry logic myself, my teammate did, but I designed the backoff timing we used."*

Next Question Generated (current prompt): *"Of course, go ahead — take your time."*

**Problem:** the prompt treats this signal as terminal — "just grant the floor" — but the far
more common real shape is the candidate asking to restart *and* delivering the corrected
answer in the same breath, as in this example. Responding "go ahead" to an answer that already
arrived is redundant and slightly robotic; the correction itself (a clean ownership admission
— "my teammate did X, I did Y") is real content worth probing immediately.

## Improved Prompt

```
The candidate asked to redo their previous answer. Check first: did they only ask to restart,
or did the corrected answer already arrive in the same breath?

If they only asked (no new content yet): grant the floor in one short, warm beat, no
conditions — "Of course, take your time" or "Yeah, go for it." Do not add a question this
turn; this turn is permission, not content.

If the correction already arrived: treat it as their real answer to your last question.
React to it exactly as you would any other answer — as if the correction never happened. This
is the one rule that matters most here: a redo, once given, is just an answer. If it still
leaves a real gap, probe the content using ordinary signal logic, not a "redo" framing.

Never reference the discarded first answer in any way, not even neutrally. Never say "no
problem, these things happen" — implies there was a problem. If the candidate has redone the
same answer twice already, don't grant an open floor a third time — move things forward:
"Let's go with what you've got — [next natural question]."
```

### Example

Same candidate answer as above.

Next Question Generated (improved prompt): *"Okay — the backoff timing, that's the part you
owned. What made you land on that interval instead of something more aggressive?"*

**Why it's better:** recognizes the correction already arrived and skips straight to probing
the new content (a clear ownership claim worth testing) instead of wasting a turn on "go
ahead" when the candidate already went ahead.

## Improvements Made

- Added the "did the correction already arrive" branch, which the original prompt entirely
  missed — a large share of real rephrase_request turns include the correction inline.
- Directed the model to probe corrected content with ordinary signal logic rather than getting
  stuck narrating the meta-event ("I'll score this fresh").
- Added a repeated-redo stall-prevention rule as an edge case the original had no answer for.

---

# Signal: off_topic

## What This Signal Detects
The candidate answered something adjacent to, or entirely different from, what was asked —
either a pivot to a prepared talking point, or a genuine miss caused by an ambiguous question.
Facilitation/bridging technique is explicit that the redirect should briefly name the value in
what they said before pivoting back, or the redirect reads as a discard and costs rapport for
the rest of the interview.

## Current Prompt

```
"what":          "Candidate answered a different question than what you asked.",
"goal":          "Redirect them back to your original question clearly.",
"question_type": "REDIRECT",
"principles": [
    "Name what they answered instead — 'I heard you say... but I was asking about...'",
    "Re-ask your original question, word-for-word if needed.",
    "Make it clear you value what they said, but need to stay on track.",
    "Don't make them feel bad for the pivot — it happens.",
],
"voice_note":    "Warm and direct. A real interviewer might say: 'That's interesting, but let me get back to my original question: [re-ask]'",
"skip":          "Never sound annoyed or accusatory. Never dismiss what they said. "
                 "Never ask 'why did you answer that when I asked something else' — just redirect.",
```

### Example

Q: *"Tell me about a time a deployment failed on you."*
Candidate Answer: *"I really love working with distributed systems in general — the hardest
part of my job is just keeping up with how fast the tooling changes."*

Next Question Generated (current prompt): *"That's interesting, but let me get back to my
original question: tell me about a time a deployment failed on you."*

**Problem:** the current prompt explicitly endorses "word-for-word if needed" — but if the
original question was ambiguous enough to cause the miss, repeating it verbatim reproduces the
same failure. "That's interesting" is also a generic filler the acknowledgment principle
warns against elsewhere in this same codebase (the reaction-tone system bans bland openers for
content signals but this response-level signal has no equivalent instruction).

## Improved Prompt

```
The candidate answered "{off_topic_summary}" when you asked "{original_question}". Diagnose
first: is this a pivot to an easier, prepared talking point, or a genuine miss because your
question could reasonably be misread?

Acknowledge with one specific clause naming the actual thing they said — never a generic
"that's interesting." Then redirect with a version of the question that's sharper than the
first, not identical: narrow the scope, add "specifically," or anchor to one word from their
own answer if there's a natural bridge. If you diagnosed ambiguity, tighten the wording so the
target is unmistakable this time rather than repeating it and hoping.

Never ask why they answered that instead — puts them on the defensive for no diagnostic gain.
One question, no stacking. If this is the second consecutive off-topic redirect on the same
question, don't redirect a third time — accept the closest usable answer and move the
interview forward; a third identical redirect starts to feel like an interrogation and rarely
produces new information.
```

### Example

Same as above.

Next Question Generated (improved prompt): *"Tooling churn is a real problem, for sure — but I
want one specific failure: a deployment that actually broke on you. What happened?"*

**Why it's better:** names the actual content of their answer instead of a generic filler, and
tightens the re-ask ("one specific failure," "actually broke") rather than repeating the
original sentence verbatim, directly addressing the possibility that the first phrasing was
part of what caused the miss.

## Improvements Made

- Removed "word-for-word if needed," replaced with a tightening strategy for the ambiguity
  case.
- Added a diagnosis step (pivot vs. genuine ambiguity) that changes how sharply the redirect
  lands.
- Replaced the modeled generic "that's interesting" with a requirement to name something
  specific — consistent with how the rest of the system already bans bland openers.
- Added a two-strikes cap to prevent a stuck redirect loop, an edge case the original had no
  answer for.

---

# Signal: example_evaded

## What This Signal Detects
The candidate gave a general rule or habit ("usually I...") when a real, single instance was
asked for. **Research basis: the Cognitive Interview's context-reinstatement component** —
Fisher & Geiselman's most effective single CI technique (Milne & Bull, 2002 found it
outperforms other CI components combined). A bare "give me one specific time" is a request the
candidate already sidestepped once; what actually recovers a real memory is a **retrieval
cue** — a concrete adjacent anchor (a project, a timeframe, a system) to rebuild the memory
around, not a repeat of the same open request.

## Current Prompt

```
"what":          "They gave a general rule or habit when a real story was asked for.",
"goal":          "Get one specific moment that actually happened — a real time, not a type of time.",
"question_type": "MEMORY RETRIEVAL",
"principles": [
    "FIRST PROBE: Pin it to a specific moment — 'one time', 'a specific project', 'that one instance'.",
    "Name something they said and ask when that actually happened.",
    "Invite imperfection — real memories have friction. Ask what went wrong or surprised them.",
    "Make it impossible to answer with 'usually' again — force a time and place.",
    "ESCALATION (if fired 2+ times): Pivot from 'one specific time' to different angles:",
    "  - Ask about a DECISION they made (not a story)",
    "  - Ask about a TOOL or TECHNOLOGY they used",
    "  - Ask about a CONSTRAINT they hit (budget, time, resources)",
    "  - Ask 'what would you do DIFFERENTLY if you rebuilt it?' (reflection, not memory)",
],
"voice_note":    "Sound curious, not accusatory. ...",
"skip":          "Never ask 'can you give me an example' — too easy to dodge again with another pattern. ...",
```

### Example

Q: *"Tell me about a time your model gave wrong results."*
Candidate Answer: *"Usually I check the training data first and retrain."*

Next Question Generated (current prompt): *"Okay, in general terms — can you give me one
specific time that happened, not generally, one real instance?"*

**Problem:** this is functionally the same request reworded — "give me one specific time" is
exactly the sentence shape the candidate already sidestepped. There's no retrieval cue, nothing
concrete to anchor a memory to — it just repeats the demand with more emphasis.

## Improved Prompt

```
The candidate answered with a general habit ("usually / normally / I always...") instead of a
real instance. Do not repeat the "give me one specific time" request in any form — that
sentence shape already failed once.

Instead, give them a retrieval cue: anchor to a concrete, adjacent thing they already implied
exists — a project name, a recent timeframe, a system, a team — and ask what happened INSIDE
that anchor. If nothing concrete was mentioned yet, manufacture the smallest possible anchor
from the topic itself ("the last model you shipped," "the most recent one before this"), never
an abstract "a time."

If this is the first probe on this topic: anchor to time or place ("think about the last
[thing] you actually [did] — what's the first [specific detail] you remember?").

If this signal has already fired once or more on this topic, switch retrieval channel entirely
rather than repeating a time/place anchor — Fisher & Geiselman's finding is that varying the
retrieval route recovers memory a single repeated cue can't:
- Ask about one DECISION they made, not a story.
- Ask about a specific TOOL or TECHNOLOGY and what they did with it.
- Ask about a CONSTRAINT they hit (budget, time, resource).
- Ask what they'd do DIFFERENTLY if they rebuilt it now (reflection, not memory retrieval).

This 4-channel ladder is a per-topic escalation, separate from and in addition to the global
`RECENT_QUESTION_PATTERNS` check — even the first time this signal fires on a fresh topic, the
chosen anchor's phrasing must not collide with a scaffold used earlier in the interview for a
*different* signal. A time/place anchor phrased as "think about the last X you shipped" cannot
repeat if that exact construction already appeared two topics ago under a different signal.

CRITICAL — check DECLINED_FACTS before choosing an angle, not just RECENT_QUESTION_PATTERNS:
if the candidate has already explicitly been unable to produce a specific number, name, or
value related to this topic (logged in DECLINED_FACTS), do not construct ANY question — in ANY
of the four channels above — that targets that same fact again. This applies even if a
different, successful angle was used in between. Retirement of a declined fact is permanent for
the rest of the interview, not a one-turn cooldown. Concretely: if "the exact weight increment"
is in DECLINED_FACTS, a DECISION-channel question ("what made you decide to increase it") is
fine, but a question that still resolves to "...and how much was that increase" is not — check
what the question is actually trying to extract, not just which of the four channels it's
filed under. A decision-shaped question that smuggles the declined number back in as its real
target is the same violation as asking for the number directly.

One question. Curious tone, not accusatory — you want the story, not to catch them out. Never
say "can you give me an example," it invites the same generic pattern again.
```

**Why this matters in practice:** a real transcript run of this exact signal showed the model
correctly pivoting to a CONSTRAINT-channel question after a declined numeric value, getting a
solid answer — then, two turns later, reverting to a differently-worded but semantically
identical request for the same number ("what specific values or range did you end up testing"),
which was declined again, followed by yet another pivot and yet another reversion asking for
"that specific amount." The four-channel ladder was being followed on individual turns but had
no memory that the numeric target itself was permanently closed — which is exactly what the
DECLINED_FACTS check above is designed to prevent going forward.

### Example

Same candidate answer as above.

Next Question Generated (improved prompt): *"Think about the last model you actually shipped —
what's the first wrong output you personally remember seeing come back?"*

**Why it's better:** "the last model you shipped" is a concrete anchor (context reinstatement);
"first wrong output you remember seeing" asks for a temporal/sensory retrieval cue instead of
restating "give me an example" — structurally a different request, not a louder version of the
same one.

## Improvements Made

- Replaced the repeated "one specific time" framing with an explicit context-reinstatement
  instruction — anchor to a concrete adjacent noun instead of re-asking for specificity in the
  abstract.
- Kept the existing escalation ladder (decision/tool/constraint/reflection) but grounded it
  explicitly in the CI finding that varying retrieval *channel*, not just re-emphasizing the
  same request, is what recovers memory after a first miss.
- Prevents the "louder version of the same question" failure mode visible in the current
  prompt's own generated example.

---

# Signal: depth_ceiling_hit

## What This Signal Detects
The candidate tried to answer and visibly ran out of knowledge. **Research basis: Cognitive
Interview's principle that once a retrieval route is exhausted, re-cueing the same route
increases confabulation risk rather than recovering more truth.** The correct move is to
shrink the retrieval domain to something small enough that even shallow exposure has an honest
answer — not to re-open the same broad domain with softer wording.

## Current Prompt

```
"what":          "They tried to answer but hit the edge of their knowledge and ran out.",
"goal":          "Find the floor — the smallest, most concrete thing they DO know on this topic.",
"question_type": "FLOOR FINDER",
"principles": [
    "Don't push on the exact thing they ran out on — there's nothing there.",
    "Narrow down to the smallest adjacent thing they might have touched.",
    "Give them an easy entry: 'even the smallest step you ran yourself is fine'.",
    "Accept the limit gracefully — don't make them feel punished for not knowing.",
],
"voice_note":    "Warm and low-pressure. A real interviewer might say: 'No worries — what part of this did you actually get your hands on, even briefly?'",
"skip":          "Never re-ask the same question at a different angle — they have nothing more there. ...",
```

### Example

Candidate Answer: *"I've used FAISS but I don't really have a lot of idea about how the
indexing actually works."*

Next Question Generated (current prompt): *"No worries — what part of this did you actually
get your hands on, even briefly?"*

**Problem:** "this" is undefined and still points at the same broad domain (FAISS/indexing)
the candidate just ran dry on, just phrased more gently. It's still an open recall request over
an exhausted domain, not a narrowed one — exactly what CI research warns against.

## Improved Prompt

```
The candidate attempted an answer and ran out — this is depth_ceiling_hit, not a denial.
Never re-open the domain they ran out on ("how it works," "indexing," "the architecture") even
with softer wording — there's nothing more there and re-asking risks confabulation, not truth.

Instead, name ONE concrete sub-action inside that domain — not the domain itself — and ask a
near-yes/no question about it, so they have something small to confirm or deny rather than
having to generate content from an empty domain again. Collapse a mechanism question ("how
does indexing work") down to an action question ("did you write the query code, or was that
someone else's"). The smaller the unit, the more likely there's a real memory attached.

If even the small action question comes up empty, accept the limit cleanly and move on — do
not narrow a second time on the same topic; a real floor has been found. Warm, low-pressure
tone throughout — a knowledge gap here is normal and should never feel like a test they're
failing.
```

### Example

Same candidate answer as above.

Next Question Generated (improved prompt): *"Fair enough — forget how it works under the hood.
Did you write the code that actually queried FAISS, or was that someone else's part?"*

**Why it's better:** collapses "indexing" (mechanism, likely genuinely unknown) down to a
single action ("did you write the query code") small enough that even shallow exposure has an
honest answer — and the answer itself is diagnostic either way: a real "yes" opens a next
thread, a "no" cleanly closes the topic without further probing.

## Improvements Made

- Replaced the open "what part did you touch" with an instruction to narrow to a single
  yes/no-scale action inside the exhausted domain, grounded explicitly in why re-cueing the
  same domain risks confabulation.
- Added an explicit stop condition: if the narrowed question also comes up empty, accept the
  floor and move on rather than narrowing again — prevents the model from turning "floor
  finding" into a second interrogation.

---

# Signal: ownership_ambiguous

## What This Signal Detects
"We/team/they" throughout, with no "I did / I decided / I built" anywhere — personal
contribution is invisible. **Research basis: BEI's "I vs we" rule plus coworker
triangulation** — MIT's own STAR guidance flags "we" language as making it impossible to see
the candidate's actual skill, and BEI training's standard fix for a candidate who keeps
self-flattening into "we" is to ask what a knowledgeable coworker would say was specifically
theirs — a perspective-shift technique that routes around self-effacement without re-asking
"what was your role," which the candidate has effectively already declined to answer once.

## Current Prompt

```
"what":          "'We/team/they' throughout — their personal contribution is invisible.",
"goal":          "Isolate the ONE thing that was specifically theirs — their action, decision, or output.",
"question_type": "PERSONAL ISOLATION",
"principles": [
    "Pick one specific thing they mentioned and ask what THEIR part in that was.",
    "Frame it so 'we' is not a valid answer — ask for their specific action or output.",
    "Tie the question to the topic and context, not a generic 'what did you do'.",
    "If they mentioned a deliverable, ask what they personally contributed to it.",
    "VARY the angle each time this fires — never fall back to the same canned line. Rotate between: ...",
],
"voice_note":    "Direct but not aggressive. ...",
"skip":          "Never ask 'what was your role' ... never repeat the exact same probe wording twice ...",
```

### Example

Candidate Answer: *"We built the retrieval pipeline, the team set up the vector store, they
handled the deployment."*

Next Question Generated (current prompt): *"Out of everything you described, which piece did
you personally drive end to end?"*

**Problem:** this is a reasonable question, but it's the first option in the rotation list the
prompt itself defines — models default to it, and across a transcript it becomes exactly the
"canned line" the prompt warns against. The rotation set also has no coworker-perspective
option at all, which is the single most effective technique in the applicable BEI literature
for this exact pattern.

## Improved Prompt

```
The candidate described real work almost entirely in "we/team/they" — no personal action verb
anywhere. Pick one specific thing they mentioned (a deliverable, a decision, a system) and
isolate their part in it.

The fixed constraint (the research-backed part): the question must make "we" structurally
unusable as an answer — it has to force a singular, specific, personal reference. How you
achieve that is not fixed. A few proven angles, to draw from rather than cycle through as a
numbered list:
- naming a specific piece they described and asking what they personally did on it
- asking which decision in the process was theirs alone to make
- asking what they'd have done differently if they'd been completely alone on it
- asking what part they could rebuild from scratch without the team
- coworker triangulation: asking what a teammate from that project would say was specifically
  theirs, if asked to point at their contribution — this works because it asks the candidate to
  imagine an external, specific witness rather than self-report again, which tends to loosen
  self-effacing "we" framing more than a direct re-ask does

Construct the actual question fresh, grounded in the specific thing they described, rather than
picking a pre-written sentence from this list. If none of the listed angles fit what they
actually said, invent a different one that still forces a singular personal reference — the
list exists to seed the mechanism, not to cap it.

Never ask "what was your role" verbatim — that produced this signal in the first place. Never
ask about the team again. Before finalizing, confirm the construction doesn't match a scaffold
already used earlier in the interview by ANY signal, not just a previous ownership_ambiguous
fire — a "what did you personally do on X" construction can collide in surface form with a
"what's the first thing you did with X" construction from tool_named_not_used, and that counts
as a repeat too. Direct tone, not aggressive; this is a common pattern, not an accusation.
```

### Example

Candidate Answer: *"We built the retrieval pipeline, the team set up the vector store, they
handled the deployment."*

Next Question Generated (first occurrence): *"If I asked one of your teammates from that
project 'what did they actually build,' pointing at you — what would they say?"*

Second occurrence, later in the interview, different team-heavy answer about a hiring process —
Next Question Generated: *"Out of that whole process, which single decision would have gone
differently if you'd run it completely solo?"*

Neither sentence was copied from the seed list verbatim — both were constructed around the
specific thing each candidate described (a codebase vs. a hiring process), and the second
deliberately avoids the coworker-triangulation shape used in the first even though both are
plausible fits, because that shape was already used.

**Why this is better than a fixed 5-angle rotation:** the mechanism that actually matters (force
a singular personal reference, "we" becomes structurally unusable) is preserved and is the part
with real grounding in BEI methodology; the specific sentence is built fresh around what the
candidate actually said rather than reused from a pre-written set, and there's no ceiling to
run out of if this signal fires many times across a long interview.

## Improvements Made

- Converted the 5-item rotation list into seed dimensions with explicit permission (and
  expectation) to construct a new angle outside the list once the obvious ones stop fitting.
- Made the actual fixed constraint explicit and singular ("force a personal reference, make 'we'
  unusable") instead of leaving the model to infer the underlying goal from five disconnected
  examples.
- Extended the collision check to cross-signal scaffolds explicitly (a construction from this
  signal can collide with one from `tool_named_not_used` or any other signal), not just prior
  fires of ownership_ambiguous itself.
- Kept the coworker-triangulation technique as a named, explained option (its mechanism — an
  imagined external witness — is worth preserving even in a generative frame, since it's not
  obvious and a model wouldn't reliably invent it unprompted).

---

# Signal: explanation_shallow

## What This Signal Detects
Strong personal ownership claimed ("I built it all," "I'm really strong at X"), but the
explanation reads like an outsider's — no internals, no decisions, no friction.
**Research basis: the Feynman Technique / self-explanation literature, run in reverse.**
Self-explanation forces connection of steps and causes — jargon substitution collapses under a
"which means…" or "explain it to a beginner" constraint, because there's no way to fake
simplification without real understanding underneath. The second-highest-signal probe from the
same literature is the failure-case prompt ("when does this break") — real understanding
includes edge cases; people without it can't generate one on demand.

## Current Prompt

```
"what":          "Candidate claimed strong personal ownership or ability but the explanation is hollow — describes it like an outsider would.",
"goal":          "Get them inside the thing they claimed — one real decision they made, one constraint they hit, one thing that was hard.",
"question_type": "TEACH-BACK / OPEN THE BOX",
"principles": [
    "Ask them to go inside the thing they claimed — a real builder can describe the internals.",
    "Ask about something that would only exist if they actually did it: a decision point, a tradeoff, something that didn't work at first.",
    "A teach-back works well: ask how they'd explain this to someone new — real understanding shows in simplification.",
    "Tie the question directly to their specific claim — not a generic 'how did it work'.",
],
"voice_note":    "Curious and open. ...",
"skip":          "Never ask 'what did you build' or 'what was your role' ... don't ask them to claim it again — ask them to prove it.",
```

### Example

Candidate Answer: *"Entire functionality is completely built by me. It's a RAG-based system."*

Next Question Generated (current prompt): *"You said you built the whole thing — what was the
trickiest part to get right?"*

**Problem:** "trickiest part" is answerable with a vague, still-jargon-heavy non-answer
("getting the retrieval accuracy right") that sounds specific but proves nothing — it doesn't
force the no-jargon constraint the Feynman research identifies as the actual mechanism that
makes memorized labels collapse.

## Improved Prompt

```
The candidate made a strong personal-ownership claim ("I built the whole thing," "I'm really
strong at X") and then explained it like an outsider would — no internals, no friction, no
decision points. The gap is depth of understanding, not ownership; don't ask them to claim it
again, ask them to prove it.

Prefer the no-jargon teach-back over an open "what was the trickiest part" question — "trickiest
part" invites a rehearsed, still-jargon-laden non-answer, whereas removing jargon structurally
blocks hiding behind terminology: real understanding survives simplification, memorized labels
don't. Ask them to explain the specific thing they claimed to someone who's never touched it,
with no jargon allowed.

If this signal has already fired once on this topic (they've already been asked to explain
something once), pivot to the failure-case variant instead of a second teach-back: ask when it
breaks, or what case it gets wrong. A confident claim with no failure case behind it is itself
diagnostic — a real builder has hit at least one.

Tie the question directly to their specific claim, never a generic "how did it work." One
question. Curious and open tone, not skeptical — you're testing depth, not accusing them of
lying.
```

### Example

Same candidate answer as above.

Next Question Generated (improved prompt): *"If you had to explain how the retrieval actually
decides what's relevant to someone who's never touched RAG — no jargon at all — what would you
say?"*

**Why it's better:** "no jargon at all" is load-bearing — it's the exact mechanism the
Feynman/self-explanation research identifies as forcing understanding gaps to surface, whereas
"trickiest part" invites a rehearsed answer that can still hide behind terminology.

## Improvements Made

- Reordered the probe priority to lead with the no-jargon teach-back rather than the open
  "trickiest part" question, and explained the specific mechanism (jargon-as-cover removal)
  that makes it work.
- Added the failure-case variant as an explicit second-line probe for repeat fires on the same
  topic, rather than repeating a teach-back the candidate has already partially completed.
- Kept the existing "prove it, don't re-ask ownership" framing, which was already correctly
  aligned with the research and didn't need changing.

---

# Signal: tool_named_not_used

## What This Signal Detects
A specific tool, method, or framework is named, then defined or listed — with zero evidence of
actually using it. **Research basis: BEI's operational-verb requirement.** BEI methodology
scores competency evidence by looking for a completed action verb tied to a first-person
subject ("I stored," "I ran," "I configured") — not a noun. The gap here isn't depth of
understanding (that's `explanation_shallow`); it's the total absence of a verb, and the fix is
a question shaped to make an operational verb almost unavoidable in the answer.

## Current Prompt

```
"what":          "A specific tool, method, or framework was named — then defined or abandoned. No evidence of using it.",
"goal":          "Get ONE concrete memory of operating it — something only someone who actually used it would know.",
"question_type": "HANDS-ON VERIFICATION",
"principles": [
    "Pick the ONE most central tool they named and go deep on only that one.",
    "Ask what they did WITH it — a step they ran, something they built, a problem it caused.",
    "Ask something that requires hands-on knowledge to answer — a real user has at least one specific memory.",
    "If they named multiple tools, pick the one most relevant to the topic and anchor on that.",
],
"voice_note":    "Specific and grounded. ...",
"skip":          "Never ask what the tool IS ... never ask about all named tools at once ... never ask why they chose it — that is a different signal.",
```

### Example

Candidate Answer: *"Vector database — ChromaDB, FAISS, Pinecone."*

Next Question Generated (current prompt): *"You mentioned ChromaDB — what did you actually do
with it in the project?"*

**Problem:** "what did you do with it" is broad enough to answer with another noun-heavy
non-answer ("it was our storage layer for embeddings") without ever supplying a first-person
verb — it doesn't structurally force the operational evidence BEI methodology looks for.

## Improved Prompt

```
The candidate named a specific tool or method with no evidence of using it — a noun, not a
verb. Pick the ONE most central tool relevant to the topic; ignore the others even if several
were named.

Ask for the single smallest verb-bearing action directly: the first command they ran, the
first line of code they wrote, the specific setting they touched, or the exact error message
they hit — not "what did you do with it," which is broad enough to answer with a role
description instead of an action. A real user can name a specific command, API call, config
value, or error; someone who only saw the name in a document cannot generate one of these on
demand.

Never ask what the tool is — invites another definition. Never ask why they chose it — that's
tech_choice_unjustified, a different signal, and jumping there skips past confirming they used
it at all. One question, one tool.
```

### Example

Same candidate answer as above.

Next Question Generated (improved prompt): *"ChromaDB — what's the first command or line of
code you actually wrote to get something into it?"*

**Why it's better:** "first command or line of code" cannot be satisfied with a description of
ChromaDB's role in the architecture — it demands a first-person operational verb, and its
absence (a stumble, a vague non-answer) is itself clean evidence the tool was named, not used.

## Improvements Made

- Replaced "what did you do with it" with a direct request for the smallest verb-bearing
  action, closing the loophole that let candidates answer with a role/noun description instead
  of an operational memory.
- Kept the existing "one tool only" and "never ask why" constraints, which were already
  correctly targeted — the fix here was narrowly the probe shape, not the surrounding rules.

---

# Signal: tech_choice_unjustified

## What This Signal Detects
Real usage is shown — they operated the tool, built with it, ran it — but they never explained
*why that one* over alternatives. **Research basis: Why-How Laddering (Means-End Theory).**
Laddering's core finding is that an open "why did you choose X" mostly surfaces a post-hoc
rationalization, since most people haven't consciously examined their own choice — naming a
concrete, plausible alternative and asking "why this over that" is what forces real reasoning
to the surface instead of a rehearsed line.

## Current Prompt

```
"what":          "They clearly used the tool/method (real usage shown) but never explained WHY that one over alternatives.",
"goal":          "Surface the decision behind the choice — was it deliberate, a default, or someone else's call?",
"question_type": "COMPARATIVE RATIONALE",
"principles": [
    "Name a real alternative to what they used and ask why they chose theirs over that one.",
    "Push for the deciding factor — what specifically made them pick this over the obvious other option.",
    "If it might not have been their decision, ask who made the call and what the reason was.",
    "Make the comparison concrete — 'why X instead of Y' is far sharper than 'why X'.",
],
"voice_note":    "Genuinely curious. ...",
"skip":          "Never ask what the tool does ... always name a specific real alternative — an open 'why did you choose it' is too easy to deflect.",
```

### Example

Candidate Answer: *"I stored the embeddings in ChromaDB and queried them through LangChain. It
worked fine."*

Next Question Generated (current prompt): *"You went with ChromaDB — why that one over
FAISS?"*

**Problem:** this one is already reasonably well-aligned with laddering research — the failure
mode in practice is usually that the named alternative isn't actually plausible for the
candidate's stack (e.g. naming a managed-cloud-only product against a local Python pipeline),
or that the model asks an open "why did you choose it" instead when no obvious alternative
comes to mind, and the current prompt gives no fallback for the (common) case where the answer
reveals the choice wasn't theirs at all.

## Improved Prompt

```
The candidate showed real usage of a tool or method but never explained why that one over
alternatives. Name a concrete alternative that is plausible specifically for their stack and
context — not a generic industry-standard name. FAISS is a real alternative to ChromaDB for a
self-hosted Python pipeline; it is not a real alternative if their stack is entirely
managed-cloud. Get this right or the comparison won't land.

Ask "why this over [alternative]" directly — never an open "why did you choose it," which is
easy to answer with a rehearsed line instead of the real reasoning.

Bake in the laddering fallback in the same question rather than requiring a second turn: also
ask whether it was their call or something inherited/defaulted-to. If the choice turns out not
to have been theirs, that's useful information on its own — you don't need a follow-up turn to
discover it, the question already asked for it.

One question. Genuinely curious tone — you're testing judgment, not catching them in a
mistake; "it worked fine" is a completely reasonable starting answer, you're looking for
whether there's a real deciding factor underneath it.
```

### Example

Same candidate answer as above.

Next Question Generated (improved prompt): *"You went with ChromaDB over something like FAISS
or Pinecone — what tipped it, and was that your call or something you inherited?"*

**Why it's better:** bakes the ladder-up fallback ("was that your call?") into the same
question instead of requiring a full extra turn to discover the choice wasn't theirs — more
efficient, and closer to how a real technical interviewer actually asks this in one breath.

## Improvements Made

- Added an explicit requirement that the named alternative be stack-plausible, not generic —
  the single most common way this probe misfires in practice.
- Folded the "was it your call?" laddering fallback into the same question rather than treating
  it as a separate follow-up, saving a turn and surfacing team-default answers immediately.
- Kept the existing "never ask what the tool does" and "always name a real alternative"
  constraints, which were already correctly aligned with the research.

---

# Signal: scenario_untested

## What This Signal Detects
A correct, complete, textbook-accurate process description — but frictionless, with no lived
edge case or failure. **Research basis: SPIN Selling's Implication questions** (Rackham,
35,000-call study). Situation/Problem-level questions ("how does X work") are cheap — anyone
can answer them from documentation. The technique top performers use four times more than
average performers is the consequence question: given a correct description of how something
normally works, ask what happens *when it breaks* — mechanism is recitable, consequence isn't.

## Current Prompt

```
"what":          "Gave a correct textbook description — accurate but frictionless, no lived edge case or failure.",
"goal":          "Stress-test whether the knowledge is real by presenting a scenario only a practitioner could handle.",
"question_type": "SCENARIO STRESS-TEST",
"principles": [
    "Present a realistic failure or edge case grounded in what they described.",
    "Ask what they'd do or check first — not to explain the concept again, but to solve a real problem.",
    "Pick something from their answer that could go wrong and ask what happens when it does.",
    "A good scenario question is one that textbook knowledge alone cannot answer correctly.",
],
"voice_note":    "Conversational and real-world. ...",
"skip":          "Never ask them to repeat or expand the flow ... the scenario must connect to what they specifically described, not a generic hypothetical.",
```

### Example

Candidate Answer: *"Embedding goes into chunks, chunks become vectors, vectors go into the
store, similarity search retrieves top results."*

Next Question Generated (current prompt): *"Say your similarity search started returning
irrelevant results — what would you check first?"*

**Problem:** this is a reasonable implication-style question already, but it's the single most
common canned failure scenario for RAG systems — answerable from a blog post as easily as from
real experience, and it invites a checklist recitation ("I'd check embedding model, chunk size,
index config...") rather than a genuine debugging memory.

## Improved Prompt

```
The candidate gave a correct but frictionless textbook description with no lived edge case.
Build a failure scenario out of a specific noun they themselves used (their "chunks," their
"similarity search") rather than a generic category failure — the more specific the injected
failure, the harder it is to answer from memorized best-practice content instead of lived
debugging experience.

The scenario must be a CONSEQUENCE question (SPIN-style: what happens when it breaks), never a
MECHANISM question (how does it work) — that is the one fixed constraint, because it's the
part backed by the research: consequence questions can't be answered from documentation,
mechanism questions can. Everything else about the scenario's construction is yours to invent
for each case, not chosen from a fixed set.

To build one, freely combine or draw from dimensions like these — treat them as ingredients,
not a numbered menu, and feel free to construct a scenario that uses none of them if something
more specific to the candidate's actual answer occurs to you:
- what changed over time (it worked before, doesn't now, with or without an obvious cause)
- what changed in scale or load
- how the problem is reported (a first-person observation vs. someone else describing a vague
  symptom secondhand)
- whether the failure is loud (an error, a crash) or silent (still running, quietly wrong)
- what happens when the obvious first fix is unavailable

Construct the actual sentence fresh each time, grounded in the candidate's specific noun and
whatever dimension fits what they described best. Before finalizing, check the scaffold against
RECENT_QUESTION_PATTERNS — if your instinct produces something close to a scaffold already used
this interview (by this signal or any other), that is a signal to invent a different
construction, not to reach for a substitute from a fixed list.

Ask what they'd check or do FIRST, not a general "how would you handle this" — first-check
ordering reveals real triage instinct, a full checklist doesn't. One question, conversational
and real-world in tone.
```

### Example

Same candidate answer as before, shown at two different points in the interview to demonstrate
generative variety rather than menu-cycling.

First occurrence (candidate described a RAG chunking/retrieval flow) — Next Question Generated:
*"Say your chunking was working fine last week and today the same query pulls back garbage —
nothing else changed. Where do you start looking?"*

Second occurrence, later in the same interview, unrelated topic (candidate gave a correct,
frictionless description of their sales qualification process) — Next Question Generated:
*"One of your reps pings you: 'this lead looked qualified on paper but ghosted right after
discovery' — with just that, no other context, what's your first question back to them?"*

Neither of these was pulled from a fixed list — the first composed the "changed over time" and
"loud failure" ingredients around the candidate's own word "chunking"; the second composed
"secondhand report" and "silent-ish, ambiguous symptom" around the candidate's own word "lead."
A third occurrence later in the interview would need to produce something that resembles
neither construction, which the model can do indefinitely because it's generating from
principles and a live collision check, not selecting from an exhaustible set.

**Why this is better than a fixed 5-item menu:** the underlying evidence goal (consequence, not
mechanism) is what the research actually requires and stays non-negotiable; the surface
construction is unbounded and tailored to what the specific candidate said, which produces
better-fitted questions than any of a handful of pre-written framings could, and it doesn't run
out — a candidate who triggers this signal on every topic in a long interview never forces the
model into "combine two templates" patchwork, because there was never a ceiling to hit.

## Improvements Made

- Replaced the fixed 5-item scenario menu with a small set of composable dimensions and an
  explicit instruction that the model should invent a construction outside them once it has a
  feel for what's needed — the list is an ingredients cabinet, not a numbered choice.
- Removed the "combine two templates once you run out" fallback entirely — it's unnecessary
  once construction is generative; there's no ceiling to run into.
- Kept the one genuinely research-backed constraint (consequence question, not mechanism
  question) as the sole fixed rule, since that's the part with actual evidentiary grounding —
  everything downstream of it is style, and style should be generated fresh, not scripted.
- Kept "reuse the candidate's own noun" and "ask what they'd check first" as fixed constraints,
  since those were already correctly targeted.

---

## Summary — concrete edits to make in `probe_strategy.py`

| Signal | Core change |
|---|---|
| `denial_with_continuation` | Add sufficiency check before probing; replace generic "walk me through it" with three targeted probe shapes. |
| `clarification_request` | Resolve a self-identified fork directly; diagnose cause (jargon/reference/compound/abstraction) before rephrasing. |
| `rephrase_request` | Branch on whether the correction already arrived; probe corrected content with ordinary signal logic instead of a "redo" framing. |
| `off_topic` | Diagnose pivot vs. ambiguity; require a specific (not generic) acknowledgment; cap redirects at two. |
| `example_evaded` | Replace "one specific time" re-ask with a context-reinstatement anchor; keep escalation ladder but ground it in varied retrieval channels. |
| `depth_ceiling_hit` | Narrow to a single yes/no-scale action inside the exhausted domain instead of re-opening it with softer wording. |
| `ownership_ambiguous` | Add BEI coworker-triangulation as a fifth rotation angle; make angle-tracking mechanical, not a soft suggestion. |
| `explanation_shallow` | Lead with no-jargon teach-back over "trickiest part"; use failure-case variant on repeat fires. |
| `tool_named_not_used` | Replace "what did you do with it" with a direct request for the first command/line/setting — forces a verb, not a role description. |
| `tech_choice_unjustified` | Require the named alternative to be stack-plausible; fold the "was it your call?" laddering fallback into the same question. |
| `scenario_untested` | Require the injected failure to reuse the candidate's own nouns and be framed as a time-boxed change to block checklist answers. |

All of these are drop-in replacements for the corresponding `SIGNAL_PROBES[signal]` entries —
no change to the `agent_scoring.py` gate logic is needed, since detection is already sound;
only the framing instructions handed to the question-generation LLM needed to be sharpened.