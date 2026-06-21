# Interview Flow — Complete End-to-End with Live Example

**Candidate:** Priya Sharma, applying for Backend Engineer  
**AI Interviewer:** Ishita  
**Duration budget:** 20 minutes  
**Band inferred from resume:** mid  
**TTS provider:** Cartesia (sonic-3)  
**Topics in pool:** 4 (Node.js API — anchor, PostgreSQL, Redis caching, System Design)  
**Custom questions from recruiter:** 1 ("Ask about their experience with microservices at scale")

---

## Phase 0 — Before Priya even joins

### Worker dispatches agent

`worker.ts` receives a BullMQ job `interview-start` and calls the LiveKit API to dispatch the agent to room `interview_app_xyz123`. The agent process starts and `entrypoint(ctx)` begins running.

### Parallel startup — two things run simultaneously

**A. DB fetch — `get_interview_context(app_id)`**
Pulls Priya's full row: name, job title, voice ID, `resumeData` JSON, `extractedDetails`, `interviewQuestions` (custom questions from recruiter), `proctoringSignals` toggle config.

**B. LiveKit room connect**
Agent joins the room. No participant yet.

Both run concurrently via `asyncio.gather`.

### GUARD: re-dispatch check
```python
if interviewStatus in ("COMPLETED", "NO_SHOW", "ABANDONED"):
    logger.info("Already completed — exiting")
    return
```
If Priya already finished, agent exits immediately. Prevents double-dispatch from a BullMQ retry.

### Interview Brief generation — `generate_interview_brief()`

This is the most expensive pre-work. It runs `brief_extraction.py` (LangGraph: parallel resume parse + JD parse) then an LLM call to build `InterviewBrief`.

**Brief extraction input (resume JSON):**
```json
{
  "work_history": [
    {"company": "Paytm", "role": "Backend Developer", "duration": "1.5 years",
     "description": "Built REST APIs for payments module using Node.js and PostgreSQL"}
  ],
  "projects": [
    {"title": "Redis Caching Layer", "description": "Implemented cache-aside pattern for session tokens",
     "tech": ["Redis", "Node.js", "TTL management"]}
  ],
  "skills": ["Node.js", "PostgreSQL", "Redis", "REST APIs", "Docker"]
}
```

**Brief output — `InterviewBrief`:**
```python
InterviewBrief(
    anchor_topic=TopicItem(
        title="Paytm Backend Developer",
        full_description="Built REST APIs for payments module at Paytm, 1.5 years",
        tech_stack=["Node.js", "PostgreSQL", "REST APIs"],
        tag="RESUME_TOPIC",
        relevance_score=0.92,
        probe_focus=["ownership", "schema decisions", "API design tradeoffs"],
        probe_avoid=["company gossip", "team size"],
        why_relevant="Most recent, most relevant role"
    ),
    topic_pool=[
        TopicItem(title="Paytm Backend Developer", ..., relevance_score=0.92),  # anchor
        TopicItem(title="Redis Caching Layer", ..., tag="RESUME_TOPIC", relevance_score=0.85),
        TopicItem(title="PostgreSQL", ..., tag="resume_skill", relevance_score=0.71),
        TopicItem(title="System Design", ..., tag="jd_skill", relevance_score=0.60),
    ],
    skill_coverage_map={
        "node.js": ["paytm backend developer", "redis caching layer"],
        "rest apis": ["paytm backend developer"],
    },
    candidate_band="mid"
)
```

**Topic pool built — `_build_topic_pool()`:**
```python
_topic_pool = [
    "Paytm Backend Developer - Built REST APIs for payments module at Paytm [Node.js, PostgreSQL, REST APIs]",
    "Redis Caching Layer - Implemented cache-aside pattern for session tokens [Redis, Node.js, TTL management]",
    "PostgreSQL - resume skill [PostgreSQL]",
    "System Design - jd_skill [microservices, distributed systems]",
]
_active_topic = _topic_pool[0]  # anchor always first
```

**Anchor title** = `"Paytm Backend Developer"` — this is what the first interview question will be about.

### System prompt built — 3 layers stacked

```
Layer 1 (Voice layer):   Who Ishita is, tone rules, org context
Layer 2 (Eval layer):    LLM analyst brief — Priya's resume vs JD summary
Layer 3 (Interview directive): full 20-min coverage plan, custom questions, band rules
```

### Custom questions parsed

Recruiter added: `"Ask about their experience with microservices at scale"`

Stored as `CustomQuestion(raw="Ask about...", normalized="microservices at scale", asked=False)`

### Agent initialized

```python
agent = InterviewAgent(instructions=system_prompt, chat_ctx=chat_ctx)
chat_ctx = agent._chat_ctx  # CRITICAL rebind — agent copies chat_ctx in __init__
```

The rebind is critical. `agent.__init__` creates a new `ChatContext` copy internally. If we don't rebind `chat_ctx` to `agent._chat_ctx`, every directive we inject (`[NEXT_TURN_DIRECTIVE]`, `[TOPIC_LOCK]`) goes into an orphaned object the LLM never reads.

### Providers initialized

- **STT:** Deepgram Flux (`flux-general-en`) — native turn detection, EOT threshold 0.70, timeout 3500ms
- **LLM:** GPT-4.1-mini, temperature 0.75
- **TTS:** Cartesia sonic-3 (from `voiceId` → `VOICE_REGISTRY` lookup)
- **VAD:** Silero ONNX (pre-warmed in `prewarm()`)

### Greeting precomputed (while Priya is on hardware check)

```python
welcome_text = "Hi Priya, I'm Ishita. How are you doing?"
```

`warm_greeting_task` pre-synthesizes this to TTS so first audio fires instantly when Priya clicks Start — no cold TTS latency.

---

## Phase 1 — Priya clicks "Begin Interview"

**What frontend does:**
1. Opens LiveKit room `interview_app_xyz123`
2. Shows spinning loader — "Getting things ready..."
3. Waits for `launch_prereqs_ready` data message from agent

**Agent publishes `launch_prereqs_ready`:**
```json
{
  "type": "launch_prereqs_ready",
  "ready": true,
  "prefetch_ready": true,
  "greeting_ready": true,
  "tts_warm_ready": true
}
```

Three conditions must ALL be true:
- `prefetch_ready`: LLM analyst brief + interview directive both cached
- `greeting_ready`: `welcome_text` non-empty
- `tts_warm_ready`: greeting TTS warmup succeeded

If any fail, the signal is not sent and the frontend keeps spinning. Agent logs a warning.

**Frontend receives signal → enables "Start" button.**  
Priya clicks Start.

**20-minute clock starts NOW** — `_interview_timer_start = time.monotonic()`

---

## Phase 2 — Turn 1: Greeting (0:00)

### Agent speaks (scripted, bypasses LLM)

```python
await session.say("Hi Priya, I'm Ishita. How are you doing?", allow_interruptions=False)
```

`session.say()` goes straight to TTS — no LLM involved. `allow_interruptions=False` means Priya cannot interrupt it.

**Why scripted instead of LLM?**  
The greeting must be consistent, predictable, and fast. LLM warm-up would add 1-2s latency. Scripted delivers immediately using the pre-warmed TTS audio.

**After greeting finishes:**
- `greeting_delivered_at = time.time()` — STT unblocked. Any candidate speech before this is silently dropped.
- Transcript line appended manually: `"Interviewer[0]: Hi Priya, I'm Ishita. How are you doing?"`
- `[PHASE_STATUS]` injected into chat_ctx: `"GREETING: DONE. Don't greet again. CURRENT PHASE: WARMUP"`
- `turn_count` incremented to 1
- LLM gate closed (`_waiting_for_eval = True, _directive_ready.clear()`) — agent waits for Priya's warmup answer before generating next response

**Inactivity clock started** — 10s silence → first nudge

---

## Phase 3 — Turn 2: Warmup (0:08)

**Priya says:** "I'm doing good, thanks! Ready to go."

### STT pipeline
Deepgram Flux detects end-of-turn via native EOT signal (confidence ≥ 0.70, max silence 3500ms). Fires `conversation_item_added` with `role=user`.

