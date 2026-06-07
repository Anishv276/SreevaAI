# HR Interview Platform — Codebase Guide for Claude

## Architecture Overview

Full-stack AI interview platform. Frontend: Next.js (TypeScript). Backend: Python LiveKit agent. Queue: BullMQ on Redis. DB: PostgreSQL via Prisma. Storage: S3.

---

## Interview Flow: "Begin Interview" → End

### 1. Frontend — Candidate Clicks "Begin Interview"

- UI calls `/api/candidates/[id]/route.ts` (or similar admin-side API) to create/fetch the application.
- The API dispatches a BullMQ job to `worker.ts` (queue: `interview-start`).
- The frontend opens a LiveKit room (room name = `interview_<app_id>`).
- It waits for the `launch_prereqs_ready` LiveKit data message from the agent before enabling the "Start" button.

### 2. worker.ts — Job Processing

File: `worker.ts`

- BullMQ Worker listens on Redis (`REDIS_URL` env var, external Redis at `31.97.60.216:32768` in prod).
- On `interview-start` job: calls LiveKit API to **dispatch an agent** to the room `interview_<app_id>`.
- Also handles: resume uploads, JD extraction (OpenAI), Pinecone corpus sync, recording retention, drive batch operations.

### 3. Python Agent — `entrypoint()` in `interview/agent_runtime.py`

Entry: `entrypoint(ctx: JobContext)` — called by LiveKit when agent is dispatched.

#### 3a. Startup (parallel)
```
DB fetch (get_interview_context)  +  LiveKit room connect  →  run concurrently
```
- Fetches candidate row: `fullName`, `jobTitle`, `language`, `voiceId`, `resumeData`, `extractedDetails`, `interviewQuestions`, `proctoringSignals`.
- GUARD: if `interviewStatus` is already `COMPLETED/NO_SHOW/ABANDONED` → exits immediately (prevents re-dispatch).
- Checks no other agent is already in the room.

#### 3b. Session Preparation
- Parses `resumeData` → `ResumeContext` (projects, work history, skills, internships, education).
- Infers **candidate band**: `fresher | mid | experienced | senior` based on resume.
- Builds **topic pools**:
  - `_resume_topics_pool`: projects + work_history + internships (full "Title - Description [tech]" strings)
  - `_skill_topics_pool`: resume skills + JD-only skills
  - `_skill_source_by_key`: maps each skill key → `resume_skill` or `jd_skill`
- Sets `_active_topic` = anchor item (most recent/relevant project).
- Generates **LLM analyst brief** (GPT-4.1-mini): a structured read on the candidate's resume vs JD.
- Builds system prompt via `build_system_prompt()` → combines voice layer + evaluation layer.
- Initializes `InterviewAgent` (extends LiveKit `Agent`) with chat_ctx.
- Re-binds `chat_ctx = agent._chat_ctx` (CRITICAL: prevents orphaned context bug).

#### 3c. Providers
- **LLM**: GPT-4.1-mini (`INTERVIEW_LLM_MODEL`), temperature from `INTERVIEW_TEMPERATURE`.
- **STT**: Deepgram Flux (`flux-general-en` for English, `flux-general-multi` for non-English language sessions).
- **TTS**: Cartesia / ElevenLabs / Sarvam (from `voiceId`/`voiceProvider` in DB, VOICE_REGISTRY lookup).
- **VAD**: Silero ONNX (prewarmed in `prewarm()`).

---

### 4. Interview Phases

#### Phase 1: GREETING (Turn 1)
- Agent speaks `build_greeting_text()`: `"Hi {name}, I'm {ai_name}. How are you doing?"`
- Blocks all STT until greeting TTS is fully delivered (`greeting_delivered_at`).
- Sends `launch_prereqs_ready` data message to frontend.

#### Phase 2: WARMUP (Turn 2)
System message: `build_warmup_directive()` — tells agent to:
1. React to candidate's "how are you doing" response.
2. Mention they'll conduct the `{role}` interview.
3. Ask "Are you ready to begin?"

