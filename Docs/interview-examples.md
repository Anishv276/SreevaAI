# Interview — Real Examples

**Candidate:** Priya Sharma | **Role:** Backend Engineer | **Band:** mid  
**Topics:** Paytm Backend Developer (anchor) → Redis Caching Layer → PostgreSQL → System Design  
**Custom Q:** "Ask about microservices at scale"

Every line shows exactly what happened, what function ran, and what signal or decision came out.

---

## Turn 1 — Greeting (0:00)

```
Ishita: "Hi Priya, I'm Ishita. How are you doing?"
```

`session.say()` → Cartesia TTS → audio plays                               `(build_greeting_text)`  
No LLM involved. Scripted. `allow_interruptions=False`                     `(InterviewAgent.tts_node)`  
`greeting_delivered_at` set → STT unblocked                               `(entrypoint)`  
`[PHASE_STATUS]` injected: "GREETING DONE. CURRENT PHASE: WARMUP"         `(entrypoint)`  
LLM gate closed → waiting for Priya to speak                              `(agent._waiting_for_eval=True)`

---

## Turn 2 — Warmup (0:08)

```
Priya: "I'm doing good thanks! Yeah ready to go."
```

Deepgram Flux EOT confidence 0.82 → turn committed                        `(STT_MODEL flux-general-en)`  
`_clean_stt_text()` → warmup flag set, noise filters SKIPPED               `(_clean_stt_text)`  
`_candidate_meta_intent()` → None (no meta pattern matched)               `(_candidate_meta_intent)`  
Readiness check: "ready" found in markers list → `completing_warmup=True`  `(_handle_completed_user_turn)`  
Warmup placeholder recorded:                                              `(_process_user_conversation_item)`

```
answer_scores.append({
  "question": "How are you doing?",
  "answer": "I'm doing good thanks! Yeah ready to go.",
  "clarity": 0, "depth": 0, "overall": 0.0,
  "is_warmup": True
})
```

`warmup_complete = True`                                                   `(_handle_completed_user_turn)`  
`[WARMUP PHASE]` stripped from chat_ctx                                    `(remove_system_messages)`  
First interview question directive injected:                              `(entrypoint)`

```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: FIRST_QUESTION
ANCHOR TOPIC: Paytm Backend Developer
FULL CONTEXT: Paytm Backend Developer - Built REST APIs for payments module [Node.js, PostgreSQL, REST APIs]
Ask your first interview question about Paytm Backend Developer.
ONE question only. Sound natural — not reading a script.
```

LLM gate released → Ishita generates first question                       `(agent._directive_ready.set())`

---

## Turn 3 — First Interview Question (0:15)

```
Ishita: "Alright, let's get into it — you built the payments API at Paytm.
         What were the main decisions you personally made on the API design?"
```

`conversation_item_added` fires (role=assistant)                           `(on_conversation_item_added)`  
`polish_candidate_facing_text()` strips directive markers                  `(polish_candidate_facing_text)`  
`_last_interviewer_question` = "What were the main decisions you personally made on the API design?"

TOPIC_GUARD check:                                                        `(on_conversation_item_added)`
```
_expected_tokens = {"paytm", "backend", "developer"}
"paytm" found in question → _topic_confirmed = True
_last_question_topic = "Paytm Backend Developer"
```

`_first_interview_question_asked = True`                                   `(on_conversation_item_added)`  
`[PHASE_STATUS]` updated: "OPENING QUESTION DONE. Don't repeat it."       `(on_conversation_item_added)`  
LLM gate pre-closed → waiting for Priya                                   `(agent._waiting_for_eval=True)`  
Inactivity clock started (10s window)                                     `(reset_inactivity_clock)`

---

## Turn 4 — Vague Team Answer → `ownership_ambiguous` (0:35)

```
Priya: "So we built a REST API for the payments module. The team decided to
        normalize the tables in PostgreSQL. We handled auth with JWT middleware,
        the whole team worked on it together."
```

STT: 35 words, 28 unique → diversity 80% → passes noise filter             `(_clean_stt_text)`  
Meta-intent: None                                                         `(_candidate_meta_intent)`  
`_can_eval_turn = True` (warmup done, turn>2, question exists)             `(_process_user_conversation_item)`  
`_current_topic_answers.append("So we built a REST API...")`              `(_process_user_conversation_item)`  
Transcript partial save background task fires                             `(persist_transcript partial=True)`

**Eval payload built:**                                                   `(_build_eval_payload)`
```
active_topic       = "Paytm Backend Developer"
topic_tag          = "RESUME_TOPIC"
topic_importance   = "CRITICAL"   ← anchor topic
band               = "mid"
topic_follow_ups   = 0            ← first turn on this topic
probe_focus        = ["ownership", "schema decisions", "API design tradeoffs"]
```

**`evaluate_answer()` called** (gpt-4.1-nano, temp=0):                    `(evaluate_answer)`

LLM receives:
```
Topic: Paytm Backend Developer | Tag: RESUME_TOPIC | Importance: CRITICAL
QUESTION: What were the main decisions you personally made on the API design?
ANSWER: So we built a REST API... the team decided... we handled auth... whole team worked on it...
FOLLOW-UPS: 0
```

LLM returns:
```json
{
  "clarity": 5.5, "depth": 3.8, "specificity": 3.2, "grounding": 4.0,
  "action": "PROBE",
  "signal": "ownership_ambiguous",
  "signal_reason": "we built, the team decided, whole team worked on it",
  "reason": "no personal contribution named"
}
```

`signal_reason` = exact quote from Priya's words, not a summary           `(evaluate_answer)`

**Weighted score:**                                                       `(eval_pipeline._weighted_score)`
```
5.5×0.20 + 3.8×0.35 + 3.2×0.30 + 4.0×0.15 = 3.99
```