### STT cleanup — `_clean_stt_text()`

For warmup turns (`is_warmup_response = True`), noise filters are SKIPPED. The STT text is trusted as-is because warmup replies are always short and intentional.

For non-warmup turns (turns 3+), two hallucination filters run:
- **Spam filter**: ≥10 words + ≤3 unique words → discard (e.g. "okay okay okay okay okay okay okay okay okay okay")
- **Low-diversity filter**: ≥4 words + unique_count ≤ 35% of total → discard

### Meta-intent check — `_candidate_meta_intent()`

Priya's answer `"I'm doing good, thanks! Ready to go."` — does not match any meta patterns:
- Not a repeat request
- Not a company question
- Not a role question
- Not a skip request

→ No meta intent. Normal processing continues.

### Warmup readiness detection

```python
_warmup_readiness_markers = ("yes", "yeah", "yep", "ready", "let's go", "sure", "ok", ...)
_candidate_signals_ready = turn_snapshot >= 2 and not warmup_complete
    and any(m in _content_lc for m in markers)
# "ready to go" → matches "ready" → True
completing_warmup = True
```

### Warmup placeholder score recorded

```python
answer_scores.append({
    "question": _last_interviewer_question,
    "answer": "I'm doing good, thanks! Ready to go.",
    "clarity": 0, "depth": 0, "overall": 0.0,
    "is_warmup": True,
})
```

Warmup turns are logged with `is_warmup=True` and zero scores so they never pollute technical or communication score averages in the report.

### `warmup_complete = True`

`[WARMUP PHASE]` and `[PHASE_STATUS]` messages stripped from `chat_ctx`.

### First interview question directive injected

```
[PHASE_STATUS -- DO NOT SAY ALOUD]
GREETING: DONE. WARMUP: DONE.
DO NOT greet again or repeat the readiness check.

[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: FIRST_QUESTION
ANCHOR TOPIC: Paytm Backend Developer
FULL CONTEXT: Paytm Backend Developer - Built REST APIs for payments module [Node.js, PostgreSQL, REST APIs]
YOUR RESPONSE THIS TURN:
  Ask your first interview question directly.
  One short transition sentence, then the specific question about Paytm Backend Developer.
  Follow the FIRST QUESTION RULE for band=mid.
  ONE question only.
```

LLM gate released.

---

## Phase 4 — Turn 3: First Interview Question (0:15)

### LLM generates Ishita's response