- `warmup_complete = False` until candidate answers (turn ≥ 2).
- When candidate answers warmup → `warmup_complete = True`, `_awaiting_first_interview_question = True`.

#### Phase 3: INTERVIEW (Turns 3+)
System messages:
- `build_interview_directive()`: full 20-min plan (coverage goals, skills block, custom questions, HOW TO MOVE).
- `[PHASE_STATUS]`: seals greeting/warmup so agent can't re-introduce itself.

**Topic order** (from `_ordered_topics()`):
1. Anchor (most recent/relevant project) — FIRST
2. Other resume projects + work history
3. Resume skills + JD-required skills

---

### 5. Per-Turn Eval Loop (Every Candidate Answer)

File: `interview/agent_runtime.py` → `_process_user_conversation_item()`

Triggered by `session.on("conversation_item_added")` when `role == "user"`.

#### Step A: STT cleanup
- `_clean_stt_text()`: removes noise, collapses duplicates.
- Suppresses hallucinations (10+ words, ≤3 unique → discard).
- Suppresses greeting-echo fragments (early turns).

#### Step B: Transcript persistence
- `append_transcript_line("Candidate", content)` → local list.
- `persist_transcript(app_id, ...)` → background task.

#### Step C: Pre-eval classifiers
- **REPEAT_REQUEST**: candidate says "repeat that" / "didn't hear" → inject `DECISION: REPEAT_QUESTION` directive → skip eval.
- **EXPLICIT_DENIAL**: "I don't remember", "I don't know" → mark topic denied, still run eval (scores 0).

#### Step D: LLM gate (llm_node)
- `agent._waiting_for_eval = True`, `agent._directive_ready.clear()` — blocks LLM until directive is ready.
- `llm_node()` waits up to 5s for `_directive_ready` event.

#### Step E: Eval pipeline
File: `interview/eval_pipeline.py` → `run_eval_and_build_directive(payload, client)`

Payload includes: `answer`, `question`, `transcript_lines[-12:]`, `active_topic`, `active_topic_state`, `band`, `score_history`, `topic_score_history`, `signal_toggles`, `remaining_seconds`.

**eval_pipeline does:**
1. `evaluate_answer()` (`agent_scoring.py`): scores on `clarity`, `depth`, `specificity`, `grounding` (0-10 each), `overall`.
2. `run_turn_evaluation()` (`turn_evaluator.py`): detects behavioral signals.
3. Calculates **topic saturation** via `TopicState` — band-aware thresholds.
4. Returns: `action (PROBE|MOVE_ON)`, `probe_family`, `saturation`, `quality_record`, `signal_events`.

**Saturation thresholds** (from `eval_pipeline.py`):
```
fresher:    CRITICAL=5.5, HIGH=5.0, MEDIUM=5.0, LOW=2.5
mid:        CRITICAL=7.0, HIGH=5.5, MEDIUM=4.0, LOW=3.0
experienced:CRITICAL=9.0, HIGH=7.0, MEDIUM=5.0, LOW=3.5
senior:     CRITICAL=11.0,HIGH=8.5, MEDIUM=6.0, LOW=4.0
```

#### Step F: Agent decision logic
Agent (not eval) makes final PROBE/MOVE_ON call:
```python
if _depth_decay or _weak_exit or _is_saturated:
    _action = "MOVE_ON"
elif _action_from_eval == "MOVE_ON":
    _action = "MOVE_ON"
else:
    _action = "PROBE"
```

#### Step G: Directive injection

**If PROBE** → `build_probe_directive()` (`probe_strategy.py`):
- Families: `ownership`, `depth`, `clarification`, `specificity`, `pressure`, `reflection`, `closing`, `skill_claim`, `continuation`, `meta_question`.
- Each family has rotating `goals[]` so same signal produces varied question angles.
- Injected as `[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]` system message.