**TopicState created** (first turn):                                       `(TopicState.__init__)`
```
importance         = "CRITICAL"  (is_anchor=True → TopicImportanceClassifier)
saturation_threshold = 7.0       (mid × CRITICAL)
base_turn_credit   = 0.8
dry_topic_cap      = 2
```

**Saturation contribution:**                                              `(TopicState.add_contribution)`
```
signal_modifier    = -0.30   (ownership_ambiguous penalty)
raw_contribution   = max(0, (3.99-2.0)/8.0×3.5) = 0.87
adjusted           = 0.87 - 0.30 = 0.57
effective_base     = 0.8    (contribution > 0)
saturation_score  += 0.8 + 0.57 = 1.37
follow_up_turns    = 1
is_saturated       = 1.37 >= 7.0 → False
consecutive_low_yield = 0   (3.99 > 1.0)
```

**Agent decision:**                                                       `(_process_user_conversation_item)`
```
_is_saturated = False
_weak_exit    = False   (only 1 turn, < progress_check_turns=3)
_dry_topic    = False
eval_action   = "PROBE"
→ _action = "PROBE"
```

**`_generate_probe_directive()` called:**                                  `(_generate_probe_directive)`

`get_probe_context()` builds:                                             `(get_probe_context)`
```
SIGNAL: ownership_ambiguous
WHAT: Candidate used 'we/team/they' without saying what THEY specifically did.
TRIGGER: "we built, the team decided, whole team worked on it"
GOAL: Find the one thing that was specifically theirs — their action, decision, or deliverable.
ASK:
  - Anchor to something concrete they mentioned and ask what THEIR part in it was.
  - Make it impossible to answer with 'we' — ask for their specific action or output.
  - Ask what would have been different if they hadn't been on this.
SKIP: Do not ask 'what was your role' — that got you here. Do not ask about the team.
NOTE: First probe on this topic. Pull the most interesting thing from their answer.
```

Probe LLM (gpt-4.1-mini, temp=0.3) generates directive:

```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: PROBE (OWNERSHIP_AMBIGUOUS)
WHAT THE CANDIDATE REVEALED: Said "we built", "the team decided", "whole team worked" —
  never once named a specific thing they personally designed, wrote, or output.
ANGLE TO PURSUE: They mentioned "JWT middleware" — that's the one thing with a hint of
  individual ownership. Push on what they specifically wrote in it, step by step.
INTENT: Find if they actually wrote the middleware or just know it existed. Someone who
  built it can walk through request → decode → validate → attach. Someone who didn't can only say it validates tokens.
FORBIDDEN: Do not ask "what was your role?" again. Do not ask about PostgreSQL schema (team-decided, already noted).
```

`asked_questions_log` is empty (first probe) → no duplicate check needed  `(_generate_probe_directive)`

Directive injected into chat_ctx                                          `(chat_ctx.add_message)`  
`answer_scores.append(quality_record)`                                    `(_apply_eval_result)`  
`persist_answer_scores()` background task                                 `(persist_answer_scores)`  
LLM gate released → Ishita speaks                                        `(agent._directive_ready.set())`

---

## Turn 5 — Ishita probes ownership (1:05)

```
Ishita: "Right, I hear you. Within all of that — the JWT middleware you mentioned,
         what specifically did YOU write in it? Walk me through what it actually does."
```

`_last_interviewer_question` = "what specifically did YOU write in it? Walk me through what it actually does."  
`_asked_questions_log.append("what specifically did YOU write in it...")` `(on_conversation_item_added)`  
LLM gate pre-closed                                                       `(agent._waiting_for_eval=True)`

---

## Turn 6 — Evasive again → `example_evaded` (1:25)

```
Priya: "I mean... the whole team collaborated. I did write some of the middleware
        for JWT validation but it was a group effort mostly."
```

`_current_topic_answers.append("I mean... the whole team collaborated...")`

**`evaluate_answer()` returns:**                                           `(evaluate_answer)`
```json
{
  "clarity": 5.0, "depth": 4.2, "specificity": 4.8, "grounding": 4.5,
  "action": "PROBE",
  "signal": "example_evaded",
  "signal_reason": "I did write some of the middleware... but it was a group effort mostly",
  "reason": "retreated to group effort after naming personal work"
}
```

Signal priority check: `ownership_ambiguous`(rank 3) vs `example_evaded`(rank 4)  `(SIGNAL_PRIORITY)`  
→ `example_evaded` is lower priority but it's the only one clearly fired → `example_evaded` selected

**Saturation:**                                                           `(TopicState.add_contribution)`
```
weighted = 5.0×0.20 + 4.2×0.35 + 4.8×0.30 + 4.5×0.15 = 4.56
signal_modifier = -0.30   (example_evaded penalty)
contribution = (4.56-2)/8×3.5 - 0.30 = 1.12 - 0.30 = 0.82
saturation_score += 0.8 + 0.82 → was 1.37, now 3.39
follow_up_turns = 2
```

**Weak exit check:**                                                      `(TopicState.is_weak_candidate_exit)`
```
follow_up_turns(2) < progress_check_turns(3) → False   ← not enough turns yet
```

**PROBE** again. `get_probe_context()` → `example_evaded`:               `(get_probe_context)`
```
SIGNAL: example_evaded
WHAT: Asked for a specific moment. Got "I did write some... mostly group effort" — not one real instance.
GOAL: Get one specific real moment — not a type of thing, one actual time.
ASK:
  - Force a memory: ask about a specific time, not how they generally do it.
  - Push for an imperfect detail — what happened, what went wrong, what surprised them.
  - Something only someone who lived it would know.
SKIP: Do not ask 'can you give an example' — too easy to dodge again. Force specificity.
```