The LLM sees the system prompt stack:
1. Voice layer + eval layer (who Ishita is + Priya's analyst brief)
2. Interview directive (20-min plan)
3. `[PHASE_STATUS]`: greeting/warmup done
4. `[NEXT_TURN_DIRECTIVE]`: FIRST_QUESTION, anchor = Paytm Backend Developer

**Ishita says:** "Alright, let's get into it. You worked on the payments module at Paytm — tell me about the REST API design. What were the main decisions you made around the API structure?"

### TTS pipeline

Text passes through 3 transforms before TTS:
1. `filter_emoji` — remove any emoji characters
2. `_tts_acronym_transform` — "REST" → "R.E.S.T", "API" → "A.P.I" (Cartesia pronounces them better letter-by-letter)
3. `_single_question_transform` — enforces only one question mark in the output. If LLM generated two questions, the second is stripped.

### `conversation_item_added` fires for assistant turn

- `clean_content = polish_candidate_facing_text(content)` — strips system-directive markers, normalizes whitespace
- `append_transcript_line("Interviewer", clean_content)` → `"Interviewer[15]: Alright, let's get into it. You worked on the payments module..."`
- `_last_interviewer_question = "What were the main decisions you made around the API structure?"` (last `?`-terminated sentence extracted)
- `_first_interview_question_asked = True`
- `[PHASE_STATUS]` updated: `"OPENING QUESTION: DONE. You already asked: 'What were the main decisions...'"`
- **LLM gate pre-closed** (`_waiting_for_eval = True, _directive_ready.clear()`) — prevents LLM from firing again before Priya answers
- `turn_count` → 3
- Inactivity clock started (10s window)

### TOPIC_GUARD check

Every time Ishita speaks, the system checks whether her question is actually about the expected topic (`Paytm Backend Developer`):

```python
_expected_tokens = {"paytm", "backend", "developer"}  # from active topic title
_q_mentions_expected = any(t in question.lower() for t in _expected_tokens)
# "paytm" found → True
_topic_confirmed = True
_last_question_topic = "Paytm Backend Developer"
```

If the LLM drifted and asked about a different topic, `_last_question_topic` would be set to `"general"` and the answer would be scored against a neutral label — protecting saturation tracking from corruption.

---

## Phase 5 — Turn 4: First Candidate Answer (0:35)

**Priya says:** "So we built a REST API for the payments module. The team decided to normalize the tables in PostgreSQL. We handled auth with JWT middleware, the whole team worked on it together."

### STT cleanup

Not a warmup turn. Noise filters run:
- 18 words, 14 unique → unique ratio = 77% → passes both filters
- No STT hallucination detected

### Meta-intent check

No meta patterns detected. Proceeds to eval.

### Eval gate check

```python
_can_eval_turn = (
    warmup_complete         # True
    and turn_snapshot > 2   # True (turn 4)
    and question_snap       # "What were the main decisions you made..."
    and _first_interview_question_asked  # True
)
# → True
```

### MOVE_ON race guard

`agent._move_on_opener_pending` is `False` (not in a MOVE_ON transition). Eval proceeds.

### Turn 3 warmup context strip (only fires once)

Turn 4 is `> 3`, so the warmup-strip code block is skipped. (It only fires on exactly turn 3.)

### Eval payload built — `_build_eval_payload()`

```python
{
    "app_id": "app_xyz123",
    "turn": 4,
    "answer": "So we built a REST API for the payments module...",
    "question": "What were the main decisions you made around the API structure?",
    "transcript_lines": [last 6 lines],
    "topic_score_history": [],           # empty — first turn on this topic
    "topic_depth_history": [],
    "turns_since_decay": 999,            # -999 → 999 (never decayed)
    "response_latency_sec": 18.4,        # 18.4s from question to answer
    "signal_toggles": {"ownership_ambiguity": True, "example_evasion": True, ...},
    "org_id": "org_abc",
    "llm_model": "gpt-4.1-nano",
    "active_topic": "Paytm Backend Developer",
    "active_topic_state": None,          # no state yet — first turn
    "anchor_item": "Paytm Backend Developer",
    "topic_tag": "RESUME_TOPIC",
    "topic_probe_focus": ["ownership", "schema decisions", "API design tradeoffs"],
    "topic_why_relevant": "Most recent, most relevant role",
    "job_title": "Backend Engineer",
    "remaining_seconds": 1165.0,         # ~19.4 min left
    "band": "mid",
}
```

### `run_eval_and_build_directive()` — eval pipeline

**Restores or creates TopicState:**
```python
# active_topic_state = None → create new TopicState
importance = TopicImportanceClassifier.classify("resume", is_anchor=True)
# → "CRITICAL" (is_anchor=True)
current_topic_state = TopicState("Paytm Backend Developer", "CRITICAL", band="mid")
# From _BAND_SATURATION["mid"]["CRITICAL"]:
saturation_threshold = 7.0
base_turn_credit     = 0.8
```

**Scoring LLM call (gpt-4.1-nano, temp=0):**

Prompt includes: answer, question, last 6 transcript lines, topic context ("RESUME_TOPIC"), probe_focus hints.

**LLM returns:**
```json
{
  "clarity": 5.5,
  "depth": 3.8,
  "specificity": 3.2,
  "grounding": 4.0,
  "overall": 4.1,
  "action": "PROBE",
  "signal": "ownership_ambiguity",
  "signal_reason": "candidate used 'we' and 'the team' throughout — personal contribution never stated"
}
```

**Weighted score:**
```
clarity(5.5)×0.20 + depth(3.8)×0.35 + specificity(3.2)×0.30 + grounding(4.0)×0.15
= 1.10 + 1.33 + 0.96 + 0.60 = 3.99
```

**Topic saturation update — `add_contribution(3.99, "ownership_ambiguity")`:**
```
signal_modifier = _SIGNAL_MODIFIERS["ownership_ambiguous"] = -0.30
contribution    = max(0.0, score_to_contribution(3.99) + (-0.30))
score_to_contribution(3.99) = min(3.5, max(0, (3.99 - 2.0) / 8.0 × 3.5)) = 0.87
contribution = max(0.0, 0.87 - 0.30) = 0.57
effective_base = base_turn_credit(0.8) if contribution > 0 else 0 = 0.8
saturation_score += 0.8 + 0.57 = 1.37
follow_up_turns = 1
is_saturated = 1.37 >= 7.0 → False
```

**Dry-topic check:** `follow_up_turns(1) < dry_topic_cap(2)` → not dry. Not a weak exit yet (only 1 turn). Not saturated.

**Eval action:** `PROBE` (LLM said PROBE, eval confirms)

**`run_eval_and_build_directive` returns:**
```python
{
    "action": "PROBE",
    "signal": "ownership_ambiguity",
    "signal_reason": "candidate used 'we' and 'the team' throughout — personal contribution never stated",
    "quality_record": {
        "turn": 4, "topic": "Paytm Backend Developer",
        "question": "What were the main decisions you made...",
        "answer": "So we built a REST API...",
        "clarity": 5.5, "depth": 3.8, "specificity": 3.2, "grounding": 4.0, "overall": 3.99,
        "signal": "ownership_ambiguity", "signal_reason": "...",
        "topic_saturation_score": 1.37, "topic_saturation_threshold": 7.0,
    },
    "saturation": {
        "score": 1.37, "threshold": 7.0, "follow_up_turns": 1,
        "is_saturated": False, "weak_exit": False, "dry_topic": False,
        "topic_state_dict": { ... }
    },
    "eval_llm_usages": [{"model": "gpt-4.1-nano", "inputTokens": 412, "outputTokens": 38}],
}
```

### Agent decision logic

```python
_weak_exit    = False
_is_saturated = False
_dry_topic    = False
_action_from_eval = "PROBE"

# None of the MOVE_ON conditions met
_action = "PROBE"
```

### State mutations persisted — `_apply_eval_result()`

- `answer_scores.append(quality_record)`
- `_topic_score_histories["paytm backend developer"].append(3.99)`
- `_topic_depth_histories["paytm backend developer"].append(3.8)`
- `persist_answer_scores()` fired as background task

### PROBE directive generated — `_generate_probe_directive()`

Signal = `ownership_ambiguity`. Probe family = `ownership` from `_PROBE_FAMILIES`. Rotating through goals:

```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: PROBE
FAMILY: ownership
GOAL: pin_personal_role
TOPIC: Paytm Backend Developer

The candidate used 'we' and 'the team' in their answer — personal contribution unclear.
DIRECTIVE: Ask one direct follow-up that forces them to name EXACTLY what THEY personally designed or decided.
Frame as: "Within that team, what was specifically yours to own?"
Previous Q: "What were the main decisions you made around the API structure?"
Previous A: "So we built a REST API... the team decided to normalize..."
Topic context: probe_focus = [ownership, schema decisions, API design tradeoffs]
Do NOT ask a generic follow-up. Make it specific to what they just described.
ONE question only.
```

Injected into `chat_ctx`. LLM gate released.

---

## Turn 5 — Ishita probes ownership (1:05)

**Ishita:** "Within that team, what was specifically yours to own? Walk me through one decision on the API where you were the one who made the call."

TOPIC_GUARD confirms question is about Paytm Backend Developer → `_last_question_topic = "Paytm Backend Developer"`.

---

## Turn 6 — Priya answers (1:25)

**Priya:** "I mean... the whole team collaborated. I did write some of the middleware for JWT validation but it was a group effort mostly."

**Eval scores:** clarity=5.0, depth=4.2, specificity=4.8, grounding=4.5, weighted=4.56  
**Signal:** `example_evasion` — "stayed vague after direct ownership question, gave partial example but retreated to 'group effort'"

**Saturation update:**
```
contribution = score_to_contribution(4.56) - 0.30 (example_evasion modifier) = 1.19 - 0.30 = 0.89
saturation_score += 0.8 + 0.89 = 2.06   (was 1.37, now 3.43)
follow_up_turns = 2
```

Still not saturated (3.43 / 7.0 = 49%). **PROBE** again.

**Probe directive** → family `depth`, goal `concrete_detail`:
> "You mentioned writing the JWT middleware — what specifically did you implement in it? What does that middleware actually do step by step?"

---

## Turn 7 — Priya answers (1:50)

**Priya:** "So JWT middleware validates the token on every request — it decodes the token, checks the signature against the secret key, validates the expiry, and attaches the user payload to the request object. If it fails it returns a 401."

**Eval scores:** clarity=7.8, depth=7.2, specificity=8.0, grounding=7.5, weighted=7.56  
**Signal:** `null` — clean answer, specific, grounded

**Saturation update:**
```
contribution = score_to_contribution(7.56) + 0 = min(3.5, (7.56-2)/8×3.5) = 2.43
saturation_score += 0.8 + 2.43 = 3.23   (was 3.43, now 6.66)
follow_up_turns = 3
```

6.66 / 7.0 = 95%. Not quite saturated. **BUT** — `is_weak_candidate_exit()` check:
```python
# follow_up_turns(3) >= progress_check_turns(3) → run check
raw_base = 0.8 × 3 = 2.4
effective = max(6.66, 2.4) = 6.66
threshold_fraction = saturation_threshold × progress_check_pct["mid"]["CRITICAL"] = 7.0 × 0.45 = 3.15
6.66 >= 3.15 → False → not a weak exit
```

Not a weak exit. LLM eval says `PROBE`. But agent checks: is this a **closing tier** opportunity?

```python
_is_closing_on_project = (
    _depth_is_resume_project  # True
    and _topic_follow_ups >= 2   # 3 ≥ 2 → True
    and _depth_sat_ratio >= 0.6  # 6.66/7.0 = 0.95 ≥ 0.6 → True
    and topic_key not in _topic_closing_fired  # True (first time)
    and _reflection_probe_count < 2  # 0 < 2 → True
)
# → True — closing tier fires
```

**CLOSING PROBE directive:**
> "Looking back at your time on the payments API — if you could go back and change one architectural decision, what would it be and why?"

`_topic_closing_fired.add("paytm backend developer")`, `_reflection_probe_count = 1`

---

## Turn 8 — Priya reflection answer (2:15)

**Priya:** "Honestly I think we over-normalized the PostgreSQL schema early on. We had like 8 joins in some queries and it was killing performance. I would have denormalized the payment events table from the start."

**Eval scores:** clarity=7.5, depth=7.8, specificity=8.2, grounding=7.9, weighted=7.83  
**Signal:** `null`

**Saturation update:**
```
contribution = score_to_contribution(7.83) = 2.51
saturation_score += 0.8 + 2.51 = 3.31   (was 6.66, now 9.97)
is_saturated = 9.97 >= 7.0 → TRUE
```

**Agent decision:**
```python
_is_saturated = True → _action = "MOVE_ON"
```

---

## MOVE_ON — Topic 1 → Topic 2 (2:40)

### Topic record captured

```python
_topic_record = {
    "topic": "Paytm Backend Developer - Built REST APIs...",
    "topic_key": "paytm backend developer",
    "topic_type": "project",
    "exit_reason": "saturated",
    "probe_count": 3,
    "scores": {
        "avg_overall": (3.99+4.56+7.56+7.83)/4 = 5.99,
        "avg_depth": (3.8+4.2+7.2+7.8)/4 = 5.75,
        "last_clarity": 7.5, "last_depth": 7.8,
        "last_specificity": 8.2, "last_grounding": 7.9,
    },
    "candidate_answers": [
        "So we built a REST API for the payments module...",
        "I mean... I did write some JWT middleware...",
        "JWT middleware validates the token on every request...",
        "Honestly I think we over-normalized the PostgreSQL schema...",
    ],
    "tech_skills": ["Node.js", "PostgreSQL", "REST APIs"],
    "denied": False,
}
_topic_records.append(_topic_record)
```

### Auto-skill coverage

```python
# skill_coverage_map says "node.js" is covered by "paytm backend developer"
# _mark_topic_covered fires:
_covered_topic_keys.record("node.js", source=CoverageSource.AUTO_SKILL, via_topic="Paytm Backend Developer")
_covered_topic_keys.record("rest apis", source=CoverageSource.AUTO_SKILL, via_topic="Paytm Backend Developer")
```

### Next topic selected

```python
_next_topic = _next_uncovered_topic(exclude="Paytm Backend Developer")
# Scans _topic_pool in order:
# [0] "Paytm Backend Developer" → excluded
# [1] "Redis Caching Layer - ..." → not in _covered_topic_keys → SELECTED
_active_topic = "Redis Caching Layer - Implemented cache-aside pattern... [Redis, Node.js, TTL management]"
```

### MOVE_ON directive generated (pre-fired in parallel during eval)

```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: MOVE_ON
TOPIC YOU ARE LEAVING: Paytm Backend Developer — CLOSED. Do NOT reference it.
NEW ACTIVE TOPIC: Redis Caching Layer
FULL CONTEXT: Redis Caching Layer - Implemented cache-aside pattern for session tokens [Redis, Node.js, TTL management]
TOPIC SOURCE: RESUME_TOPIC
SUGGESTED OPENING: Reference the JWT middleware path from Paytm — ask about the caching layer for session tokens.
SOURCE RULE: This is a resume topic. Fair to probe where they built it.
INTERVIEW MEMORY: Covered — Paytm Backend Developer (saturated, exit: JWT middleware + schema reflection)
```

`[TOPIC_LOCK]` also injected:
```
[TOPIC_LOCK - CRITICAL INSTRUCTION]
PREVIOUS TOPIC IS CLOSED. DO NOT REFERENCE IT.
NEW ACTIVE TOPIC: Redis Caching Layer
FULL CONTEXT: Redis Caching Layer - Implemented cache-aside pattern...
Ask ONE natural, specific question to open the new topic.
```

`agent._move_on_opener_pending = True` — one-shot skip flag. Next eval cycle will be skipped so the opener fires before scoring.

---

## Turn 9 — Ishita moves on (2:45)

**Ishita:** "That's a good reflection on the schema side. You've also got a Redis caching layer listed — walk me through how you actually implemented the cache-aside pattern for those session tokens."

### Opener delivered

`conversation_item_added` fires. `agent._move_on_opener_pending` is `True` → cleared now:
```python
agent._move_on_opener_pending = False
logger.info("opener delivered — cleared opener_pending; next answer will be scored")
```

---

## Turn 10 — Priya answers Redis (3:10)

**Priya:** "Yeah I built that. So when a request comes in, we first check Redis for the session token. If it's there, great, return it. If not, hit the database, write it to Redis with a 15-minute TTL, then return it. The eviction policy was volatile-lru so hot sessions stayed warm."

**This answer is now scored normally** (opener_pending is cleared).

**Eval scores:** clarity=8.2, depth=8.0, specificity=9.1, grounding=8.5, weighted=8.56  
**Signal:** `null`

**Saturation:** Topic is "Redis Caching Layer" — CRITICAL importance (anchor? No — anchor was Paytm. TopicImportanceClassifier: `tag="RESUME_TOPIC"`, `is_anchor=False` → `"HIGH"`).

From `_BAND_SATURATION["mid"]["HIGH"]`: threshold=5.5, base_turn_credit=0.9

```
contribution = score_to_contribution(8.56) = min(3.5, (8.56-2)/8×3.5) = 2.87
saturation_score += 0.9 + 2.87 = 3.77
is_saturated = 3.77 >= 5.5 → False
```

But `probe_count=1` AND `avg_overall=8.56 >= 7` → **probe bonus** would apply in report (+0.5 to skill score).

LLM eval says: `"action": "PROBE"`, `signal: null`.  
Agent: no saturation flags. **PROBE** once more.

---

## Edge Case: Candidate asks to skip (hypothetical, turn 11)

If Priya had said **"Can we move on to a different question?"**:

```python
_meta_intent = _candidate_meta_intent("Can we move on to a different question?")
# → "skip"
```

**Skip handling:**
1. `_mark_topic_covered(_active_topic)` — Redis Caching Layer marked covered with `CoverageSource.EXPLICIT`
2. `_next_after_skip = _next_uncovered_topic(exclude=_active_topic)` → PostgreSQL
3. `_active_topic = "PostgreSQL - resume_skill [PostgreSQL]"`
4. `answer_scores.append({"is_meta_question": True, "clarity": 0, ...})` — logged at zero score
5. `[META_QUESTION_DIRECTIVE]` injected: "Candidate asked to skip. Acknowledge briefly. Ask one different question."
6. Eval entirely bypassed. LLM gate released immediately.

---

## Edge Case: Candidate says "I don't know / I don't remember" (hypothetical)

If Priya said **"I don't really remember the details of the schema design"**:

Eval pipeline would still run and score the answer. `signal = "explicit_denial"` would fire.

In the saturation system:
```
TopicState.consecutive_low_yield += 1
if consecutive_low_yield >= dry_topic_cap(2): is_dry_topic() = True → agent MOVE_ON
```

In the topic_record:
```python
"exit_reason": "explicit_denial"
"denied": True
```

In the skills LLM prompt for this topic: `denied: True` → LLM caps skill score at 2.

---

## Edge Case: Candidate disconnects mid-interview (turn 11)

```python
@ctx.room.on("participant_disconnected")
def on_participant_disconnected(disconnected_participant):
    if interview_marked_finished:
        disconnect_event.set(); return
    async def _candidate_disconnect_grace():
        await asyncio.sleep(5)
        if participant.identity in ctx.room.remote_participants:
            logger.info("Candidate reconnected within 5s grace window"); return
        disconnect_event.set()  # -> main loop breaks
    asyncio.create_task(_candidate_disconnect_grace())
```

5-second grace window. If Priya reconnects within 5s (network blip), interview continues. If not, `disconnect_event` fires → main loop breaks → post-interview persistence runs.

---

## Edge Case: Candidate asks "Can you repeat that?" (any turn)

```python
_meta_intent = "repeat"
# _meta_answer_directive("repeat"):
#   "[META_QUESTION_DIRECTIVE]\nRepeat this question in simpler words: '{last_q}'\nDo NOT score."
```

LLM is told to rephrase the last question more simply. Eval entirely bypassed. No score recorded for this turn.

---

## Edge Case: Candidate says something completely off-topic (turn 12)

**Priya:** "Actually can you tell me what company this is?"

```python
_meta_intent = "company"
# _meta_answer_directive("company"):
#   "The candidate asked what company this is. Answer: 'TechCorp is hiring for Backend Engineer, 
#    today I'm checking how your backend thinking fits the work.' Then continue with ONE interview question."
```

Handled gracefully. No score logged. LLM bridges back to the interview naturally.

---

## Inactivity handling (50 seconds of silence example)

If Priya goes silent for 50 seconds on a question:

```
t=10s: "Take your time, Priya. I'm here when you're ready."
t=20s: "No rush at all. If it helps, feel free to think out loud."
t=30s: "Are you still with me, Priya? Just let me know if you need me to repeat the question."
t=50s: "It looks like you might have stepped away, Priya. I'll go ahead and pause our interview shortly if I don't hear from you."
t=60s: "I'm going to end the session here since I haven't heard back. Thank you so much for your time today."
       → session terminates
```

Nudge messages are scripted via `session.say()`. They do NOT reset the inactivity clock — the 60s window measures from Priya's last real chance to answer, not from when nudges were delivered.

---

## Custom question reminder (15:00 mark — 75% elapsed)

At 75% of 20 minutes (minute 15), the agent checks if recruiter custom questions are still unasked:

```python
_unasked_cqs = ["1. Ask about their experience with microservices at scale"]
chat_ctx.add_message(role="system", content=
    "[CUSTOM Q REMINDER — DO NOT SAY ALOUD]\n"
    "The recruiter REQUIRES these questions before the interview ends. "
    "Weave them in naturally:\n"
    "1. Ask about their experience with microservices at scale"
)
```

The LLM weaves it naturally into the next PROBE turn rather than announcing it as a special question.

Second reminder fires at <60s remaining (urgent — ask NOW).

---

## Final window — last 45 seconds (19:15)

```python
# remaining <= 45s
chat_ctx.add_message(role="system",
    "[SYSTEM ALERT: FINAL WINDOW] Less than 45 seconds remain. "
    "Do not ask any new questions. Briefly wrap up and close naturally."
)
```

LLM stops probing/moving-on. It delivers a brief closing, e.g. "It's been really great chatting with you Priya, I think we've covered a lot of ground..."

---

## Time guard — last 20 seconds (19:40)

```python
_time_guard_active = True    # eval is blocked for all remaining turns
final_timeout_announced = True
```

Agent determines the current state:
- If Ishita is mid-speech: `session.interrupt()` → 0.3s gap → say goodbye
- If Priya is speaking: `session.interrupt()` → 0.2s gap → say goodbye
- If silence: say goodbye cleanly

```python
_goodbye = "Thank you so much for your time today, Priya. That wraps up our interview. All the very best!"
await session.say(_goodbye, allow_interruptions=False)
break  # exits main loop
```

---

## Alternatively: Priya clicks End (any time)

Frontend sends:
```json
{"type": "interview_finished"}
```

`on_data_received` receives it:
```python
interview_marked_finished = True
interview_finished_event.set()
disconnect_event.set()
```

`finished_task.done()` → main loop exits on next iteration.

---

## Post-interview persistence (runs after main loop exits)

```python
await asyncio.sleep(2)  # wait for any pending background eval tasks to land
proctoring_data = _build_proctoring_data("interview_finished")
# → {"role_category": "mid", "total_turns": 14, "exit_reason": "interview_finished", "events": []}
```

**5 async operations run (some in background):**

1. `persist_transcript(app_id, transcript_lines, session_start_time, proctoring_data=..., final_status="COMPLETED")`
   - Writes `interviewTranscript`, sets `status="COMPLETED"`, writes `integritySignals` (from browser events stored separately)
   
2. `persist_answer_scores(app_id, answer_scores)` — all 10 scored turns + warmup placeholders

3. `update_interview_status(app_id)` — marks COMPLETED in DB immediately to prevent re-dispatch

4. `persist_org_usage_metrics(org_id, session_usage, ...)` — LLM + TTS + STT costs

5. Background task — `_run_report_and_summary()`:
   ```python
   scores_context = await generate_interview_report(
       app_id, transcript_lines, answer_scores, job_title,
       proctoring_data, org_id, llm_model, jd_json, _topic_records
   )
   await generate_interview_summary(app_id, transcript_lines, job_title, org_id, scores_context)
   ```
   (See `interview-report-flow.md` for full detail on this step)

6. `persist_interview_billing_snapshot(app_id, ...)` — final billing record with idempotency check

7. `flush_pending_manual_billing(org_id)` — any deferred billing entries flushed

---

## What `answer_scores` looks like at session end

```python
[
    {"turn": 2, "is_warmup": True, "clarity": 0, "depth": 0, "overall": 0},  # warmup placeholder
    {"turn": 4, "topic": "Paytm Backend Developer",
     "question": "What were the main decisions you made...",
     "answer": "So we built a REST API...",
     "clarity": 5.5, "depth": 3.8, "specificity": 3.2, "grounding": 4.0, "overall": 3.99,
     "signal": "ownership_ambiguity", "signal_reason": "..."},
    {"turn": 6, "topic": "Paytm Backend Developer",
     "clarity": 5.0, "depth": 4.2, "specificity": 4.8, "grounding": 4.5, "overall": 4.56,
     "signal": "example_evasion", "signal_reason": "..."},
    {"turn": 8, "topic": "Paytm Backend Developer",
     "clarity": 7.5, "depth": 7.8, "specificity": 8.2, "grounding": 7.9, "overall": 7.83,
     "signal": null},
    {"turn": 10, "topic": "Redis Caching Layer",
     "clarity": 8.2, "depth": 8.0, "specificity": 9.1, "grounding": 8.5, "overall": 8.56,
     "signal": null},
    # ... more turns for PostgreSQL, System Design, custom question...
]
```

---

## Saturation state summary at end of interview

| Topic | Threshold | Final score | % | Exit reason |
|---|---|---|---|---|
| Paytm Backend Developer | 7.0 | 9.97 | 142% | saturated |
| Redis Caching Layer | 5.5 | 5.8 | 105% | saturated |
| PostgreSQL | 5.5 | 3.2 | 58% | weak_exit (2 turns, low depth) |
| System Design | 7.0 | 2.1 | 30% | dry_topic (candidate said "I don't know") |

---

## Complete `_topic_records` passed to report generation

```python
[
    {"topic": "Paytm Backend Developer...", "exit_reason": "saturated", "probe_count": 3,
     "scores": {"avg_overall": 5.99, "avg_depth": 5.75, ...},
     "candidate_answers": ["So we built a REST API...", "I did write some JWT middleware...", ...]},
    {"topic": "Redis Caching Layer...", "exit_reason": "saturated", "probe_count": 1,
     "scores": {"avg_overall": 8.20, "avg_depth": 7.9, ...},
     "candidate_answers": ["Yeah I built that. When a request comes in..."]},
    {"topic": "PostgreSQL...", "exit_reason": "weak_exit", "probe_count": 4,
     "scores": {"avg_overall": 4.1, "avg_depth": 3.5, ...},
     "candidate_answers": ["We normalized the tables...", "I'm not sure about the index type..."]},
    {"topic": "System Design...", "exit_reason": "dry_topic", "probe_count": 2,
     "scores": {"avg_overall": 2.8, "avg_depth": 2.1, ...}, "denied": True,
     "candidate_answers": ["CAP theorem... I'd probably go with availability..."]},
]
```

---

## Key state variables at every point

| Variable | Role | Set when |
|---|---|---|
| `warmup_complete` | Gate for eval to start | Candidate signals readiness (turn 2) |
| `_first_interview_question_asked` | Seal opening question | After first post-warmup AI turn |
| `_active_topic` | What the agent is currently probing | Updated on every MOVE_ON |
| `_last_interviewer_question` | Passed to eval as "question" | After every assistant turn |
| `_last_question_topic` | What topic the question was about | Confirmed by TOPIC_GUARD per turn |
| `agent._waiting_for_eval` | LLM gate state | True = LLM blocked waiting for directive |
| `agent._move_on_opener_pending` | Skip one eval after MOVE_ON | Set on MOVE_ON, cleared when opener delivered |
| `_topic_states` | Serialized TopicState per topic | Updated by eval pipeline each turn |
| `_covered_topic_keys` | All completed topics | Updated on MOVE_ON + auto-skill |
| `_time_guard_active` | Final 20s block | When remaining <= 20s |
| `greeting_delivered_at` | STT unblock gate | When greeting TTS finishes |

---

## PROBE — Complete Conditions and Logic

### When does PROBE fire?

PROBE is the default. It fires unless one of the MOVE_ON conditions is true.

```python
_action = "PROBE"    # start here
if _weak_exit or _is_saturated or _dry_topic:
    _action = "MOVE_ON"
elif _action_from_eval == "MOVE_ON":   # eval's own judgment
    _action = "MOVE_ON"
# otherwise: stay PROBE
```

The agent overrides eval's recommendation. Even if eval says PROBE, the agent can force MOVE_ON based on saturation state. Eval's MOVE_ON is accepted but eval can never force a PROBE that the agent overrides.

### PROBE priorities (in order, first match wins)

**1. Denial override (highest priority)**
If candidate said any of: `"i forgot"`, `"i don't remember"`, `"i don't know"`, `"not sure"`, `"can't remember"` — OR if `topic_denied=True` (topic key already in `_covered_topic_keys`):

```
SIGNAL: candidate_denial
GOAL: Accept it and pivot — don't push what they can't answer.
ASK: One short acknowledgement, pivot to what they DO remember even vaguely.
     Or ask about something related they mentioned elsewhere in this thread.
SKIP: Never re-ask what they forgot from a different angle.
```

**2. Closing tier** — one reflection probe when all conditions met:
```python
_is_closing_on_project = (
    _depth_is_resume_project       # topic is RESUME_TOPIC tag
    and _topic_follow_ups >= 2     # at least 2 probes done
    and _depth_sat_ratio >= 0.6    # ≥60% saturation reached
    and topic_key not in _topic_closing_fired  # never fired for this topic yet
    and _reflection_probe_count < 2  # max 2 reflection probes per session
)
```
```
SIGNAL: topic_closing
GOAL: One reflective question to finish the topic well.
ASK: "What would you do differently?", "What surprised you?", "What are you most proud of?"
     Must be anchored to something specific they actually said — not a generic reflection.
SKIP: Do not open a new sub-topic. Do not ask about mechanics.
```

**3. Signal-based probe** — based on what `evaluate_answer()` detected:

| Signal | What fired | Goal | Example angle |
|---|---|---|---|
| `ownership_ambiguous` | Candidate said "we/team" without naming their own action | Pin their specific deliverable | "Within that team, what was specifically yours?" |
| `example_evaded` | Asked for a real story, got theory or "usually I..." | Get one specific real moment | "Tell me about one actual time this happened — not the general way" |
| `depth_insufficient` | Said WHAT, never HOW or WHY | Get the mechanics | "How specifically did that part work — walk me through it" |
| `surface_answer` | Correct but hollow — no names, numbers, real texture | One concrete detail proving they were there | "Give me one specific number or name from what you described" |
| `tech_claim_unverified` | Named a tool but described it vaguely | Verify hands-on knowledge | "What specifically did you build or configure with it?" |
| `new_tech_thread` | Mentioned a tool not on resume — unprompted | Pull this thread warmly | "How did you pick that up, and what did you use it for?" |
| `claim_not_demonstrated` | Strong personal claim with nothing concrete | Real example proving the claim | "Tell me one time that actually got tested — what happened?" |
| `null` (no signal) | Answer answered the question cleanly | Pull the most interesting specific thing | Find the one concrete detail worth following |

**4. Band overlay** (appended to any signal probe)

- `topic_follow_ups <= 1` → "First probe. Pull the most interesting thing. Not generic — find the specific detail worth digging into."
- `band == "fresher"` → "Don't push for tradeoffs. Ask HOW they actually did it in practice."

### Probe directive structure (what the directive LLM generates)

```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: PROBE (OWNERSHIP_AMBIGUOUS)
WHAT THE CANDIDATE REVEALED: Used "we built" and "the team decided" throughout — never once said what they personally designed or output.
ANGLE TO PURSUE: They mentioned "JWT middleware" — that's the one thing that's theirs. Push on exactly what that middleware does step by step.
INTENT: Find whether they actually wrote it or just know it existed. A real author can walk through it; someone who didn't write it can only summarize.
FORBIDDEN: Do not ask "what was your role" again — that got us here. Do not re-ask about the PostgreSQL decision already mentioned.
```

Ishita (the interview LLM) reads this directive and generates her own question. The probe directive LLM **never writes the question** — it only writes the angle and intent. This prevents robotic scripted questions.

**Duplicate prevention** — `_asked_questions_log`:
The last 6 questions Ishita asked are injected into the probe directive prompt:
```
QUESTIONS ALREADY ASKED (do NOT repeat these angles):
  - What were the main decisions you made around the API structure?
  - Within that team, what was specifically yours to own?
  - You mentioned writing the JWT middleware — what specifically did you implement?
```
The directive LLM is instructed to not repeat any of these angles. Ishita cannot ask the same question twice in a session.

**Probe directive fallback** — if the LLM call times out or returns empty:
```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: PROBE (DEPTH)
WHAT THE CANDIDATE REVEALED: Their answer left something specific unresolved.
SIGNAL: ownership_ambiguous — candidate used 'we' throughout
ANGLE TO PURSUE: Find the most concrete or surprising thing in their last answer and pull that thread.
INTENT: Understand what they actually did or decided — not just what they say they did.
FORBIDDEN: Do not ask a generic question. Do not repeat an already-asked angle.
```

---

## MOVE_ON — Complete Conditions and Logic

### All conditions that trigger MOVE_ON (evaluated in priority order)

**1. Saturated** — topic has enough quality signal to close
```python
is_saturated = saturation_score >= saturation_threshold
# Example: 9.97 >= 7.0 → True
```

**2. Weak exit** — 3+ turns done but candidate is stuck below progress threshold
```python
def is_weak_candidate_exit(self) -> bool:
    if follow_up_turns < progress_check_turns(3):
        return False   # not enough turns yet to judge
    raw_base = base_turn_credit × follow_up_turns
    effective = max(saturation_score, raw_base)
    if effective >= saturation_threshold × progress_check_pct:
        return False   # making reasonable progress
    if len(per_turn_scores) >= 2 and per_turn_scores[-1] > per_turn_scores[-2]:
        return False   # score IMPROVING last turn — give another chance
    if last_turn_new_tech:
        return False   # candidate volunteered new info — positive signal, don't bail
    return True        # stuck + not improving + no new signal → MOVE_ON
```

Example: mid band, HIGH importance (threshold=5.5, credit=0.9, progress_pct=0.45):
- Turn 3: sat=1.8, raw_base=0.9×3=2.7, effective=2.7, need=5.5×0.45=2.475 → 2.7 >= 2.475 → NOT weak exit
- Turn 4: sat=2.1, raw_base=0.9×4=3.6, effective=3.6, need=2.475 → 3.6 >= 2.475 → NOT weak exit
- Turn 5: sat=2.3, raw_base=0.9×5=4.5, effective=4.5, need=2.475 → 4.5 >= 2.475 → NOT weak exit
- Turn 6: sat=2.4 (stagnant), scores=[2.1,2.3,2.2,2.4,2.3], last<prev-last → improving check fails → **weak exit = True → MOVE_ON**

**3. Dry topic** — consecutive turns all returned near-zero contribution
```python
def is_dry_topic(self) -> bool:
    if follow_up_turns < dry_topic_cap:
        return False
    return consecutive_low_yield >= dry_topic_cap

# dry_topic_cap = 1 if band == "fresher" else 2
# consecutive_low_yield increments when weighted_score <= 1.0
# resets to 0 when weighted_score > 1.0
```

Example: mid band (cap=2). Priya scores 0.8 then 0.9 on system design → `consecutive_low_yield=2 >= 2` → dry topic → MOVE_ON. Fresher band (cap=1): one low score triggers it immediately.

**4. Eval's own MOVE_ON** — `evaluate_answer()` returns `action="MOVE_ON"` when:
- `remaining_seconds` is very low and topic is not critical
- Answer quality was good enough that another probe would be redundant
- LLM judges no new information would come from further probing

**5. Skip request** — candidate explicitly asked to skip (`_meta_intent == "skip"`) → immediate MOVE_ON without scoring.

**6. All topics covered + secondary phases exhausted + time remains** → WRAP_UP directive

### MOVE_ON directive anatomy

The MOVE_ON directive LLM generates a full structured block:

```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: MOVE_ON
TOPIC YOU ARE LEAVING: Paytm Backend Developer — CLOSED. Do NOT reference it.
NEW ACTIVE TOPIC: Redis Caching Layer
WHAT WE KNOW: [bullet points from analyst brief about Redis Caching Layer]
OPENING ANGLE: Candidate mentioned cache-aside in their resume — ask how they actually
  implemented it, what cache invalidation strategy they used, whether they hit any
  staleness issues.
TRANSITION RULE: One short micro-reaction (3-8 words) based on what they just said,
  then the opening question. No "Next up:", no "Moving on to:", no "Tell me about X".
FORBIDDEN PHRASES: "Thanks for sharing", "That's great", "Next, let's talk about",
  "Moving on", "Can you tell me"
SUGGESTED OPENING QUESTION: You built a Redis caching layer for session tokens — walk
  me through how cache-aside actually worked in your implementation.

ACKNOWLEDGEMENT RULES:
  - Start with ONE natural micro-reaction, 3-8 words.
  - Use varied fillers: 'Right, that makes sense.', 'Hmm, okay.', 'Ah, okay.', 'Oh, interesting.'
  - For vague answers: 'Hmm, okay...' before clarifying.
  - For honest gaps: 'Fair enough.' or 'No worries.'
  - NEVER: 'Thanks for sharing', 'Thanks for clarifying', any 'thanks for [verb]ing'.
  - NEVER end a sentence with 'hmm', 'umm', 'ahh', 'right', or 'yeah'.
  - NEVER reference the old topic 'Paytm Backend Developer' — it is closed.

[COVERAGE MEMORY — already discussed, do not re-open]
- Paytm Backend Developer: candidate described JWT middleware, over-normalized schema, reflection
- node.js (via Paytm Backend Developer): covered in-depth during project — skip standalone question
- rest apis (via Paytm Backend Developer): covered in-depth during project — skip standalone question
If candidate revisits a covered topic, acknowledge with context above ('Yes, we covered X
during Y — I have a clear picture, let's move on') and redirect to the active topic.
DO NOT probe a covered topic again.

[CROSS-REFERENCE RULE — resume_skill]
The candidate lists Redis on their resume. Fair to probe where they used it.
Do NOT re-open Paytm Backend Developer (already covered).
Probe SKILL-LEVEL depth: mechanics, pitfalls, tradeoffs, debugging, internals.
```

Then `[TOPIC_LOCK]` is injected separately as a second system message:
```
[TOPIC_LOCK - CRITICAL INSTRUCTION]
PREVIOUS TOPIC IS CLOSED. DO NOT REFERENCE IT.
NEW ACTIVE TOPIC: Redis Caching Layer
FULL CONTEXT: Redis Caching Layer - Implemented cache-aside pattern for session tokens [Redis, Node.js, TTL management]
Ask ONE natural, specific question to open the new topic.
Use the SUGGESTED OPENING QUESTION in your directive as your starting point.
Do NOT say 'Tell me about X — what did you work on there?' — be more specific.
Do not mention tools, projects, or details from the previous topic.
```

### Cross-reference rules per topic source

**RESUME_TOPIC (candidate worked on it):**
```
Candidate has direct experience here. Ask about what they built, their specific role,
a decision they made, or what broke.
Open by naming the specific project or role and asking one concrete grounded question.
NEVER say 'you mentioned' or 'on your resume' — just ask naturally about the work.
```

**resume_skill (candidate listed skill on resume):**
```
Candidate claims this skill. Fair to ask where they used it and probe depth.
Pick ONE category: mechanic/concept, pitfall awareness, tradeoff, hands-on debugging, internals.
Calibrate to band: FRESHER → what/why/basic; MID → decisions+tradeoffs; SENIOR → strategy+judgment.
NEVER ask a question whose answer is already in COVERAGE MEMORY.
```

**jd_skill (JD requires it, candidate did NOT list on resume):**
```
The candidate did NOT list this skill. The opener asks whether they have worked with it.
- If they say NO: acknowledge briefly and move on. Do NOT push or quiz on theory.
- If they say YES: stay APPLIED. Ask what they actually did with it — not internals or mechanics.
NEVER say 'you listed', 'you claimed', 'on your resume', or assume prior experience.
```
Also has a hard validation after generation — if the generated directive contains "you listed / you claimed / on your resume", it's rejected and falls back to rule-based.

**STANDALONE project:**
```
ATTRIBUTION GUARD: This is a standalone / personal project. NOT linked to any company.
NEVER attach an employer name to it. NEVER say '...at <Company>'.
Even if the analyst brief mentions a company nearby, do NOT assume this project was built there.
```

---

## Coverage Memory — `CoveredTopics` and `get_memory_block()`

### What CoveredTopics stores

Every covered topic gets a `CoverageRecord` with:
```python
@dataclass
class CoverageRecord:
    short_key:     str            # normalized lowercase key
    display_title: str            # human-readable title for LLM
    source:        CoverageSource # EXPLICIT | AUTO_SKILL | CUSTOM_Q
    gist:          str            # first ~25 words of candidate's answer
    via_topic:     str            # parent topic (for AUTO_SKILL only)
```

Three coverage sources:
- `EXPLICIT` — agent ran MOVE_ON after probing to saturation/weak-exit/dry-topic
- `AUTO_SKILL` — skill inferred from a project's `[tech]` bracket (e.g. Node.js auto-covered when Paytm project is closed)
- `CUSTOM_Q` — recruiter's custom question was detected in Ishita's output

### Key normalization — why it never double-asks

Every key is normalized the same way on every read and write:
```python
def _norm(key: str) -> str:
    short = str(key or "").split(" - ")[0].strip()   # take only the title part before " - "
    return re.sub(r"[^a-z0-9]+", " ", short.lower()).strip()

# "Paytm Backend Developer - Built REST APIs [Node.js]"  →  "paytm backend developer"
# "paytm backend developer"                              →  "paytm backend developer"
# "PAYTM BACKEND DEVELOPER"                             →  "paytm backend developer"
# All three resolve to the same key — impossible to ask the same topic twice
```

### Auto-skill coverage on MOVE_ON

When Paytm Backend Developer closes:
```python
# skill_coverage_map from InterviewBrief:
# {"node.js": ["paytm backend developer"], "rest apis": ["paytm backend developer"]}

for skill_id, covering_topic_ids in _interview_brief.skill_coverage_map.items():
    if any(norm(tid) == norm(active_topic) for tid in covering_topic_ids):
        _covered_topic_keys.record(
            skill_id,
            source=CoverageSource.AUTO_SKILL,
            via_topic="Paytm Backend Developer",
        )
```

Result:
- `node.js` → auto-covered, will not get a standalone question
- `rest apis` → auto-covered, will not get a standalone question

### What `get_memory_block()` injects into every directive

```
[COVERAGE MEMORY — already discussed, do not re-open]
- Paytm Backend Developer: candidate described JWT middleware, over-normalized schema, reflection
- node.js (via Paytm Backend Developer): covered in-depth during project — skip standalone question
- rest apis (via Paytm Backend Developer): covered in-depth during project — skip standalone question
If candidate revisits a covered topic, acknowledge with the context above
('Yes, we covered X during Y — I have a clear picture, let's move on')
and redirect to the active topic. Do NOT probe a covered topic again.
```

### What happens if candidate revisits a covered topic

The memory block in both PROBE and MOVE_ON directives tells Ishita:
> "If candidate revisits a covered topic, acknowledge with the context above and redirect."

Example: Priya says "Actually, can we go back to the API design?" on turn 9.
- Ishita is NOT supposed to evaluate this answer — the `_meta_intent` check would catch an explicit skip/revisit request.
- If she says it naturally ("by the way, on the API..."), the coverage memory in the active directive tells the interview LLM: "Paytm Backend Developer: covered — I have a clear picture, let's move on" and Ishita acknowledges briefly and redirects.

---

## Saturation Thresholds — Full Table

### Band × Importance matrix

| Band | Importance | Threshold | Base credit/turn | Progress check pct |
|---|---|---|---|---|
| fresher | CRITICAL | 5.5 | 1.0 | 75% |
| fresher | HIGH | 5.0 | 1.0 | 80% |
| fresher | MEDIUM | 5.0 | 1.2 | 90% |
| fresher | LOW | 2.5 | 1.4 | 90% |
| mid | CRITICAL | 7.0 | 0.8 | 45% |
| mid | HIGH | 5.5 | 0.9 | 45% |
| mid | MEDIUM | 4.0 | 1.0 | 80% |
| mid | LOW | 3.0 | 1.2 | 65% |
| experienced | CRITICAL | 9.0 | 0.7 | 28% |
| experienced | HIGH | 7.0 | 0.8 | 30% |
| experienced | MEDIUM | 5.0 | 0.9 | 45% |
| experienced | LOW | 3.5 | 1.0 | 60% |
| senior | CRITICAL | 11.0 | 0.6 | 20% |
| senior | HIGH | 8.5 | 0.7 | 22% |
| senior | MEDIUM | 6.0 | 0.8 | 35% |
| senior | LOW | 4.0 | 0.9 | 50% |

**Importance is assigned by `TopicImportanceClassifier`:**
```python
def classify(topic_source: str, is_anchor: bool) -> str:
    if is_anchor:     return "CRITICAL"   # anchor topic (most recent/relevant)
    if topic_source == "resume":  return "HIGH"    # project or work history
    if topic_source == "skill":   return "MEDIUM"  # listed skill
    return "LOW"                          # JD-only or role knowledge
```

**Reading the table:**
- A senior candidate needs 11 saturation points on their anchor topic before MOVE_ON fires. Requires multiple deep, specific, grounded answers.
- A fresher candidate needs only 5.5 on their anchor. One decent answer often saturates it.
- `base_turn_credit` is the floor contribution per turn — even a poor answer earns this much if contribution > 0.
- `progress_check_pct` is how much of the threshold you should have reached after 3 turns. If you're below it and not improving, weak-exit fires.

### Signal modifiers on saturation contribution

Every signal shifts the `score_to_contribution` result before being added to saturation:

| Signal | Modifier | Effect |
|---|---|---|
| `ownership_ambiguous` | -0.30 | Vague ownership reduces credit — candidate isn't proving they did it |
| `example_evaded` | -0.30 | Theoretical answers don't count as real coverage |
| `depth_insufficient` | -0.20 | Surface-level mechanics reduce credit |
| `surface_answer` | -0.20 | Correct but hollow — partial credit |
| `tech_claim_unverified` | -0.30 | Named a tool but couldn't demonstrate hands-on use |
| `claim_not_demonstrated` | -0.25 | Made a strong claim with no evidence |
| `new_tech_thread` | +0.20 | Volunteer reveal — candidate showed real initiative, bonus credit |
| `null` (no signal) | 0 | Clean answer — full contribution |

**Contribution formula:**
```python
def _score_to_contribution(weighted: float) -> float:
    return min(3.5, max(0.0, (weighted - 2.0) / 8.0 * 3.5))

contribution = max(0.0, _score_to_contribution(weighted) + signal_modifier)
effective_base = base_turn_credit if contribution > 0.0 else 0.0
saturation_score += effective_base + contribution
```

Example: weighted=5.5, signal=`ownership_ambiguous` (modifier=-0.30):
```
raw_contribution = (5.5-2.0)/8.0 × 3.5 = 1.53
adjusted         = 1.53 - 0.30 = 1.23
saturation_score += base_credit(0.8) + 1.23 = 2.03
```

Example: weighted=1.5, signal=`example_evaded` (modifier=-0.30):
```
raw_contribution = max(0.0, (1.5-2.0)/8.0 × 3.5) = 0.0
adjusted         = max(0.0, 0.0 - 0.30) = 0.0
effective_base   = 0.0 (because contribution == 0)
saturation_score += 0.0    ← total zero contribution
consecutive_low_yield += 1
```

---

## Secondary Phase — When the Primary Pool is Exhausted

When `_next_uncovered_topic()` returns `None` but meaningful time remains (> 45s + 120s buffer = 165s), the agent does NOT wrap up. It enters the secondary phase.

```python
_secondary_buffer_secs = FINAL_WINDOW_SECONDS(45) + 120 = 165

if _next_topic is None and _remaining_total_seconds_now() > 165:
    _secondary = _select_secondary_topic(_old_key)
```

### Secondary phase order

**Phase 1: Deepen a strong topic** (`_strongest_uncovered_for_deepening`)

Picks the topic with the highest `saturation_score` that hasn't been deepened yet and has at least 2.0 saturation points:
```python
def _strongest_uncovered_for_deepening(exclude_key):
    best = None
    for t in _topic_pool:
        if t in _covered_topic_keys or t in _deepened_topic_keys: continue
        ts = _topic_states.get(normalize(k))
        score = ts.get("saturation_score", 0.0)
        if score >= 2.0 and (best is None or score > best[1]):
            best = (t, score)
    return best
```

The `[NEXT_TURN_DIRECTIVE]` for deepen tells Ishita to return to a topic already covered and go one level deeper — a more advanced question, a tradeoff, an edge case she wouldn't have asked in the initial pass.

Each topic can only be deepened once per session (`_deepened_topic_keys`).

**Phase 2: Soft wind-down questions** (`_SOFT_QUESTIONS`)

Fired in order, one per MOVE_ON:
```python
_SOFT_QUESTIONS = [
    "What kind of work do you most enjoy doing day-to-day?",
    "What are you actively learning or building right now?",
    "What drew you to this specific role?",
    "Where do you want to grow technically over the next year?",
    "What does your best work look like — give me one concrete example.",
]
```

Soft questions use `_active_topic = "general conversation"` so their answers accumulate saturation against a neutral label and don't corrupt any real topic's state.

**Phase 3: WRAP_UP** — all topics + secondary phases exhausted

```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: WRAP_UP
All planned interview topics have been covered.
[COVERED TOPICS -- DO NOT RE-OPEN ANY OF THESE]
  - paytm backend developer
  - redis caching layer
  - postgresql
  - system design
Ask ONE warm closing question such as 'Of everything we've discussed, what are you most
proud of?' or 'Anything you wish I'd asked about?'
HARD RULE: Do NOT re-open any topic in the list above.
```

---

## Topic Duplicate Detection — Jaccard Overlap

When building the topic pool, the brief extraction LangGraph already deduplicates topics using Jaccard overlap. But the agent also checks at MOVE_ON time via `_topics_overlap()` to prevent re-asking topics that describe the same work under different names (e.g. "Python Developer at Sensex" and "Sensex Analysis Project").

### Two tests (either sufficient for dedup)

**Test 1: Symmetric Jaccard overlap ≥ 50%**
```python
inter = set_A & set_B
union = set_A | set_B
if len(inter) / len(union) >= 0.5: → duplicate
```

Example: "Redis Caching Layer - cache-aside session tokens [Redis, Node.js]" vs "Redis Session Cache - session management [Redis]"
- Significant tokens: `{"redis", "caching", "layer", "cache", "aside", "session", "tokens", "node"}` vs `{"redis", "session", "cache", "management"}`
- inter = `{"redis", "session", "cache"}` = 3
- union = 8 unique tokens
- 3/8 = 0.375 → below 0.5 → NOT a duplicate, keep both

**Test 2: Title containment ≥ 3 tokens at 70% match**
```python
# Catches "Sensex Project" fully contained inside "Python Developer - Sensex Project"
ta = significant_tokens(title_A)
for title, other_full in ((ta, sb), (tb, sa)):
    if len(title) >= 3:
        shared = title & other_full
        if len(shared) >= 3 and len(shared) / len(title) >= 0.7:
            → duplicate
```

**Test 3: Role/project pair detection**
If topics share a distinctive token (≥5 chars) AND one is a work-history role ("developer", "engineer", "intern") and the other is a project ("project", "system", "pipeline") → duplicate.

Example: "Python Developer - Sensex Global IT" (role) + "Sensex Analysis Project" (project):
- `inter = {"sensex"}` — distinctive (7 chars)
- a_role=True (contains "developer"), b_project=True (contains "project")
- → duplicate → only one is kept in the pool

**Stopwords excluded from all token comparisons:**
Generic words like "system", "project", "app", "using", "developer", "engineer", "team", "work", "data", "api", "web", "cloud", "automation", "platform" etc. are stripped before comparison so they never create false duplicate matches.