**If MOVE_ON**:
1. `_mark_topic_covered(_old_topic)` → adds to `_covered_topic_keys`.
2. Auto-covers resume skills from project `[tech]` brackets.
3. `_next_uncovered_topic()` → picks next topic.
4. If all covered → inject `DECISION: WRAP_UP` directive.
5. Else → `_generate_move_on_directive()` (LLM-generated, falls back to rule-based).
6. Injects `[NEXT_TURN_DIRECTIVE]` + `[TOPIC_LOCK]` system messages.
7. Sets `agent._move_on_opener_pending = True` (skips one eval cycle so opener fires cleanly).

#### Step H: LLM gate released
`agent._waiting_for_eval = False`, `agent._directive_ready.set()` → `llm_node()` unblocks and generates response.

---

### 6. LLM Generation (`llm_node` in InterviewAgent)

- Reads from `agent._chat_ctx` (mutable, live context — NOT `agent.chat_ctx` which is read-only).
- If MOVE_ON: strips all user+assistant messages from context (only system messages remain) so LLM opens new topic cleanly.
- Temperature selection: `_select_turn_temperature()` — reads latest system message markers.
- Streams via OpenAI with 30s timeout (prevents httpcore.ReadTimeout mid-stream).

---

### 7. TTS (`tts_node` in InterviewAgent)

- Sentence-boundary streaming: splits on `[.?!]\s+`, pushes sentences to TTS WS stream.
- Text transforms (applied before TTS): `filter_emoji`, `_tts_acronym_transform`, `_single_question_transform`.
- Providers: Cartesia (default), ElevenLabs, Sarvam. Each in streaming mode.
- 25s timeout (Sarvam WS can take up to 25s).

---

### 8. Interview End Conditions

Three exit paths:

1. **Candidate clicks "End"**: frontend sends `{type: "interview_finished"}` data message → `interview_marked_finished = True`, `interview_finished_event.set()`.
2. **Time expires** (`FIXED_INTERVIEW_DURATION_MINUTES`): agent says goodbye, sends `interview_terminated` signal.
3. **Inactivity** (50s silence): agent sends nudges → warning → ends call.

**Final 45s**: `[SYSTEM ALERT: FINAL WINDOW]` → agent wraps up, no new questions.
**Final 20s** (`TIME_GUARD_SECS`): eval blocked, goodbye delivered.

---

### 9. Post-Interview Persistence

After session ends (in `entrypoint()` after the main loop):

1. `persist_transcript()` → final save with `proctoring_data`, `final_status="COMPLETED"`.
2. `persist_answer_scores()` → all scored turns.
3. `update_interview_status(app_id)` → marks `COMPLETED` in DB.
4. `persist_org_usage_metrics()` → LLM/TTS/STT usage.
5. **Background task** `_run_report_and_summary()`:
   - `generate_interview_report()` (LangGraph StateGraph: 3 parallel LLM calls) → AI scorecard.
   - `generate_interview_summary()` → brief summary text.
6. `persist_interview_billing_snapshot()` → billing record.
7. `flush_pending_manual_billing()` → any deferred billing.

---

## Key Files