Probe directive includes `_asked_questions_log`:                           `(_generate_probe_directive)`
```
QUESTIONS ALREADY ASKED (do NOT repeat these angles):
  - What were the main decisions you personally made on the API design?
  - Within all of that — the JWT middleware you mentioned, what specifically did YOU write in it?
```

---

## Turn 7 — Clean deep answer → `null` signal, saturation climbs (1:50)

```
Priya: "So JWT middleware validates the token on every request — it decodes the token,
        checks the signature against the secret key, validates the expiry, and attaches
        the user payload to the request object. If it fails it returns a 401. I wrote
        that whole piece, the other devs handled the routing layer."
```

**`evaluate_answer()` returns:**                                           `(evaluate_answer)`
```json
{
  "clarity": 7.8, "depth": 7.2, "specificity": 8.0, "grounding": 7.5,
  "action": "PROBE",
  "signal": null,
  "signal_reason": null,
  "reason": "specific step-by-step with clear personal ownership"
}
```

`signal = null` → `signal_reason = null` enforced                         `(evaluate_answer)`

**Saturation:**
```
weighted = 7.8×0.20 + 7.2×0.35 + 8.0×0.30 + 7.5×0.15 = 7.56
signal_modifier = 0   (no signal)
contribution = (7.56-2)/8×3.5 = 2.43
saturation_score += 0.8 + 2.43 → was 3.39, now 6.62
follow_up_turns = 3
per_turn_scores = [3.99, 4.56, 7.56]
```

**Weak exit check:**                                                      `(TopicState.is_weak_candidate_exit)`
```
follow_up_turns(3) >= progress_check_turns(3) → run check
effective = max(6.62, 0.8×3) = max(6.62, 2.4) = 6.62
need = 7.0 × 0.45 = 3.15
6.62 >= 3.15 → False   ← making progress, NOT a weak exit
per_turn_scores[-1](7.56) > per_turn_scores[-2](4.56) → improving → extra suppression
```

**Closing tier check:**                                                   `(_process_user_conversation_item)`
```
_depth_is_resume_project = True   (RESUME_TOPIC)
_topic_follow_ups = 3 >= 2        ✓
_depth_sat_ratio = 6.62/7.0 = 0.94 >= 0.6   ✓
topic_key not in _topic_closing_fired         ✓
_reflection_probe_count = 0 < 2              ✓
→ _is_closing_on_project = True   → CLOSING TIER fires
```

`_topic_closing_fired.add("paytm backend developer")`                     `(_process_user_conversation_item)`  
`_reflection_probe_count = 1`

`get_probe_context()` → closing tier:                                     `(get_probe_context)`
```
SIGNAL: topic_closing
WHAT: Main facts on this topic are covered. Time to close it.
GOAL: One honest reflective question to finish the topic well.
ASK:
  - What would they do differently if they built this again?
  - Anchor to something SPECIFIC they actually said — not a generic reflection.
SKIP: Do not open a new sub-topic. Do not ask about mechanics.
```

---

## Turn 8 — Reflection answer → saturated → MOVE_ON (2:15)

```
Priya: "Honestly I think we over-normalized the PostgreSQL schema early on.
        We had like 8 joins in some queries and it was killing performance.
        I would have denormalized the payment events table from the start."
```

**`evaluate_answer()` returns:**
```json
{
  "clarity": 7.5, "depth": 7.8, "specificity": 8.2, "grounding": 7.9,
  "action": "MOVE_ON",
  "signal": null,
  "signal_reason": null,
  "reason": "named specific fix with real performance context"
}
```

**Saturation:**
```
weighted = 7.83
contribution = 2.51
saturation_score += 0.8 + 2.51 → was 6.62, now 9.93
is_saturated = 9.93 >= 7.0 → TRUE
```

**Agent decision:**                                                       `(_process_user_conversation_item)`
```
_is_saturated = True → _action = "MOVE_ON"
```

**Topic record captured:**                                                `(_process_user_conversation_item)`
```python
_topic_record = {
  "topic":         "Paytm Backend Developer - Built REST APIs [Node.js, PostgreSQL]",
  "exit_reason":   "saturated",
  "probe_count":   3,
  "scores": {
    "avg_overall": (3.99+4.56+7.56+7.83)/4 = 5.99,
    "avg_depth":   (3.8+4.2+7.2+7.8)/4 = 5.75
  },
  "candidate_answers": [
    "So we built a REST API for the payments module...",
    "I did write some of the middleware for JWT validation...",
    "JWT middleware validates the token on every request...",
    "We had like 8 joins in some queries and it was killing performance..."
  ],
  "tech_skills": ["Node.js", "PostgreSQL", "REST APIs"]
}
```

**Auto-skill coverage:**                                                  `(_mark_topic_covered)`
```
skill_coverage_map: {"node.js": ["paytm backend developer"]}
→ _covered_topic_keys.record("node.js", source=AUTO_SKILL, via_topic="Paytm Backend Developer")
→ node.js will NOT get a standalone question
```

**Next topic picked:**                                                    `(_next_uncovered_topic)`
```
Pool order: [Paytm Backend Developer, Redis Caching Layer, PostgreSQL, System Design]
→ "Paytm Backend Developer" → covered → skip
→ "Redis Caching Layer"     → not covered → SELECTED
_active_topic = "Redis Caching Layer - Implemented cache-aside pattern [Redis, Node.js, TTL management]"
```

**`_generate_move_on_directive()` pre-fired in parallel with eval:**      `(_generate_move_on_directive)`

