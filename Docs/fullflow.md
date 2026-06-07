# Full Interview Flow — End to End

## What comes in

**DB row** (from `get_interview_context()` in `agent_persistence.py`):

```
fullName        → candidate's full name
resumeData      → structured JSON (projects, work_history, skills, education, ...)
resumeText      → raw resume text (fallback)
extractedDetails → JD JSON (role, skills, requirements, ...)
interviewQuestions → custom questions list (JSON string)
proctoringSignals  → which proctoring signals are ON/OFF for this org
voiceId / voiceProvider / voiceModel → TTS voice config
deepgramModel   → STT model (default: nova-3)
orgId / orgName / orgLocation
driveLocation   → location tag for the job
aiName          → interviewer AI name (default: Ishitha)
language        → interview language (English, Hindi, etc.)
interviewStatus → PENDING / COMPLETED / etc. (guard against re-dispatch)
```

LLM model is always `INTERVIEW_LLM_MODEL` (GPT-4.1-mini). Not fetched from DB.

---

## Step 1 — Agent dispatched

`worker.ts` picks up a `interview-start` BullMQ job from Redis and calls the LiveKit Dispatch API to send the Python agent to room `interview_<app_id>`.

---

## Step 2 — Agent startup (`entrypoint()` in `agent_runtime.py`)

### 2a. Parallel boot
- Room connect (3 retries) + DB fetch run **concurrently**.
- Guard: if `interviewStatus` is COMPLETED / NO_SHOW / ABANDONED → exit immediately.
- Guard: if another agent is already in the room → exit immediately.

### 2b. Parse inputs

**Resume:**
```
resumeData (JSON)
  └─ parse_resume_context()         → ResumeContext
       ├─ projects    [list of "Title - Description [tech] [standalone]" or "(at Company)"]
       ├─ work_history [list of "Role - Company (duration)"]
       ├─ internships  [same format, merged into work_history for dedup]
       ├─ skills       [list of skill name strings]
       └─ education, hobbies, ownership_risks
```

**JD:**
```
extractedDetails (JSON)
  └─ _build_jd_from_extracted()     → structured dict
       └─ skills, requirements, role, summary, etc.
```

**Proctoring signals:**
```
proctoringSignals (JSON from DB)
  └─ _EvalSignalToggles             → dict of booleans
       Only plan-gated signals: tab_switch, face_absence, camera_disabled,
       microphone_disabled, connection_lost, multiple_faces, identity_mismatch,
       latency_mismatch, complexity_latency_mismatch
       Always-on eval signals (depth_decay, ownership_ambiguity, etc.) are NOT in here.
```

**Custom questions:**
```
interviewQuestions (JSON string)
  └─ list of CustomQuestion(raw, normalized, asked=False)
```

### 2c. Band inference + resume brief

```
ResumeContext
  └─ infer_candidate_band()    → "fresher" | "mid" | "experienced" | "senior"
  └─ build_resume_brief()      → ResumeBrief
       ├─ anchor_item    (most recent / relevant project or work role)
       ├─ anchor_type    ("project" | "work_history")
       ├─ projects       (formatted list)
       ├─ work_history   (formatted list)
       ├─ skills         (list)
       └─ internships    (list)
```

### 2d. LLM analyst brief (GPT-4.1-mini)

Generated once at startup. Gives the agent a structured read on:
- Candidate's strongest signal
- Opening angle (band-aware, ONE question, no compound)
- Skills gap vs JD
- Ownership risk flags
- What to probe vs what to skip

Falls back to rule-based brief if LLM call fails.

### 2e. Topic pools

```
_build_topic_pools()
  ├─ _resume_topics_pool   → full "Title - Description [tech]" strings
  │    fresher:  projects first, then work history
  │    mid+:     work history first, then projects
  │    (capped by band: fresher=10, mid=8, experienced=6, senior=4)
  │
  ├─ _skill_topics_pool    → skill name strings
  │    resume skills first, then JD-only skills
  │    JD sentence-style entries filtered out (bad_verbs check)
  │    (capped: fresher=12, mid=10, experienced=7, senior=5)
  │
  └─ _skill_source_by_key  → {skill_key: "resume_skill" | "jd_skill"}
```

`_active_topic` is initialized to the **anchor item** (full context string).

### 2f. System prompt

Built once from:
1. `build_voice_layer_prompt()` — who Ishita is, band-aware tone, org context
2. `build_evaluation_layer_prompt()` — analyst brief, coverage context, attribution rules
3. `InterviewAgent` initialized with this system prompt + empty `chat_ctx`
4. `chat_ctx = agent._chat_ctx` — **must rebind** (Agent copies context on init, original is orphaned)

---

## Step 3 — Session starts

### Phase 1: GREETING (Turn 1 — AI speaks first)
- Agent speaks `build_greeting_text()`: `"Hi {name}, I'm {ai_name}. How are you doing?"`
- All STT is blocked until greeting TTS finishes (`greeting_delivered_at` set).
- Sends `launch_prereqs_ready` data message → frontend enables the Start button.