| File | Role |
|------|------|
| `interview/agent_runtime.py` | Main agent: `entrypoint()`, `InterviewAgent`, per-turn eval loop (~3700 lines) |
| `interview/interview_phases.py` | `build_greeting_text()`, `build_warmup_directive()`, `build_interview_directive()` |
| `interview/prompt_layers.py` | `build_voice_layer_prompt()`, `build_evaluation_layer_prompt()`, `build_system_prompt()` |
| `interview/eval_pipeline.py` | `run_eval_and_build_directive()`, `TopicState`, saturation logic |
| `interview/agent_scoring.py` | `evaluate_answer()`, signal detection, `notify_sync_engine()` |
| `interview/probe_strategy.py` | `_PROBE_FAMILIES` dict, `build_probe_directive()` |
| `interview/agent_persistence.py` | DB layer: transcript, scores, report, summary, billing (LangGraph-based report) |
| `interview/agent_profile_context.py` | `infer_candidate_band()`, `build_resume_brief()`, `generate_llm_brief()` |
| `interview/agent_providers.py` | `build_llm()`, `build_stt()`, `build_cartesia_tts()`, etc. |
| `interview/trust_engine.py` | `apply_turn_decision()`, `finalize_trust_state()` |
| `interview/session_state.py` | `init_trust_state()` |
| `interview/recruiter_summary.py` | `build_recruiter_summary()` → recommendation + trust score |
| `interview/turn_evaluator.py` | `run_turn_evaluation()` → behavioral signal detection |
| `interview/agent_runtime_helpers.py` | `_build_recent_context_block()`, `sanitize_candidate_facing_text()`, STT helpers |
| `interview/agent_runtime_support.py` | Constants: `INTERVIEW_LLM_MODEL`, `EVAL_LLM_MODEL`, `VOICE_REGISTRY`, `STT_MODEL` |
| `worker.ts` | BullMQ worker: agent dispatch, resume processing, JD extraction |
| `behavioral_analysis.py` | `generate_signal_analysis()` → proctoring signal narrative for HR |

---

## Critical Architecture Notes

### chat_ctx rebind (MOVE_ON root cause fix)
```python
agent = InterviewAgent(instructions=system_prompt, chat_ctx=chat_ctx)
chat_ctx = agent._chat_ctx  # MUST rebind — Agent.__init__ copies chat_ctx, orphaning original
```
All downstream injections (NEXT_TURN_DIRECTIVE, TOPIC_LOCK) must target `agent._chat_ctx`.

### LLM gate pattern
```
Candidate answers → _waiting_for_eval=True, _directive_ready.clear()
→ eval runs → directive injected into chat_ctx
→ _waiting_for_eval=False, _directive_ready.set()
→ llm_node unblocks → LLM generates
```
Timeout: 5s. On timeout: injects `DECISION: RECOVER_GATE_TIMEOUT` fallback directive.

### MOVE_ON guard (one-shot skip)
`agent._move_on_opener_pending = True` → next eval cycle is skipped so the queued opener fires before any PROBE directive can overwrite it.

### Topic string formats
- **Full context string**: `"Title - Description [tech1, tech2]"` — passed to LLM for grounded questions.
- **Short key**: `title.split(" - ")[0].strip().lower()` — used for coverage dedup, NOT for LLM.
- `_covered_topic_keys`: set of short keys of finished topics.

### Eval doesn't pick topics
Eval scores the CURRENT topic only. Agent owns all topic selection and directive building.

### Signal toggles
`proctoringSignals` JSON in DB → `_EvalSignalToggles` Pydantic model → `evaluation_signal_toggles` dict.
Plan-gated signals (tab_switch, face_absence, etc.) are toggled here. Always-on signals (ownership_ambiguity, depth_decay, etc.) always run.

### Production Redis
External Redis at `31.97.60.216:32768` (authenticated). Do NOT use internal `redis:6379`.

---

## Prompt Layer Stack (system messages in chat_ctx)

1. **Voice layer** (`build_voice_layer_prompt`): who Ishita is, band-aware tone, org context.
2. **Evaluation layer** (`build_evaluation_layer_prompt`): analyst brief, live coverage context.
3. **[WARMUP PHASE]**: warmup-specific rules (removed after warmup complete).
4. **[Interview Directive]**: `build_interview_directive()` — coverage plan, skills block, custom questions.
5. **[PHASE_STATUS]**: seals each completed phase.
6. **[RECENT_CONTEXT]**: last Q&A pair for follow-up grounding (refreshed each turn).
7. **[NEXT_TURN_DIRECTIVE]**: PROBE or MOVE_ON decision for THIS turn (refreshed each turn).
8. **[TOPIC_LOCK]**: on MOVE_ON — enforces new topic, forbids referencing old one.