Coverage memory built:                                                    `(CoveredTopics.get_memory_block)`
```
[COVERAGE MEMORY — already discussed, do not re-open]
- Paytm Backend Developer: candidate described JWT middleware, over-normalized schema reflection
- node.js (via Paytm Backend Developer): covered in-depth during project — skip standalone question
If candidate revisits a covered topic, acknowledge with context above and redirect.
```

Source = `RESUME_TOPIC` → angle guide:
```
Candidate has direct experience here. Ask what they personally built.
Name the specific project and ask one concrete question grounded in it.
NEVER say 'you mentioned' or 'on your resume' — just ask naturally.
```

MOVE_ON directive generated:
```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: MOVE_ON
TOPIC YOU ARE LEAVING: Paytm Backend Developer — CLOSED. Do NOT reference it.
NEW ACTIVE TOPIC: Redis Caching Layer
WHAT WE KNOW:
  - Candidate built cache-aside pattern for session tokens
  - Tech: Redis, Node.js, TTL management
OPENING ANGLE: Cache-aside is a specific implementation choice — ask what invalidation
  strategy they used, what the TTL was, whether they hit staleness issues.
TRANSITION RULE: One short micro-reaction (3-8 words), then the opening question.
  No "Next up:", no "Moving on to:", no "Tell me about X — what did you work on there?"
FORBIDDEN PHRASES: "Thanks for sharing", "Moving on", "Can you tell me"
SUGGESTED OPENING QUESTION: You built the Redis caching layer for session tokens —
  walk me through how cache-aside actually worked in your setup.

ACKNOWLEDGEMENT RULES:
  - Varied fillers: 'Right, that makes sense.', 'Hmm, okay.', 'Oh, interesting.'
  - NEVER: 'Thanks for sharing', 'Thanks for clarifying', any 'thanks for [verb]ing'
  - NEVER reference 'Paytm Backend Developer' — it is closed.

[COVERAGE MEMORY — already discussed, do not re-open]
- Paytm Backend Developer: JWT middleware, schema reflection
- node.js (via Paytm Backend Developer): covered — skip standalone question

[CROSS-REFERENCE RULE — RESUME_TOPIC]
Candidate claims direct experience here.
Fair to probe mechanics, pitfalls, tradeoffs, debugging.
NEVER ask a question whose answer is already in COVERAGE MEMORY.
```

`[TOPIC_LOCK]` injected separately:
```
[TOPIC_LOCK - CRITICAL INSTRUCTION]
PREVIOUS TOPIC IS CLOSED. DO NOT REFERENCE IT.
NEW ACTIVE TOPIC: Redis Caching Layer
FULL CONTEXT: Redis Caching Layer - Implemented cache-aside pattern [Redis, Node.js, TTL management]
Ask ONE natural, specific question. Do NOT say 'Tell me about X — what did you work on there?'
```

`agent._move_on_opener_pending = True`                                    `(_process_user_conversation_item)`  
`_current_topic_answers = []` ← reset for new topic                      `(_process_user_conversation_item)`

---

## Turn 9 — Ishita moves to Redis (2:45)

```
Ishita: "Hmm, interesting point on the schema side. You built the Redis caching layer for
         session tokens — walk me through how cache-aside actually worked in your setup."
```

`conversation_item_added` fires                                           `(on_conversation_item_added)`  
`agent._move_on_opener_pending = True` → cleared now:                     `(on_conversation_item_added)`
```
agent._move_on_opener_pending = False
# "opener delivered — next answer will be scored normally"
```

TOPIC_GUARD:                                                              `(on_conversation_item_added)`
```
_expected_tokens = {"redis", "caching", "layer"}
"redis" + "caching" found → _topic_confirmed = True
_last_question_topic = "Redis Caching Layer"
```

---

## Turn 10 — Strong Redis answer → null signal → PROBE once more (3:10)

```
Priya: "Yeah I built that. When a request hits, we first check Redis for the session token.
        Cache miss? Pull from Postgres, write to Redis with a 15-minute TTL, return it.
        I used volatile-lru as the eviction policy so hot sessions stayed warm."
```

**`evaluate_answer()` returns:**
```json
{
  "clarity": 8.2, "depth": 8.0, "specificity": 9.1, "grounding": 8.5,
  "action": "MOVE_ON",
  "signal": null,
  "signal_reason": null,
  "reason": "named TTL value, eviction policy, cache-miss path — real implementation"
}
```

Topic "Redis Caching Layer" importance = HIGH (resume, not anchor)        `(TopicImportanceClassifier)`
```
saturation_threshold = 5.5   (mid × HIGH)
base_turn_credit     = 0.9
```

**Saturation:**
```
weighted = 8.56
contribution = (8.56-2)/8×3.5 = 2.87
saturation_score += 0.9 + 2.87 = 3.77
is_saturated = 3.77 >= 5.5 → False   ← not done yet, one more probe
```

Eval says MOVE_ON but saturation check: 3.77/5.5 = 68%, not saturated.   
Agent: `_action_from_eval = "MOVE_ON"` → but `not _is_saturated` → still...

Wait. Agent logic:
```python
if _weak_exit or _is_saturated or _dry_topic:
    _action = "MOVE_ON"
elif _action_from_eval == "MOVE_ON":
    _action = "MOVE_ON"   ← eval said MOVE_ON → agent respects it
```

`_action = "MOVE_ON"` ← eval's own judgment accepted                     `(_process_user_conversation_item)`

MOVE_ON to PostgreSQL. Same flow as above.

---

## Edge Case A — Candidate says "I don't know" (Turn 11, PostgreSQL)

```
Ishita: "You mentioned the PostgreSQL schema got complicated. When you were designing it,
         what index types did you choose and why?"

Priya: "Honestly I don't remember which index type we used. It was mainly the team's call."
```