**What candidate says:** anything (how they're doing)
**STT processing:** greeting response (turn 1) — short fragments allowed, no noise filters.

### Phase 2: WARMUP (Turn 2)
System message `build_warmup_directive()` injected. Agent must:
1. React to candidate's greeting answer (if they said "how about you?" → MUST answer first).
2. Mention the role they're interviewing for.
3. Ask "Are you ready to begin?"

**STT processing for turn 2:** noise filters and hallucination checks are **skipped entirely** — warmup response is always real speech.

**What candidate says:** yes/ready or similar → `warmup_complete = True`

### Phase 3: INTERVIEW (Turn 3+)
- `build_interview_directive()` injected — band-specific coverage goals, mandatory quota, HOW TO MOVE.
- `[PHASE_STATUS]` seals greeting + warmup — agent can't re-introduce itself.
- `_awaiting_first_interview_question = True` → agent opens with anchor item.

---

## Step 4 — Per-turn eval loop

Triggered by every candidate message (`conversation_item_added`, `role == "user"`).

### A. STT cleanup
`_clean_stt_text()` → basic noise removal, deduplication.

**For turn 2 only:** skip hallucination, low-diversity, and short-fragment checks.
**For all other turns:** full filter chain applies.

### B. Transcript persistence
`append_transcript_line("Candidate", content)` → local list + background DB write.

### C. Pre-eval classifiers

**REPEAT_REQUEST** — candidate says "repeat that", "didn't hear", etc. (< 12 words):
- Saves `0,0,0,0` score placeholder (`is_repeat_request: True`) to answer_scores.
- Injects `DECISION: REPEAT_QUESTION` directive → agent rephrases last question.
- LLM gate released. Return early (no eval).

**EXPLICIT_DENIAL** — "I don't know", "I forgot", "I don't remember", etc.:
- Marks topic as denied in `_denied_topics`.
- Still runs eval (scores 0, forces MOVE_ON after 1 redirect).

**WARMUP_TURN** (turn 2) — before warmup_complete:
- Saves zero-scored warmup placeholder (`is_warmup: True`).
- Sets `warmup_complete = True` after recording.

### D. LLM gate
`agent._waiting_for_eval = True`, `agent._directive_ready.clear()`
→ blocks `llm_node()` until directive is ready (15s timeout).

### E. Eval pipeline (`run_eval_and_build_directive()` in `eval_pipeline.py`)

Input payload:
```
answer, question, transcript_lines[-12:], active_topic,
active_topic_state, band, score_history, topic_score_history,
signal_toggles, remaining_seconds
```

Steps:
1. `evaluate_answer()` → scores: `clarity`, `depth`, `specificity`, `grounding` (0-10 each) + `overall`
2. `run_turn_evaluation()` → behavioral signals (ownership_ambiguity, depth_decay, etc.)
3. `TopicState` saturation check — band-aware thresholds:

| Band | CRITICAL | HIGH | MEDIUM | LOW |
|------|----------|------|--------|-----|
| fresher | 5.5 | 5.0 | 5.0 | 2.5 |
| mid | 7.0 | 5.5 | 4.0 | 3.0 |
| experienced | 9.0 | 7.0 | 5.0 | 3.5 |
| senior | 11.0 | 8.5 | 6.0 | 4.0 |

4. Returns: `action (PROBE|MOVE_ON)`, `probe_family`, `saturation`, `quality_record`, `signal_events`

### F. Agent decision (final PROBE/MOVE_ON call)

```python
if _depth_decay or _weak_exit or _is_saturated:
    _action = "MOVE_ON"
elif _action_from_eval == "MOVE_ON":
    _action = "MOVE_ON"
else:
    _action = "PROBE"
```

### G. Directive injection

**PROBE** → `build_probe_directive()` (probe_strategy.py):
- Families: `ownership`, `depth`, `clarification`, `specificity`, `pressure`, `reflection`,
  `closing`, `skill_claim`, `continuation`, `meta_question`, `redirect`
- Each family has rotating `goals[]` — same signal → varied angles
- If `is_cant_remember` → short-circuit to `redirect` family
- Returns 2-tuple: `(directive_text, probe_family)` — must always be a tuple or ValueError crashes

**MOVE_ON:**
1. `_mark_topic_covered(old_topic)` → add to `_covered_topic_keys`
2. Auto-cover resume skills found in project tech brackets `[tech1, tech2]`
3. `_next_uncovered_topic()` → walk `_ordered_topics()` for next uncovered
4. If all covered → inject `DECISION: WRAP_UP`
5. Else → `_generate_move_on_directive()` (LLM-generated transition + opening Q for new topic)
6. Inject `[NEXT_TURN_DIRECTIVE]` + `[TOPIC_LOCK]`
7. `agent._move_on_opener_pending = True` → skip next eval cycle so opener fires cleanly

### H. LLM gate released
`agent._waiting_for_eval = False`, `agent._directive_ready.set()` → `llm_node()` unblocks.

---

## Step 5 — LLM generation (`llm_node`)

- Reads from `agent._chat_ctx` (mutable, live) — NOT `agent.chat_ctx` (read-only).
- On MOVE_ON: wipes all user+assistant messages, keeps only system messages → clean topic open.
- Temperature selection: `_select_turn_temperature()` reads latest system message markers.
- Streams via OpenAI with 30s timeout.

---

## Step 6 — TTS (`tts_node`)

- Splits on sentence boundaries `[.?!]\s+`, pushes sentences to TTS stream.
- Pre-TTS transforms: filter emoji, acronym expansion, single-question enforcement.
- Providers: Cartesia (default), ElevenLabs, Sarvam (each in streaming mode).
- 25s timeout.

---

## Step 7 — Interview end conditions

| Trigger | What happens |
|---------|-------------|
| Candidate clicks "End" | Frontend sends `{type: "interview_finished"}` data message → `interview_finished_event.set()` |
| Time expires (`FIXED_INTERVIEW_DURATION_MINUTES`) | Agent says goodbye, sends `interview_terminated` signal |
| 50s inactivity | Nudge → warning → end call |

**Final 45s:** `[SYSTEM ALERT: FINAL WINDOW]` injected → agent wraps up, no new questions.
**Final 20s (`TIME_GUARD_SECS`):** eval blocked, goodbye delivered.

---

## Step 8 — Post-interview persistence

After session ends (back in `entrypoint()` after main loop):

1. `persist_transcript()` → final save with `proctoring_data`, `final_status="COMPLETED"`
2. `persist_answer_scores()` → all scored turns (including 0,0,0,0 warmup + repeat placeholders)
3. `update_interview_status(app_id)` → mark `COMPLETED` in DB
4. `persist_org_usage_metrics()` → LLM / TTS / STT usage stats
5. Background: `_run_report_and_summary()`
   - `generate_interview_report()` (LangGraph StateGraph: 3 parallel LLM calls) → AI scorecard
   - `generate_interview_summary()` → brief summary text
6. `persist_interview_billing_snapshot()` → billing record
7. `flush_pending_manual_billing()` → any deferred billing

---

## Band strategy — topic order + depth

| Band | Topic pool order | Phase order | Depth |
|------|-----------------|-------------|-------|
| fresher | projects → work history | projects → skills → work history | 2-3 follow-ups, breadth first |
| mid | work history → projects | anchor + work roles → JD skills | 3-4 follow-ups, balanced |
| experienced | work history → projects | anchor + key roles/projects → JD skills | 4-5 follow-ups, depth over breadth |
| senior | work history → projects | anchor initiative → critical areas → JD skills | 5-6 follow-ups, depth only |

---

## Key state variables

| Variable | Type | What it tracks |
|----------|------|----------------|
| `_active_topic` | str | Full context string for current topic (LLM uses this) |
| `_covered_topic_keys` | set[str] | Short keys of finished topics |
| `_denied_topics` | set[str] | Topics candidate denied / said they don't know |
| `warmup_complete` | bool | False until turn 2 answer processed |
| `_awaiting_first_interview_question` | bool | True after warmup, until first interview Q fired |
| `_move_on_opener_pending` | bool | Skip next eval so queued MOVE_ON opener fires first |
| `answer_scores` | list[dict] | All scored turns including warmup/repeat/denial placeholders |
| `transcript_lines` | list[str] | Full session transcript |
| `_last_interviewer_question` | str | Last Q asked (used for REPEAT_REQUEST replay) |

---

## Prompt layers (in `chat_ctx` at any given turn)

1. **Voice layer** — who Ishita is, tone, org context
2. **Evaluation layer** — analyst brief, coverage context, attribution rules (project ≠ work unless stated)
3. **[WARMUP PHASE]** — warmup rules (removed after warmup complete)
4. **[Interview Directive]** — band-specific coverage plan + skills block + custom questions
5. **[PHASE_STATUS]** — seals completed phases
6. **[RECENT_CONTEXT]** — last Q&A pair (refreshed each turn)
7. **[NEXT_TURN_DIRECTIVE]** — PROBE or MOVE_ON for this turn (refreshed each turn)
8. **[TOPIC_LOCK]** — on MOVE_ON, forbids referencing old topic

---

## Critical rules

- **chat_ctx rebind:** after `InterviewAgent.__init__`, must do `chat_ctx = agent._chat_ctx` — Agent copies context on init, original becomes orphaned.
- **Probe returns 2-tuple:** `build_probe_directive()` must always return `(directive_text, family_str)`. Bare string → `ValueError: too many values to unpack`.
- **LLM gate timeout:** 15s (eval calls GPT which takes 3-8s; 5s was too tight).
- **Topic strings:** full `"Title - Description [tech]"` for LLM context. Short key `title.split(' - ')[0]` for dedup only.
- **Eval signals always on:** `_EvalSignalToggles` only toggles proctoring signals. Eval signals (depth_decay, ownership_ambiguity, etc.) always run.
- **Production Redis:** `31.97.60.216:32768` (external, authenticated). Never use internal `redis:6379`.
