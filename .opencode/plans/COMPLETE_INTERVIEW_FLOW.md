# COMPLETE INTERVIEW FLOW — Every Line, Every Edge Case

## TABLE OF CONTENTS
1. [Frontend → API → BullMQ → Agent Dispatch](#1-frontend--api--bullmq--agent-dispatch)
2. [Agent Entry & DB Fetch](#2-agent-entry--db-fetch)
3. [Resume/JD Parsing & Brief Generation](#3-resumejd-parsing--brief-generation)
4. [System Prompt Assembly](#4-system-prompt-assembly)
5. [Topic Pool & Active Topic Initialization](#5-topic-pool--active-topic-initialization)
6. [Session Start & Greeting Delivery](#6-session-start--greeting-delivery)
7. [Warmup Phase](#7-warmup-phase)
8. [Per-Turn Eval Loop (The Core)](#8-per-turn-eval-loop-the-core)
9. [PROBE Decision (Stay on Topic)](#9-probe-decision-stay-on-topic)
10. [MOVE_ON Decision (Switch Topic)](#10-move_on-decision-switch-topic)
11. [LLM Gate & Question Generation](#11-llm-gate--question-generation)
12. [Secondary Phase (Topics Exhausted)](#12-secondary-phase-topics-exhausted)
13. [Interview End Conditions](#13-interview-end-conditions)
14. [Post-Interview Persistence](#14-post-interview-persistence)
15. [Edge Cases Reference](#15-edge-cases-reference)

---

## 1. Frontend → API → BullMQ → Agent Dispatch

### 1a. Candidate Clicks "Begin Interview"

Two parallel paths fire from the frontend:

**Path A — Start API** (`app/api/interview/[id]/start/route.ts`):
- Dispatches BullMQ job `mark-interview-started` to `interview-start` queue
- `worker.ts:processInterviewStartJob()` merely updates DB: `Interview.status = IN_PROGRESS`, sets `startedAt`
- Does NO resume/JD processing

**Path B — Token API** (`app/api/interview/[id]/token/route.ts`, line 155):
- Creates LiveKit room named `interview_<appId>`
- Dispatches Python agent via `dispatchClient.createDispatch(roomName, agentName, metadata)`
- `metadata` JSON: `{applicationId, candidateName, roleLabel, timeLimitMins}`
- Fire-and-forget (wrapped in `void(async () => {...})()`)

### 1b. BullMQ Worker (`worker.ts`)

The worker listens on `interview-start` queue (Redis at `31.97.60.216:32768`). On receiving a job, it calls `processInterviewStartJob()` which:
1. Looks up the Interview record
2. Sets status to `IN_PROGRESS`
3. Returns

The agent dispatch is handled entirely by LiveKit's dispatch system — the worker does NOT dispatch the agent. The frontend's token API does that.

### 1c. Python Agent Entry

LiveKit calls `entrypoint(ctx: JobContext)` in `interview/agent_runtime.py:930` when the agent is dispatched into the room.

Pre-flight check (line 934): if ANOTHER agent is already in the room (identity starts with `AW_` or contains "agent"), the entrypoint self-destructs immediately — no duplicate dispatch.

---

## 2. Agent Entry & DB Fetch

### 2a. Room Name → Application ID

```python
app_id = ctx.room.name.replace("interview_", "")
# "interview_app-xyz-123" → "app-xyz-123"
```

### 2b. Parallel Startup (line 1011)

```python
context_result, connect_result = await asyncio.gather(
    get_interview_context(app_id),   # DB query
    connect_with_retry(),            # LiveKit room connect (3 retries, 2s backoff)
    return_exceptions=True,
)
```

Both run simultaneously. Connect has 3 retries with 2s backoff.

### 2c. The DB Query (`get_interview_context`, agent_persistence.py:1016)

Big SQL join across 4 tables: Application, Drive, Organization, EngineVoice, Interview.

Returns dict with: fullName, resumeText, resumeData, extractedDetails, screeningCriteria, role/title as jobTitle, voiceId, voiceProvider, voiceModel, aiName, orgName, orgLocation, interviewLanguage, interviewQuestions, proctoringSignals, interviewStatus, etc.

### 2d. Validation via `InterviewContext` Pydantic Model (line 891)

Required: `fullName`, `jobTitle`, `language` — raises `ValueError` if empty.

### 2e. Re-entry Guard (line 1034)

```python
if ctx_data.interviewStatus in ("COMPLETED", "NO_SHOW", "ABANDONED"):
    return  # Exit immediately
```

### 2f. JSON Parsing (line 1042)

`_coerce_jsonish()` handles both JSON strings and already-parsed dicts.
ExtractedDetails → fallback to screeningCriteria if empty.

### 2g. JD Skill Extraction (line 1063)

Priority 1: `criteria[]` with priority=`critical`/`high` → must_have, `medium` → nice_to_have
Priority 2 (fallback): `skills.must_have`, `mustHaveSkills`, `requirements`, `keywords`

### 2h. Custom Questions Parsing (line 1127)

Each custom question normalized: lowercased, prefixes stripped ("Ask him about X" → "X"), token synonyms expanded. Tracked by `CustomQuestion.asked: bool = False`.

---

## 3. Resume/JD Parsing & Brief Generation

### 3a. `parse_resume_context()` (line 1185)

Parses the full `resumeData` JSON → `ResumeContext` dataclass with:
- `years_of_experience`, `years_label`, `current_role`
- `skills: list[str]` (from skills.technical[].skill + tools + domain)
- `projects: list[str]` formatted as `"Title - Description [tech1, tech2]"`
- `work_history: list[str]` as `"Role - Company (duration)"`
- `education`, `internships`

Uses `_ResumeContextParser` with dozens of field-name fallbacks.

### 3b. `infer_candidate_band()` (line 1189)

```
< 1.5 years → "fresher"
> 10 years  → "senior"
> 5 years   → "experienced"
else        → "mid"
```

Runs BEFORE the LLM brief — cannot depend on it.

### 3c. `build_resume_brief()` (line 1191)

Band-specific strategy picks anchor and priority order. Anchor selection is **weighted random** (50%/35%/15%) so the same resume can open on different topics across sessions.

### 3d. Rule-Based Brief (line 1205)

Built as fallback before the LLM brief starts — includes JD gap analysis via `_cross_reference_skills()`.

### 3e. LLM Analyst Brief (line 1218) — THE KEY CALL

Sends BOTH full `resume_json` AND `jd_json` to GPT-4.1-mini. Returns ~300-word narrative:

```
ANALYST READ:
WORK HISTORY SIGNALS:
PROJECT SIGNALS:
SKILL REALITY:
JD FIT:
UNCERTAIN AREAS (MUST PROBE):
OPENING ANGLE:
```

**The raw JSON is never injected into chat_ctx** — only this condensed narrative.

### 3f. Brief Selection (line 1232)

```python
session_context.merged_brief_block = _candidate_llm_brief  # or _rule_based_brief fallback
```

---

## 4. System Prompt Assembly

### 4a. Three Layers

```python
voice_layer_prompt = build_voice_layer_prompt(...)        # Who Ishitha is, tone
evaluation_layer_prompt = build_evaluation_layer_prompt(   # Analyst brief + band posture
    live_prompt_context=session_context.live_prompt_context,
    ...)
system_prompt = build_system_prompt(voice, evaluation)
```

### 4b. ChatContext Assembly (line 1315)

```
system: {voice_layer + evaluation_layer}   ← Contains analyst brief
system: [WARMUP PHASE]                     ← Warmup rules
system: [DO NOT SAY ALOUD] Interview       ← Coverage goals, skills, opening move
         Directive
```

**Interview directive** includes: SKILLS TO COVER (Resume: Go, Python... JD: Distributed Systems...), band-specific coverage goals, opening move, band instinct, custom questions block, how to move rules, dry-run questions.

### 4c. CRITICAL `chat_ctx` Rebind (line 1517-1531)

```python
agent = InterviewAgent(instructions=system_prompt, chat_ctx=chat_ctx)
chat_ctx = agent._chat_ctx  # MUST rebind — Agent.__init__ COPIES chat_ctx
```

Without rebind, all downstream injections go to the ORPHANED original.

---

## 5. Topic Pool & Active Topic Initialization

### 5a. `_build_topic_pools()` (line 1594)

**Resume topics** (band-capped): fresher=10, mid=8, experienced=6, senior=4
- Fresher: projects first → work history
- Others: work history first → projects
- Full strings: `"Title - Description [tech1, tech2]"`

**Skill topics** (band-capped): fresher=12, mid=10, experienced=7, senior=5
- Resume skills first, then JD-only skills
- Filter out sentence-style JD "requirements" (verbs like "build", "design", "develop")

**`_skill_source_by_key`**: `"go": "resume_skill"`, `"distributed systems": "jd_skill"`

### 5b. `_ordered_topics()` (line 1703)

**Anchor → Other resume/work-history → Skills (resume first, then JD-only)**

### 5c. `_next_uncovered_topic()` (line 1715)

Returns first topic NOT in `_covered_topic_keys`, NOT in `_denied_topics`, NOT overlapping a covered topic.

**Topic overlap detection** (`_topics_overlap`, line 1843):
- Jaccard similarity ≥ 0.6 OR
- Title containment (≥2 shared tokens, ≥60% of title in other's sig) OR
- Role↔project pair detection

### 5d. Topic Short Key

```
"Payment Gateway Migration - Led migration... [Go, Kafka]" → "payment gateway migration"
```

Used for coverage dedup only. Full string is what the LLM sees.

---

## 6. Session Start & Greeting Delivery

### 6a. Wait for Participant (5 min timeout)

```python
participant = await wait_for_human_participant(max_wait_seconds=300)
```

If nobody joins → records NO_SHOW, exits.

### 6b. Launch Prereqs Signal

Sends `{type: "launch_prereqs_ready"}` data message → frontend enables "Start" button.

### 6c. Greeting Delivery (3 retries)

```python
await session.say(welcome_text, allow_interruptions=False)
```

Scripted speech (bypasses LLM). Retries on transport errors. Fails open.

### 6d. 20-min Timer Starts

```python
_interview_timer_start = time.monotonic()
session_start_time = time.time()
```

Covers greeting + warmup + interview together.

### 6e. Phase Status Injected

```
[PHASE_STATUS] GREETING: DONE. CURRENT PHASE: WARMUP
```

---

## 7. Warmup Phase

### 7a. Agent Speaks Warmup

LLM generates: "Good to hear. I'll be conducting your interview for {role}. Are you ready to begin?"

**Rules**: 2 sentences max. No resume/skills/projects. React to candidate's mood.

### 7b. Candidate Answers (Turn 2+) → Warmup Complete

```python
warmup_complete = True
_awaiting_first_interview_question = True
```

Phase status updated: `CURRENT PHASE: INTERVIEW — ask your first interview question on: {anchor}`

### 7c. Warmup Turns Zero-Scored

Recorded as placeholders with all scores=0, `is_warmup=True`. Don't pollute averages.

---

## 8. Per-Turn Eval Loop (The Core)

### 8a. Entry

Candidate speaks → LiveKit fires `conversation_item_added` (user role) → `on_user_turn_completed` → `_handle_completed_user_turn` → `_process_user_conversation_item()`

### 8b. STT Cleanup (`_clean_stt_text`, line 178)

- Removes "candidate response unavailable" markers
- Drops consonant-only fragments (≤2 chars, no vowels)
- Collapses immediate duplicates ("name name" → "name")

### 8c. Spam/Hallucination Filters

| Filter | Threshold |
|--------|-----------|
| Greeting echo | 15s window, match `^(hi|hello|hey|okay...)$` or ≤2 words |
| STT spam | ≥10 words with ≤3 unique → discard |
| Low diversity | ≥4 words with ≤35% unique → discard |
| Tiny fragment | ≤2 words AND not meaningful short answer → discard |

**Meaningful short answers preserved**: "yes", "no", "yeah", "ok", "sure", "nothing", "pass", "skip", "i don't know", "i can't say", etc.

### 8d. Pre-Eval Utterance Classification

**REPEAT_REQUEST**: candidate says "can you repeat", "say that again" (<12 words)
→ Injects `DECISION: REPEAT_QUESTION` directive, skips eval.

**EXPLICIT_DENIAL**: candidate says "I don't remember", "I didn't do", "I forgot" (<15 words)
→ Marks topic in `_denied_topics`, fires `resume_claim_denied` signal if it's a resume claim, falls through to eval (which scores zero).

### 8e. Meta-Question Handling

Intents detected: `repeat`, `company`, `role`, `tool_choice`, `skip`, `process`
→ Injects `[META_QUESTION_DIRECTIVE]`, zero-score entry, skips eval.
For `skip`: immediately marks topic covered + denied, moves to next.

### 8f. Eval Gate

```python
_can_eval_turn = warmup_complete AND turn > 2 AND has_question AND first_question_asked
```

### 8g. MOVE_ON Race Guard

```python
if agent._move_on_opener_pending:
    # Skip this eval — opener hasn't been spoken yet
    agent._move_on_opener_pending = False
    return
```

### 8h. Eval Pipeline (`run_eval_and_build_directive`, eval_pipeline.py:344)

1. **TopicState** restoration or creation with band-aware saturation thresholds

2. **Scoring** via `run_turn_evaluation()` (8s LLM call, 10s outer timeout):
   - `evaluate_answer()` → clarity, depth, specificity, grounding, overall (0-10)
   - Behavioral signal detection (ownership_ambiguity, follow_up_collapse, etc.)
   - On timeout: recovery scores (2, 1, 1, 1, overall=~1.5) + PROBE

3. **Saturation** via `evaluate_topic_saturation()`:
   - Weighted = clarity×0.20 + depth×0.35 + specificity×0.30 + grounding×0.15
   - Contribution = min(3.5, max(0, (weighted - 2.0) / 8.0 × 3.5))
   - Signal penalties: `follow_up_collapse` (-0.3), `ownership_ambiguity` (-0.3), `strong_under_pressure` (+0.5)
   - Total = base_turn_credit (if contribution > 0) + contribution + signal_modifier

**Saturation thresholds by band**:

| Band | CRITICAL (anchor) | HIGH (other projects) | MEDIUM (skills) | LOW |
|------|-------------------|----------------------|-----------------|-----|
| fresher | 5.5 | 5.0 | 5.0 | 2.5 |
| mid | 7.0 | 5.5 | 4.0 | 3.0 |
| experienced | 9.0 | 7.0 | 5.0 | 3.5 |
| senior | 11.0 | 8.5 | 6.0 | 4.0 |

4. **Dry topic**: consecutive_low_yield ≥ dry_topic_cap (2 for fresher, 3 for others) → drain

5. **Weak exit**: After progress_check_turns (3), if far below threshold × progress_check_pct

### 8i. Agent Action Decision (line 2756)

```python
_action = "PROBE"  # Default
if _depth_decay or _weak_exit or _is_saturated or _dry_topic:
    _action = "MOVE_ON"
elif _action_from_eval == "MOVE_ON":
    _action = "MOVE_ON"
```

**Order matters**: Saturation signals override eval's LLM judge.

### 8j. Skill Auto-Cover During Interview (line 2799)

When on a project topic, if candidate gives substantive answer (clarity+depth ≥ 4) AND mentions a resume skill near (within ±40 chars) a technical context word ("built", "used", "implemented", etc.) → auto-cover that skill word-bounded.

### 8k. JD Skill Disclaim Override (line 2887)

If current topic is JD-only AND candidate disclaims ("never used", "no experience") → override PROBE → MOVE_ON.

---

## 9. PROBE Decision (Stay on Topic)

### 9a. Probe Families

Selected by eval signal routing:
- **ownership** — who built it, what was theirs
- **depth** — numbers, tradeoffs, constraints
- **authenticity** — real memory vs rehearsed
- **pressure** — mistakes, judgment calls
- **clarification** — inconsistencies
- **reflection** — closing question (max 2 per session)
- **specificity, closing, skill_claim, continuation, meta_question**
- **normal** — sentinel: "Topic sufficiently covered. Move on."

Each family has rotating `goals[]` — same signal produces different angles via `rotation_index`.

### 9b. Closing Tier Detection

Fires when: resume project, ≥2 follow-ups, saturation ≥60%, not yet fired on topic, <2 session-wide.
Forces `reflection` family — reflective closing question.

### 9c. `build_probe_directive()` Output

```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: PROBE
FAMILY: depth
Active Topic: Payment Gateway Migration
TOPIC DEPTH: ESTABLISHED
PROBE GOAL: Push past the claim — get the real tradeoff...
```

---

## 10. MOVE_ON Decision (Switch Topic)

### 10a. Mark Old Topic Covered

```python
_mark_topic_covered(_old_topic)  # → _covered_topic_keys
```

### 10b. Auto-Cover Overlapping Topics

Uses `_topics_overlap()` to find project↔role duplicates and mark them covered.

### 10c. Auto-Cover Skills from [tech] Tags

Parses `[Go, PostgreSQL, Kafka, Docker]` from the closed project → marks those resume skills covered.
Only fires if project had substantive content (saturation ≥ 1.5, not denied).

### 10d. Pick Next Topic

```python
_next_topic = _next_uncovered_topic(exclude=_old_topic)
```

### 10e. Secondary Phase Check

If `_next_topic is None` and time remains (> 45s + 120s = 165s) → secondary phase.

### 10f. Wrap-Up Check

If `_next_topic is None` and secondary exhausted → `DECISION: WRAP_UP`.

### 10g. Source Determination

```python
_src = _skill_source_by_key.get(topic_key, "resume_project")
```

Determines question phrasing.

### 10h. Cross-Reference Rules

**Resume skill**: 5 categories — mechanic, pitfall, tradeoff, debugging, internals. Probe real depth.
**JD skill**: Stay applied. If no → acknowledge, move on. If yes → ask what they did.
**Resume project**: Simple — probe new angle, don't re-open covered.

### 10i. `_generate_move_on_directive()` (line 364)

Calls GPT-4.1-mini with:
- System: Write MOVE_ON directive with DECISION, TOPIC, WHAT WE KNOW, OPENING ANGLE, SUGGESTED OPENING QUESTION
- User: BAND, OLD TOPIC, NEW TOPIC + FULL CONTEXT, SOURCE, ANALYST BRIEF CONTEXT NEAR TOPIC, ANGLE GUIDANCE

**Brief context extraction** (line 397): Searches LLM brief for topic's title, grabs ±1 to +6 lines.

**Fallback**: `_build_move_on_question()` — rule-based from templates.

### 10j. TOPIC_LOCK Injection

```
[TOPIC_LOCK - CRITICAL INSTRUCTION]
PREVIOUS TOPIC IS CLOSED.
NEW ACTIVE TOPIC: {title}
FULL CONTEXT: {full_string}
{attribution_guard}  # Standalone projects: never attach company
{source_lock}        # JD skill: don't say "you mentioned on resume"
```

### 10k. One-Shot Guard

```python
agent._move_on_opener_pending = True
```

Next eval cycle skips itself so opener fires before stale probe.

### 10l. Chat History Strip (in llm_node, line 702)

```python
if _has_moveon:
    _ctx_items[:] = [m for m in _ctx_items if m.role == "system"]
    # ALL user+assistant messages removed
```

LLM generates from ONLY system messages on topic switch.

---

## 11. LLM Gate & Question Generation

### 11a. Gate Pattern

```
Candidate answers → _waiting_for_eval=True, _directive_ready.clear()
→ Eval runs → directive injected into chat_ctx
→ _waiting_for_eval=False, _directive_ready.set()
→ llm_node unblocks → LLM generates
```

### 11b. `llm_node()` (line 633)

1. Wait for directive (12s timeout)
2. On timeout → `DECISION: RECOVER_GATE_TIMEOUT` → "Take your time — I'm listening."
3. MOVE_ON strip → remove all user/assistant messages
4. Temperature selection
5. Generate with 30s LLM timeout override

### 11c. `tts_node()` (line 740)

- Sentence-boundary streaming on `[.!?]\s+`
- Text transforms: `filter_emoji` → `_tts_acronym_transform` → `_single_question_transform`
- 25s timeout (Sarvam WS)

### 11d. First Question Sealing (line 3541)

```python
_first_interview_question_asked = True
[PHASE_STATUS] GREETING: DONE. WARMUP: DONE. OPENING QUESTION: DONE.
# Pre-clear LLM gate for Turn 3
agent._waiting_for_eval = True
agent._directive_ready.clear()
```

### 11e. Topic Guard (line 3430)

Checks if Ishitha's question is actually about the active topic. If it drifts to a different pooled topic → score under "general" to protect wrong topic's saturation.

---

## 12. Secondary Phase (Topics Exhausted)

### 12a. `_select_secondary_topic()` (line 1800)

Tries IN ORDER:

**1. Deepen** — strongest answered resume project (highest saturation, ≥2.0, not yet deepened)
**2. JD Scenario** — next un-asked JD must-have skill, turned into situational question
**3. Soft question** — from a pool of 5 warm wind-down questions

### 12b. Secondary Directives

Each phase has specialized instructions:
- **deepen**: "Go DEEPER — real tradeoff, what broke, what they'd change"
- **jd_scenario**: "Turn into REAL situational question, not 'have you used X?'"
- **soft**: "Warm, low-pressure. Keep conversation alive."

### 12c. Phase Tracking

`_deepened_topic_keys`, `_jd_scenarios_asked`, `_soft_questions_asked` — all one-shot per session.

---

## 13. Interview End Conditions

### 13a. Three Exit Paths

| Path | Trigger | How |
|------|---------|-----|
| Candidate ends | Frontend sends `{type: "interview_finished"}` | Sets events, exits loop |
| Time expires | `remaining <= 0` | Agent says goodbye, sends signal |
| Inactivity | 50s → warning → 60s → end | Agent says goodbye, terminates |

### 13b. Final Window (45s)

```
[SYSTEM ALERT: FINAL WINDOW] Less than 45 seconds remain.
Do not ask any new questions. Briefly wrap up.
```

### 13c. Time Guard (20s)

Blocks eval + signals. Agent says goodbye (interrupts if speaking).

### 13d. Inactivity Timeline

| Time | Action |
|------|--------|
| 10s | "Take a moment, {name}." |
| 20s | "If it helps, you can think out loud." |
| 30s | "Still with me? A rough answer is fine." |
| 50s | Warning: "I'll wrap up in 10s if no response." |
| 60s | "I'll end the interview here. Thank you." |

### 13e. Custom Question Reminders

- **75% time**: Reminder if any still unasked
- **<60s**: URGENT reminder "Ask NOW"

### 13f. Assistant Double-Fire Block

Prevents STT echo from triggering a second LLM generation before candidate replies.

---

## 14. Post-Interview Persistence

### 14a. Save Order

```
1. persist_transcript(proctoring_data, final_status="COMPLETED")
2. persist_answer_scores()
3. update_interview_status("COMPLETED")   ← Prevents re-dispatch
4. persist_org_usage_metrics()
5. generate_interview_report()             ← LangGraph, 3 parallel LLM calls
6. generate_interview_summary()
7. persist_org_manual_billing_usage()      ← Eval/brief/directive usage
8. persist_interview_billing_snapshot()
9. flush_pending_manual_billing()
10. notify_sync_engine("session_end")
```

### 14b. Trust Engine Finalization

```python
_trust_state = finalize_trust_state(_trust_state)
recruiter_summary = build_recruiter_summary(
    trust_state, answer_scores, total_turns, ...)
# Output: recommendation, trust_score, integrity_band, quality_band, trend
```

### 14c. Background Task Cleanup

All pending tasks cancelled, session drained.

---

## 15. Edge Cases Reference

| # | Edge Case | Guard Location | Mechanism |
|---|-----------|----------------|-----------|
| 1 | Agent re-dispatch | line 1034 + line 4136 | Status check + early COMPLETED update |
| 2 | Duplicate agent in room | line 934 | Pre-connect identity check → self-destruct |
| 3 | Greeting TTS failure | line 3768 | 3 retries → fail open |
| 4 | LLM gate timeout (12s) | line 657 | RECOVER_GATE_TIMEOUT directive |
| 5 | Eval timeout (10s) | eval_pipeline:469 | Recovery scores + PROBE |
| 6 | STT echo/hallucination | line 2271 | Greeting echo suppression + spam/diversity filters |
| 7 | Topic overlap (project↔role) | line 1843 + 1889 + 1715 | Jaccard + title containment + auto-cover |
| 8 | Candidate disconnect (transient) | line 2088 | 5s grace window for reconnect |
| 9 | Candidate disconnect (permanent) | line 2070 | disconnect_event.set() → exit |
| 10 | Candidate never joins (5 min) | line 3708 | NO_SHOW transcript + exit |
| 11 | Denied topic re-attempt | line 1739 | _denied_topics checked in _next_uncovered_topic |
| 12 | Dry topic (consecutive low-yield) | eval_pipeline:137 | dry_topic_cap forces MOVE_ON |
| 13 | JD skill disclaim | line 2887 | Override PROBE → MOVE_ON |
| 14 | LLM drift (wrong topic) | line 3440 | Topic guard → score under "general" |
| 15 | Custom Q not asked | line 3900 + 3932 | 75% + <60s reminders |
| 16 | MOVE_ON / PROBE race | line 2693 + 3246 | _move_on_opener_pending one-shot skip |
| 17 | chat_ctx orphaned | line 1531 | MUST rebind after Agent.__init__ |
| 18 | Background task failure | line 949 | spawn_background_task catches + logs errors |
| 19 | No candidate text turn | line 3328 | Release gate without directive |
| 20 | Consecutive assistant turn | line 3394 | Hard block in conversation_item_added |
| 21 | Standalone project attribution | line 421 | [standalone] marker → attribution guard |
| 22 | JD-only skill resume-claim phrasing | line 525 | Generated directive validated with regex |