`evaluate_answer()` — short denial check:                                 `(evaluate_answer)`
```python
_denial_re matches "i don't remember" + word_count=14 (>10 → full LLM run)
```

Full LLM scoring runs (>10 words, regex only catches ≤10 word denials)    `(evaluate_answer)`

LLM returns:
```json
{
  "clarity": 3.0, "depth": 1.0, "specificity": 1.0, "grounding": 2.0,
  "action": "PROBE",
  "signal": "depth_insufficient",
  "signal_reason": "I don't remember which index type we used",
  "reason": "stated they don't know, no mechanics given"
}
```

**But** `get_probe_context()` catches the denial:                         `(get_probe_context)`
```python
_is_denial = "i don't remember" found in prev_answer.lower() → True
```

Probe type overrides to `candidate_denial` (highest priority):
```
SIGNAL: candidate_denial
WHAT: Candidate said they don't know, forgot, or can't explain this.
GOAL: Accept it and pivot — don't push on what they can't answer.
ASK:
  - One short acknowledgement ('No worries.' / 'Fair enough.'), then move.
  - Pivot to what they DO remember, even vaguely.
  - Or ask about something related they mentioned elsewhere in this thread.
SKIP: Never re-ask what they forgot from a different angle.
      Never ask them to reflect on what they should have done differently here.
```

**Saturation:**
```
weighted = 3.0×0.20 + 1.0×0.35 + 1.0×0.30 + 2.0×0.15 = 1.25
signal_modifier = -0.20   (depth_insufficient)
raw_contribution = max(0, (1.25-2)/8×3.5) = 0.0   ← below floor
adjusted = max(0, 0 - 0.20) = 0.0
effective_base = 0.0   (contribution == 0)
saturation_score += 0.0
consecutive_low_yield = 1   (1.25 <= 1.0... wait: 1.25 > 1.0 → resets)
```

Actually 1.25 > 1.0 threshold → `consecutive_low_yield` stays 0. One more attempt.

---

## Edge Case B — Dry topic (Turn 12, PostgreSQL — second low yield)

```
Ishita: "Fair enough. What do you remember about how the queries were performing
         before you started hitting those join issues?"

Priya: "Yeah I mean it was slow. Like noticeably. That's about all I can say."
```

**`evaluate_answer()` returns:**
```json
{
  "clarity": 4.0, "depth": 0.8, "specificity": 0.5, "grounding": 1.5,
  "action": "PROBE",
  "signal": "depth_insufficient",
  "signal_reason": "yeah I mean it was slow. like noticeably. that's about all I can say",
  "reason": "zero specifics, acknowledged they can't give more"
}
```

**Saturation:**
```
weighted = 4.0×0.20 + 0.8×0.35 + 0.5×0.30 + 1.5×0.15 = 1.355
contribution = max(0, (1.355-2)/8×3.5 - 0.20) = 0.0
consecutive_low_yield = 1   (1.355 > 1.0 → but let's check: 1.355 <= 1.5)
```

Actually `consecutive_low_yield` increments when `weighted <= 1.0`. 1.355 > 1.0 → stays 0.

Turn 13 — Priya gives another thin answer (0.7 weighted):
```
consecutive_low_yield = 1
```

Turn 14 — Another thin answer (0.6 weighted):
```
consecutive_low_yield = 2
is_dry_topic() = 2 >= dry_topic_cap(2) → True → MOVE_ON
```

**Agent:**                                                                `(_process_user_conversation_item)`
```python
_dry_topic = True → _action = "MOVE_ON"
exit_reason = "dry_topic"
```

Topic record for PostgreSQL:
```python
{
  "topic": "PostgreSQL", "exit_reason": "dry_topic",
  "probe_count": 4, "denied": False,
  "scores": {"avg_overall": 2.8, "avg_depth": 1.9}
}
```

---

## Edge Case C — "Can you repeat that?" (any turn)

```
Priya: "Sorry, I didn't catch the last part — could you repeat the question?"
```

`_candidate_meta_intent()` → `"repeat"`                                   `(_candidate_meta_intent)`  
Eval entirely bypassed. No score recorded.                                `(_process_user_conversation_item)`

`_meta_answer_directive("repeat")` injected:                              `(_meta_answer_directive)`
```
[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]
The candidate asked you to repeat or simplify the question.
Repeat this question in simpler words:
  "When you were designing the PostgreSQL schema, what index types did you choose and why?"
Do not score their request. Ask only the repeated question.
```

`answer_scores.append({"is_meta_question": True, "clarity": 0, ...})`    `(_process_user_conversation_item)`  
LLM gate released immediately                                             `(agent._directive_ready.set())`

---

## Edge Case D — "Can we skip this?" (any turn)

```
Priya: "Can we move on to a different question? I'm not great with PostgreSQL internals."
```

`_candidate_meta_intent()` → `"skip"`                                     `(_candidate_meta_intent)`

Skip handling:                                                            `(_process_user_conversation_item)`
```python
_mark_topic_covered(_active_topic, answer_gist="I'm not great with PostgreSQL internals")
# → CoverageRecord(source=EXPLICIT, gist="I'm not great with PostgreSQL internals")

_next_after_skip = _next_uncovered_topic(exclude="PostgreSQL")
# → "System Design"
_active_topic = "System Design - jd_skill [microservices, distributed systems]"
```

`[META_QUESTION_DIRECTIVE]` injected:                                     `(_meta_answer_directive)`
```
[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]
The candidate asked to change or skip the question. Respect it.
Acknowledge naturally: 'Fair enough.' or 'No worries.'
Then ask ONE different question from a new uncovered topic.
Do not mention the skipped topic again.
```

`answer_scores.append({"is_meta_question": True, "overall": 0.0, ...})`  
Skip answer recorded with zero score — won't affect dimensions.           `(_process_user_conversation_item)`

Coverage memory after skip:
```
[COVERAGE MEMORY — already discussed, do not re-open]
- Paytm Backend Developer: JWT middleware, schema reflection
- node.js (via Paytm Backend Developer): covered — skip standalone
- Redis Caching Layer: cache-aside, 15-min TTL, volatile-lru
- PostgreSQL: I'm not great with PostgreSQL internals
```

---

## Edge Case E — Candidate asks "What company is this?"

```
Priya: "Before we go on — what company is this interview for?"
```

`_candidate_meta_intent()` → `"company"`                                  `(_candidate_meta_intent)`

`_meta_answer_directive("company")`:                                      `(_meta_answer_directive)`
```
[META_QUESTION_DIRECTIVE - DO NOT SAY ALOUD]
Candidate asked what company this is. Answer like a real interviewer first.
Say: "TechCorp is hiring for Backend Engineer, and today I'm mainly checking how
your backend thinking fits the work."
Then ask ONE concise interview question for the Backend Engineer role.
Do not ignore their question.
```

Zero score recorded. Eval bypassed. Ishita handles naturally.             `(_process_user_conversation_item)`

---

## Edge Case F — JD-only skill (System Design, Turn 15)

System Design = `jd_skill` — Priya did NOT list it on resume.

**MOVE_ON directive source rule:**                                        `(_generate_move_on_directive)`
```
Tag: JD_TOPIC — required by role, candidate has NOT claimed it on resume.
Frame as: the role requires this, curious about their exposure.
NEVER say 'you listed', 'you claimed', 'on your resume', or assume prior experience.
Example framing: "This role works a lot with distributed systems — what's your experience there?"
If they say NO: accept and move on. Do NOT grill them.
```

JD-only post-generation validation:                                       `(_generate_move_on_directive)`
```python
if re.search(r"you listed|you claimed|on your resume", generated, re.I):
    raise ValueError("generated JD-only directive used resume-claim phrasing")
    → fallback to rule-based directive
```

```
Ishita: "This role involves a fair bit of distributed systems work —
         what's your experience with that side of things?"

Priya: "Honestly, not much. I've read about CAP theorem but haven't built anything at scale."
```

`evaluate_answer()` short denial:                                         `(evaluate_answer)`
```python
# 14 words, denial pattern: "not much", "haven't built"
# falls through to full LLM (>10 words)
```

LLM returns: `action: MOVE_ON`, `signal: null`                           `(evaluate_answer)`

For `jd_skill`: even a "I haven't used it" answer routes to MOVE_ON immediately — no PROBE.

---

## Edge Case G — Candidate volunteers new tech (Turn 16)

```
Priya: "For the caching layer I also tried using Momento — it wasn't in our original
        stack but I was experimenting with it for a side project."
```

`evaluate_answer()`:                                                      `(evaluate_answer)`
```json
{
  "signal": "new_tech_thread",
  "signal_reason": "also tried using Momento — wasn't in our original stack",
  "action": "PROBE"
}
```

`new_tech_thread` → saturation modifier = +0.20 (bonus)                  `(eval_pipeline._SIGNAL_MODIFIERS)`

`last_turn_new_tech = True` → weak exit suppressed for this turn         `(TopicState.add_contribution)`

`get_probe_context()` → `new_tech_thread`:                                `(get_probe_context)`
```
SIGNAL: new_tech_thread
WHAT: Candidate mentioned Momento — not on resume, not in JD. Unprompted reveal.
GOAL: Pull this thread — if they brought it up unprompted, there is something real here.
ASK:
  - Ask how they picked it up or what they used it for.
  - Ask what surprised them about it or where it fit into their work.
  - This is a positive signal — ask with genuine curiosity, not pressure.
SKIP: Do not make this feel like a gotcha. They volunteered this — follow it warmly.
```

---

## Edge Case H — Standalone project attribution guard

Topic: "DataFlow Pipeline - [standalone]" — Priya's personal project on GitHub.

**`_generate_move_on_directive()` detects `[standalone]` tag:**           `(_generate_move_on_directive)`
```python
_is_standalone = "[standalone]" in new_topic.lower() → True
_attribution_guard = """
ATTRIBUTION GUARD — CRITICAL:
This topic is a STANDALONE / personal project. It is NOT linked to any company.
NEVER attach an employer or company name to it. NEVER say '...at Paytm' or '...at TechCorp'.
Even if the analyst brief mentions a company nearby, do NOT assume this project was built there.
"""
```

```
name_clause = "name the project (NOT any company — this is a standalone personal project)"
```

This prevents Ishita from saying "You built DataFlow Pipeline at Paytm, right?" when it was a side project.

`[TOPIC_LOCK]` also includes:                                             `(_process_user_conversation_item)`
```
This is a STANDALONE / personal project — do NOT attach any company or employer name to it.
NEVER say '...at <Company>' about it.
```

---

## Edge Case I — Duplicate question detected (Turn 17)

```
_asked_questions_log = [
  "What were the main decisions you personally made on the API design?",
  "What specifically did YOU write in it? Walk me through what it actually does.",
  "What index types did you choose and why?",
  "When you were designing the schema, how did the joins start affecting performance?",
  "What's your experience with distributed systems?",
  "How did you pick up Momento and what did you use it for?",
]
```

Probe directive for next turn injected with full log:                     `(_generate_probe_directive)`
```
QUESTIONS ALREADY ASKED (do NOT repeat these angles):
  - What were the main decisions you personally made on the API design?
  - What specifically did YOU write in it? Walk me through what it actually does.
  - What index types did you choose and why?
  - When you were designing the schema, how did joins affect performance?
  - What's your experience with distributed systems?
  - How did you pick up Momento and what did you use it for?
```

Directive LLM is instructed: "Do NOT repeat any of these angles."         `(_generate_probe_directive)`

If Ishita generates a question that reuses one of these angles, that is a prompt failure — the directive LLM is responsible for avoiding it. The log prevents exact repeats and close paraphrases.

---

## Edge Case J — 50 seconds of silence (Turn 18)

Ishita asks about system design. Priya goes silent.

```
t=10s: "Take your time, Priya. I'm here when you're ready."
        → session.say() → inactivity_nudge_speaking=True                  (_deliver_nudge)
        → inactivity clock NOT reset (preserve_nudge_flags=True)          (reset_inactivity_clock)

t=20s: "No rush at all. If it helps, feel free to think out loud."
        → session.say()

t=30s: "Are you still with me, Priya? Just let me know if you need
        me to repeat the question."
        → session.say()

t=50s: "It looks like you might have stepped away, Priya. I'll go ahead
        and pause our interview shortly if I don't hear from you."
        → session.say()

t=60s: "I'm going to end the session here since I haven't heard back.
        Thank you so much for your time today."
        → session.say() → disconnect_event.set()                          (_deliver_nudge)
        → main loop breaks → post-interview persistence runs
```

All nudges: `inactivity_nudge_speaking=True` during delivery so the nudge audio does NOT reset `_last_interviewer_question` or `_last_question_topic`. The 60s window measures from when Priya last had a chance to answer.   `(on_agent_state_changed)`

---

## Edge Case K — Candidate disconnects mid-interview (Turn 12)

```
Priya's browser closes unexpectedly.
```

`on_participant_disconnected` fires:                                       `(on_participant_disconnected)`
```python
if not ready_event.is_set() and not interview_marked_finished:
    # Before interview started → ignore (might be hardware check reconnect)
    return

# After interview started:
async def _candidate_disconnect_grace():
    await asyncio.sleep(5)
    if participant.identity in ctx.room.remote_participants:
        logger.info("Candidate reconnected within 5s grace window")
        return   # reconnected — continue normally
    disconnect_event.set()   # not back → end session
asyncio.create_task(_candidate_disconnect_grace())
```

If Priya reconnects in 4s → interview continues from where it left off.   
If not → `disconnect_event.set()` → main loop breaks → post-interview runs with partial transcript.

---

## Edge Case L — Custom question reminder (15:00 mark)

At 75% elapsed (15 minutes of 20):                                        `(main session loop)`
```python
_elapsed = 900  # 15 minutes elapsed
_total   = 1200 # 20 minutes total
_elapsed >= _total × 0.75 → True

_unasked_cqs = ["1. Ask about their experience with microservices at scale"]

chat_ctx.add_message(role="system", content="""
[CUSTOM Q REMINDER — DO NOT SAY ALOUD]
The recruiter REQUIRES these questions to be asked before the interview ends.
You have not asked them yet. Weave them in naturally within the next few turns:
1. Ask about their experience with microservices at scale
""")
```

`_custom_q_reminder_fired = True` ← only fires once                       `(main session loop)`

At <60s remaining, second urgent reminder fires if still unasked:
```
[CUSTOM Q REMINDER — DO NOT SAY ALOUD]
URGENT — less than 60 seconds remain. These recruiter-required questions have NOT been asked yet.
Ask them immediately. Keep each one brief and natural:
1. Ask about their experience with microservices at scale
```

Custom Q detected as asked — matching logic:                              `(on_conversation_item_added)`
```python
_q_lower = ishita_question.lower()
_asked_words = expand_custom_q_tokens(normalize(_q_lower))
_cq_words = expand_custom_q_tokens("microservices at scale")
ratio = len(_cq_words & _asked_words) / max(1, len(_cq_words))
# ratio >= 0.34 → _cq.asked = True
# → _covered_topic_keys.record(custom_q, source=CoverageSource.CUSTOM_Q)
```

---

## Edge Case M — Secondary phase (primary pool exhausted, 3 mins left)

All 4 topics covered. `remaining = 210s > 165s` (buffer).                `(_process_user_conversation_item)`

`_select_secondary_topic()` called:                                        `(_select_secondary_topic)`

**Phase 1: Find strongest topic to deepen:**                              `(_strongest_uncovered_for_deepening)`
```python
# _topic_states scores:
# paytm backend developer → saturation_score = 9.93   ← highest, >= 2.0
# redis caching layer     → saturation_score = 5.8
# → best = ("Paytm Backend Developer - ...", 9.93)

_secondary = {"phase": "deepen", "topic": "Paytm Backend Developer - ..."}
_deepened_topic_keys.add("paytm backend developer")
```

`_build_secondary_directive()` generates:
```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
PHASE: DEEPEN
You've already explored Paytm Backend Developer in depth. Go one level deeper.
Ask a more advanced question — a tradeoff they didn't address, an edge case,
or a design decision they would challenge now that they know more.
This is NOT a re-open — it's a harder follow-up on the same work.
```

**Phase 2: Soft questions** (if deepen exhausted):                       `(_select_secondary_topic)`
```python
_SOFT_QUESTIONS = [
  "What kind of work do you most enjoy doing day-to-day?",
  "What are you actively learning or building right now?",
  "What drew you to this specific role?",
  "Where do you want to grow technically over the next year?",
  "What does your best work look like — give me one concrete example.",
]
_active_topic = "general conversation"   ← neutral, no saturation tracking
```

**Phase 3: WRAP_UP** (all secondary exhausted):                          `(_process_user_conversation_item)`
```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: WRAP_UP
All planned interview topics have been covered.
[COVERED TOPICS -- DO NOT RE-OPEN ANY OF THESE]
  - paytm backend developer
  - redis caching layer
  - postgresql
  - system design
Ask ONE warm closing question: 'Of everything we've discussed, what are you most
proud of?' or 'Anything you wish I'd asked about?'
HARD RULE: Do NOT re-open any topic in the list above.
```

---

## Edge Case N — Eval LLM times out (Turn 19)

`evaluate_answer()` call exceeds 8s timeout:                             `(evaluate_answer)`
```python
except asyncio.TimeoutError:
    return {
        "clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0,
        "overall": 1.3,
        "action": "PROBE",
        "signal": "depth_insufficient",
        "signal_reason": "eval recovery — answer was too thin to score",
        "reason": "eval recovery (llm slow/unavailable)",
        "is_eval_recovery": True,
    }
```

Interview continues. Priya gets one more probe. No crash, no hang.        `(evaluate_answer)`

LLM gate timeout at `llm_node` level (5s wait for `_directive_ready`):   `(InterviewAgent.llm_node)`
```
DECISION: RECOVER_GATE_TIMEOUT
The eval pipeline timed out. Ask one natural follow-up question to continue the conversation.
Do not reference any previous question or topic. Keep it brief.
```

---

## Edge Case O — Final 45 seconds (19:15)

`remaining <= 45s`:                                                       `(main session loop)`
```python
chat_ctx.add_message(role="system", content=
  "[SYSTEM ALERT: FINAL WINDOW] Less than 45 seconds remain. "
  "Do not ask any new questions. Briefly wrap up and close naturally."
)
_final_no_new_question_guard = True
```

Ishita says something like: "It's been great chatting with you Priya, I think we've covered a lot of ground today..."

---

## Edge Case P — Hard time guard, final 20 seconds (19:40)

`remaining <= 20s`:                                                       `(main session loop)`
```python
_time_guard_active = True    # blocks all eval from this point
```

```python
_goodbye = "Thank you so much for your time today, Priya. That wraps up our interview. All the very best!"

if is_agent_speaking:
    session.interrupt()
    await asyncio.sleep(0.3)
    await session.say(_goodbye, allow_interruptions=False)

elif is_candidate_speaking:
    session.interrupt()
    await asyncio.sleep(0.2)
    await session.say(_goodbye, allow_interruptions=False)

else:
    await session.say(_goodbye, allow_interruptions=False)

break   # exits main loop → post-interview runs
```

Three goodbye scenarios handled: Ishita speaking (interrupt her), Priya speaking (interrupt her), silence (speak cleanly).   `(main session loop)`

---

## Edge Case Q — Candidate clicks End button (any time)

```
Priya clicks "End Interview" on the frontend.
```

Frontend sends:
```json
{"type": "interview_finished"}
```

`on_data_received` fires:                                                  `(on_data_received)`
```python
interview_marked_finished = True
interview_finished_event.set()
disconnect_event.set()
```

`finished_task.done()` → main loop exits on next iteration.               `(main session loop)`  
Post-interview persistence runs immediately.

If candidate reconnects after clicking End:                               `(on_participant_disconnected)`
```python
if interview_marked_finished:
    disconnect_event.set()   # shut down immediately, no grace window
    return
```

---

## Score Summary — Priya's Full Session

| Turn | Topic | Q (summarized) | A (summarized) | clarity | depth | spec | ground | weighted | Signal | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | warmup | How are you doing? | I'm good, ready to go | 0 | 0 | 0 | 0 | 0 | — | warmup |
| 4 | Paytm | Main API decisions? | We built REST API, team decided | 5.5 | 3.8 | 3.2 | 4.0 | 3.99 | `ownership_ambiguous` | PROBE |
| 6 | Paytm | What did YOU write? | I did write some JWT... mostly group effort | 5.0 | 4.2 | 4.8 | 4.5 | 4.56 | `example_evaded` | PROBE |
| 7 | Paytm | Walk through JWT | Decodes token, checks signature, validates expiry, 401 on fail | 7.8 | 7.2 | 8.0 | 7.5 | 7.56 | null | PROBE (closing) |
| 8 | Paytm | What would you change? | Over-normalized schema, 8 joins, would denormalize events table | 7.5 | 7.8 | 8.2 | 7.9 | 7.83 | null | MOVE_ON |
| 10 | Redis | Cache-aside how? | Check Redis first, miss→Postgres→write back, 15min TTL, volatile-lru | 8.2 | 8.0 | 9.1 | 8.5 | 8.56 | null | MOVE_ON (eval) |
| 11 | PostgreSQL | Index types why? | I don't remember which type, team's call | 3.0 | 1.0 | 1.0 | 2.0 | 1.66 | `depth_insufficient` → denial | PROBE |
| 12 | PostgreSQL | Performance before joins? | Yeah it was slow. Like noticeably. That's about all. | 4.0 | 0.8 | 0.5 | 1.5 | 1.36 | `depth_insufficient` | PROBE |
| 15 | System Design | Experience here? | Not much. Read about CAP, haven't built at scale | 4.5 | 2.0 | 1.5 | 3.0 | 2.55 | null | MOVE_ON (jd_skill) |
| 16 | Redis (deepen) | Momento side project | Tried it for caching, different eviction model | 6.5 | 5.8 | 7.0 | 6.2 | 6.27 | `new_tech_thread` | PROBE |

**Topic saturation at session end:**

| Topic | Threshold | Final score | % | Exit |
|---|---|---|---|---|
| Paytm Backend Developer | 7.0 | 9.93 | 142% | saturated |
| Redis Caching Layer | 5.5 | 3.77 | 69% | eval MOVE_ON |
| PostgreSQL | 5.5 | 1.36 | 25% | dry_topic (2 low-yield turns) |
| System Design | 7.0 | 2.55 | 36% | jd_skill MOVE_ON (no claim) |
