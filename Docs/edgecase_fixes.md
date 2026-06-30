# Edge Case Fixes — Interview Agent

## Status Summary

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | Race conditions + DB persistence blockers | ✅ DONE |
| Phase 2 | Correctness — scoring, eval gate, saturation | 🔲 TODO |
| Phase 3 | MOVE_ON logic, probe quality, UX polish | 🔲 TODO |

---

## Phase 1 — Already Fixed (Reference)

| EC | Issue | Fix |
|----|-------|-----|
| EC-1 | `_topic_states` dict read without lock | Snapshot via `dict(_topic_states)` before iteration |
| EC-2 | `_topic_records.append` without lock | Full MOVE_ON block wrapped in `async with _session_state_lock` |
| EC-3 | `_asked_questions_log` append+pop race | Changed from `list` to `collections.deque(maxlen=6)` — single atomic append |
| EC-4 | `_current_topic_answers` reset race | Append and reset both inside same lock acquisition |
| EC-5 | `_topic_score_histories` write + stale-turn check outside lock | Stale-turn guard moved inside lock; write was already inside |
| EC-7 | `persist_answer_scores` no retry | 3-attempt retry loop with 0.5s/1.0s backoff; raises after all fail |
| EC-8 | `persist_question_by_question_analysis` silently swallows failure | Same retry loop; serialization fails fast before any DB attempt |
| EC-9 | `mark_interview_started` silent fail → duplicate agent | Removed try/except; SQL idempotency guard (`status NOT IN ('IN_PROGRESS','COMPLETED')`); raises on 0 rows updated |
| EC-10 | JSON encoding crash drops all scores | `_SafeJSONEncoder` handles `Decimal`/`datetime`; round-trip validation before DB write |

---

---

# Phase 2 — Correctness Fixes

> **Goal:** Scoring produces meaningful, non-corrupted output for every interview path.
> Fix all of these before analyzing pilot interview reports.

---

## EC-12 — Greeting used as resolved question for scoring

**File:** `interview/agent_runtime.py` ~line 2434–2448

**Problem:**
When building the eval payload, `resolved_question` is derived by walking backwards through the transcript to find the last interviewer question. If all recent lines are short greetings ("How are you?", "All good?"), the resolved question stays as a `<16` character string. The LLM then scores the candidate's answer against a meaningless question like "Great!" — signal detection is completely wrong, scores are meaningless, saturation math is corrupted.

**Real example:**
```
Turn 2: Interviewer: "All good on your end?"
Turn 3: Candidate: "Yes, I built a Redis caching layer that cut our API latency by 60%"
resolved_question → "All good on your end?"   ← 22 chars but a warmup greeting
LLM scores a detailed Redis answer against a readiness check → clarity=5, depth=5 (inflated)
Topic saturates in 1 turn. Candidate never gets probed on caching properly.
```

**Fix:**
Add a minimum content check when walking back through transcript lines. A valid question must:
- Contain a `?` character, OR be longer than 40 characters
- Not match a list of known warmup phrases: `["all good", "ready to start", "how are you", "can you hear me", "shall we begin"]`

If no valid question is found after walking back 6 lines, **skip eval for that turn** and log:
```
[EVAL_SKIP] turn=3 | no valid question found in last 6 lines — skipping eval to avoid scoring against greeting
```
Do not write a quality record for skipped turns.

---

## EC-13 — `_first_interview_question_asked` flag never set → eval never fires

**File:** `interview/agent_runtime.py` ~line 2396–2409

**Problem:**
The eval gate at line 2396 blocks ALL scoring until `_first_interview_question_asked = True`. This flag is set in the TTS output handler when the first assistant question is delivered and tracked. If the opener delivery silently fails (TTS error, connection drop, LLM produces a non-question response), the flag stays `False` forever. The entire interview runs without any scoring. All topics default-probe with no signal. The report is empty.

**Real example:**
```
TTS error on turn 3. Opener is delivered as audio but the text tracking callback misses it.
_first_interview_question_asked stays False.
Turns 3–25: candidate answers all questions normally.
End of interview: answer_scores = [] (zero scored turns).
Report LLM receives no per-turn data. Blank scorecard delivered to client.
```

**Fix:**
Add a turn-number fallback in `_process_user_conversation_item`:
```python
# If we're past turn 5 and the flag is still False, the opener tracking
# missed the delivery. Force-set it so eval can proceed.
if not _first_interview_question_asked and turn_snapshot > 5:
    logger.warning(
        "[EVAL_GATE] turn=%d | _first_interview_question_asked still False — "
        "opener tracking likely missed delivery. Force-setting to unblock eval.",
        turn_snapshot,
    )
    _first_interview_question_asked = True
```
This must run before the eval gate check, not after.

---

## EC-15 — LLM timeout writes hardcoded fake scores to DB permanently

**File:** `interview/eval_pipeline.py` line 318–323

**Problem:**
When `evaluate_answer()` times out (10s limit), the recovery block writes:
```python
{"clarity": 2.0, "depth": 1.0, "specificity": 1.0, "grounding": 1.0, "overall": 1.3, "signal": "depth_insufficient"}
```
These hardcoded values are identical for every timeout turn. If the LLM is consistently slow under load (multi-org peak), every turn in the session gets `overall=1.3` written to DB. Saturation math gets corrupted with identical values. The report shows the same scores for every turn. Client gets a wrong picture of the candidate.

**Real example:**
```
6pm peak load. Eval LLM response time climbs to 12s. 10s timeout fires every turn.
All 18 turns scored: clarity=2.0, depth=1.0, overall=1.3.
Saturation never triggers (scores too low). Every topic runs to time limit.
Report: candidate appears uniformly weak across all topics. Actual performance unknown.
```

**Fix:**
Use the rolling average of previous turns on the same topic as recovery scores instead of hardcoded values. The topic score history is already available in the eval payload as `topic_score_history: List[float]`.

```python
except (asyncio.TimeoutError, Exception) as ex:
    logger.error("[EVAL] turn=%d | scoring %s — recovery decision",
                 p.turn, "timed out" if isinstance(ex, asyncio.TimeoutError) else f"failed: {ex}")
    # Use rolling average from prior turns on this topic so recovery scores
    # reflect actual candidate performance rather than hardcoded floor values.
    _prior = [s for s in (p.topic_score_history or []) if s > 0]
    _recovery_overall = round(sum(_prior) / len(_prior), 1) if _prior else 2.0
    raw = {
        "clarity": _recovery_overall, "depth": _recovery_overall,
        "specificity": _recovery_overall, "grounding": _recovery_overall,
        "overall": _recovery_overall,
        "action": "PROBE", "signal": None,
        "signal_reason": None,
        "reason": "eval recovery — timeout",
        "is_timeout": True,   # flag so downstream can filter timeout turns from saturation
    }
```

The `is_timeout: True` flag is already checked at line 2190 in `agent_runtime.py` to exclude timeout turns from `_topic_score_histories`. This fix makes recovery scores meaningful while keeping that exclusion intact.

---

## EC-16 — Late warmup detection zeros first real interview answer

**File:** `interview/agent_runtime.py` ~line 2381–2390

**Problem:**
If the candidate says "yes I'm ready" ambiguously (e.g. "yeah sure, so I actually want to mention that in my last role..."), and the warmup completion logic fires one turn late, the first real interview answer gets processed with `warmup_complete = False`. This causes it to be recorded with `clarity=0, depth=0, overall=0` in answer_scores. This zero-score entry drags down all averages for the first topic. Report scores are artificially low for the strongest topic (the anchor topic, which is always first).

**Real example:**
```
Turn 2: Candidate: "Yeah sure, and actually my main experience is with distributed systems..."
warmup_complete fires at turn 3 (one turn late).
Turn 2 answer_scores entry: {clarity: 0, depth: 0, overall: 0, is_warmup: true}
But candidate gave a real answer describing distributed systems experience.
Anchor topic avg_overall dragged down by the zero. Report shows candidate as weak on anchor.
```

**Fix:**
Before classifying a turn as warmup response (and zero-scoring it), check minimum word count. A warmup response should be short — a real answer cannot reasonably be zero-scored if it exceeds 15 words.

```python
# In the warmup detection block:
is_warmup_response = not warmup_complete and turn_snapshot >= 2

# Guard: if the "warmup" response is long, it's probably a real answer delivered
# while warmup_complete detection lagged. Only zero-score if short (<=15 words).
if is_warmup_response and len(content.strip().split()) > 15:
    logger.warning(
        "[WARMUP] turn=%d | warmup_complete=False but answer is %d words — "
        "likely a real answer. Not zero-scoring. Forcing warmup_complete=True.",
        turn_snapshot, len(content.strip().split()),
    )
    warmup_complete = True
    is_warmup_response = False
```

Additionally: only zero-score if `turn_snapshot <= 2`. If `turn_snapshot >= 3` and `warmup_complete` is still False, something went wrong with warmup detection — force-set it rather than zeroing a real answer.

---

## EC-17 — Negative signals have zero effect on saturation speed

**File:** `interview/eval_pipeline.py` line 112–127 (`TopicState.add_contribution`)

**Problem:**
`add_contribution()` adds `base_turn_credit + contribution` unconditionally for every turn, regardless of signal quality. Negative signals (`ownership_ambiguous`, `example_evaded`, `answer_hollow`, `functional_claim_unverified`) are appended to `signals_fired[]` but they don't reduce the contribution. A candidate who answers every turn with shallow "we did everything" responses saturates the topic at exactly the same speed as a candidate giving strong answers. Topics close too early for weak candidates. The client gets a shallow report.

**Current code (line 112–127):**
```python
def add_contribution(self, weighted: float, signal: str | None, turn: int | None = None) -> None:
    contribution = max(0.0, _score_to_contribution(weighted))
    effective_base = self.base_turn_credit if contribution > 0.0 else 0.0
    self.saturation_score += effective_base + contribution   # ← no signal modifier
```

**Fix:**
Apply a signal modifier that reduces contribution when a negative quality signal fires. The modifier should slow saturation — not stop it — so a stuck candidate still eventually moves on.

```python
_NEGATIVE_SIGNAL_MODIFIER = {
    "ownership_ambiguous":        -0.30,
    "example_evaded":             -0.30,
    "answer_hollow":              -0.35,
    "functional_claim_unverified":-0.25,
    "claim_not_demonstrated":     -0.25,
}

def add_contribution(self, weighted: float, signal: str | None, turn: int | None = None) -> None:
    contribution = max(0.0, _score_to_contribution(weighted))
    effective_base = self.base_turn_credit if contribution > 0.0 else 0.0
    raw_add = effective_base + contribution
    # Apply negative modifier — reduces how much this turn advances saturation
    # when a weak signal fires. Clamp to 0 so we never subtract from saturation.
    signal_modifier = _NEGATIVE_SIGNAL_MODIFIER.get(signal or "", 0.0)
    self.saturation_score += max(0.0, raw_add + signal_modifier)
    ...
```

---

## EC-18 — Score 1.1 resets `consecutive_low_yield` counter

**File:** `interview/eval_pipeline.py` line 122–125 (`TopicState.add_contribution`)

**Problem:**
`consecutive_low_yield` resets to 0 whenever `weighted > 1.0`. A candidate alternating scores of `0.8 → 1.2 → 0.8 → 1.2` never exceeds the `dry_topic_cap` because every 1.2 resets the counter. The reset threshold of 1.0 is too low — a score of 1.2 is still a very weak answer. The topic drags on indefinitely for stuck candidates.

**Current code:**
```python
if weighted <= 1.0:
    self.consecutive_low_yield += 1
else:
    self.consecutive_low_yield = 0   # ← resets on score 1.1
```

**Fix:**
Raise the reset threshold to `3.0`. Only a genuinely meaningful answer (score 3+ out of 10) should reset the dry-topic counter. Scores below 3.0 represent answers that are not adding real signal.

```python
_DRY_TOPIC_RESET_THRESHOLD = 3.0

if weighted <= 1.0:
    self.consecutive_low_yield += 1
elif weighted < _DRY_TOPIC_RESET_THRESHOLD:
    pass   # weak answer — do not increment but also do not reset
else:
    self.consecutive_low_yield = 0
```

---

## EC-19 — `per_turn_scores` lost on agent reconnect → `weak_exit` permanently blocked

**File:** `interview/eval_pipeline.py` line 161 (`TopicState.from_dict`)

**Problem:**
`from_dict()` always initializes `per_turn_scores = []` regardless of what is stored. After any reconnect (network drop, server restart), `per_turn_scores` is empty. `is_weak_candidate_exit()` at line 94 checks `len(self.per_turn_scores) >= 2` — this is always `False` on a fresh restore. So `weak_exit` never fires for the rest of that session, regardless of how poorly the candidate is answering. Stuck candidates are kept on topics indefinitely after any reconnect.

**Current code (line 161):**
```python
obj.per_turn_scores = []   # ← never restored, always starts empty
```

**Fix — two parts:**

**Part 1:** Add `per_turn_scores` to `to_dict()`:
```python
def to_dict(self) -> dict:
    return {
        ...existing fields...,
        "per_turn_scores": self.per_turn_scores,   # ← add this line
    }
```

**Part 2:** Restore it in `from_dict()`:
```python
# Replace line 161:
obj.per_turn_scores = [float(x) for x in d.get("per_turn_scores", []) or []]
```

---

## EC-20 — Empty dict resets TopicState to zero on reconnect

**File:** `interview/eval_pipeline.py` line 248–268 (`run_eval_and_build_directive`)

**Problem:**
If `active_topic_state` arrives as `{}` (empty dict — happens when the agent serializes state before any turn has been scored), `TopicState.from_dict({})` creates a fresh state with `saturation_score=0`. A topic that was 80% saturated before the reconnect is treated as brand new. The candidate gets re-asked questions on a topic they already answered well.

**Current code (line 249–250):**
```python
if p.active_topic and p.active_topic_state:
    current_topic_state = TopicState.from_dict(p.active_topic_state)
```
The truthiness check `if p.active_topic_state:` passes for `{}` in some Python versions because `{}` is falsy — but if the Pydantic model coerces it to a non-None dict before the check, it can slip through as an empty restore.

**Fix:**
Add an explicit key presence guard before restoring:
```python
if p.active_topic and p.active_topic_state and p.active_topic_state.get("saturation_score") is not None:
    current_topic_state = TopicState.from_dict(p.active_topic_state)
    logger.info("[TOPIC_STATE] RESTORED | ...")
elif p.active_topic and p.active_topic_state and not p.active_topic_state.get("saturation_score"):
    logger.warning(
        "[TOPIC_STATE] active_topic_state present but has no saturation_score — "
        "treating as new topic to avoid corrupt restore. state=%s", p.active_topic_state
    )
    # fall through to fresh TopicState creation below
```

---

## EC-26 — Same signal fires every turn (no signal history passed to LLM)

**File:** `interview/agent_scoring.py` line 109+ (`evaluate_answer`), `interview/eval_pipeline.py` line 296–312

**Problem:**
`evaluate_answer()` is called without passing `signals_already_fired` for the current topic. The LLM has no memory of what signals it already detected on this topic. It sees the same candidate weakness and fires the same signal turn after turn. `ownership_ambiguous` fires on turn 3, 4, 5, 6 for the same topic. The candidate gets probed about ownership 4 times. No other signal (`example_evaded`, `answer_hollow`) ever gets a chance to fire.

**Real example:**
```
Topic: "Python experience"
Turn 3: signal=ownership_ambiguous  → probe: "What specifically did YOU build?"
Turn 4: signal=ownership_ambiguous  → probe: "Can you describe your personal contribution?"
Turn 5: signal=ownership_ambiguous  → probe: "What was YOUR role exactly?"
Turn 6: signal=ownership_ambiguous  → probe: "I want to understand what YOU did..."
```
Candidate experience is terrible. Other real weaknesses (hollow answers, no examples) are never surfaced.

**Fix — two parts:**

**Part 1:** Pass `signals_already_fired` into `evaluate_answer()` from `run_eval_and_build_directive`:
```python
# In run_eval_and_build_directive, before the evaluate_answer call:
_signals_fired_so_far = current_topic_state.signals_fired if current_topic_state else []

raw = await asyncio.wait_for(
    _score_and_capture(
        ...existing args...,
        signals_already_fired=_signals_fired_so_far,   # ← add this
    ),
    timeout=10.0,
)
```

**Part 2:** Add `signals_already_fired` parameter to `evaluate_answer()` and inject it into the LLM prompt:
```python
async def evaluate_answer(
    ...existing params...,
    signals_already_fired: list[str] | None = None,
) -> dict:
    ...
    # In the prompt, after the signal definitions section:
    if signals_already_fired:
        _fired_list = ", ".join(signals_already_fired)
        # Add to system prompt:
        f"\nSIGNALS ALREADY FIRED THIS TOPIC (do NOT re-fire any of these): {_fired_list}\n"
        f"Choose a DIFFERENT signal if one applies, or return signal: null.\n"
```

---

## EC-27 — Score key mismatch: histories written with `topic_key`, averages read with `topic_normed_key`

**File:** `interview/agent_runtime.py` line 2190 (write) vs line 2622–2634 (read)

**Problem:**
`_topic_score_histories` is written using `topic_key` derived from `quality_record.get("topic")` at line 2190:
```python
topic_key = re.sub(r"[^a-z0-9]+", " ", str(quality_record.get("topic") or _active_topic or "").lower()).strip()
_topic_score_histories.setdefault(topic_key, []).append(...)
```

At line 2622, the MOVE_ON block reads using `topic_normed_key` derived from `_old_key`:
```python
_topic_normed_key = re.sub(r"[^a-z0-9]+", " ", _old_key.lower()).strip()
_overall_hist = _topic_score_histories.get(_topic_normed_key, [])
```

`_old_key = _topic_short_key(_old_topic)` — this is a different string from `quality_record.get("topic")`. If the eval pipeline returns a different topic name than the agent's internal short key (e.g. "Python [FastAPI; SQLAlchemy]" vs "python fastapi sqlalchemy"), the keys don't match. `_overall_hist = []`. Every topic record shows `avg_overall = 0.0`. Report skill ratings are wrong for all topics.

**Fix:**
Standardize the key used for both write and read. At write time (line 2190), use the normalized active topic key the same way the MOVE_ON block does:
```python
# Replace the topic_key derivation at line 2186–2189:
topic_key = re.sub(
    r"[^a-z0-9]+", " ",
    str(_active_topic or quality_record.get("topic") or "").lower(),  # ← prefer _active_topic
).strip()
```
This makes the write key match the `_topic_normed_key` computed at MOVE_ON since `_old_key` is derived from `_active_topic` (via `_topic_short_key(_old_topic)`).

---

---

# Phase 3 — MOVE_ON Logic, Probe Quality, UX Polish

> **Goal:** Interview flow feels fair, transitions are sensible, frontend handles errors cleanly.
> These do not cause data loss or blank reports — fix after Phase 2 is stable.

---

## EC-6 — Out-of-order eval results silently discarded (global monotonic guard)

**File:** `interview/agent_runtime.py` line 2182 (`_apply_eval_result`)

**Problem:**
`_last_applied_eval_turn` is a single global counter. If eval for turn 5 arrives before turn 4 (network jitter under load), turn 4's eval fires first, sets `_last_applied_eval_turn = 4`. Turn 5 eval arrives and sets it to 5. Then turn 4's actual eval (delayed) arrives — check sees `4 <= 5` → discarded. Turn 4 is never scored. Saturation is wrong. The same question may be re-asked.

**Fix:**
Use a per-topic monotonic guard instead of one global turn counter:
```python
_last_applied_eval_turn_by_topic: dict[str, int] = {}

# In _apply_eval_result, inside the lock:
_eval_topic = quality_record.get("topic", "") if quality_record else ""
_last_for_topic = _last_applied_eval_turn_by_topic.get(_eval_topic, 0)
if result_turn <= _last_for_topic:
    logger.debug("[EVAL] skipping stale eval for topic=%s turn=%d last=%d", _eval_topic, result_turn, _last_for_topic)
    return False
_last_applied_eval_turn_by_topic[_eval_topic] = max(_last_for_topic, result_turn)
```
Keep the existing global `_last_applied_eval_turn` for backward-compat logging but do not use it as the gate.

---

## EC-11 — DB setup failure silent to frontend (loading spinner forever)

**File:** `interview/agent_persistence.py` line 157–196 (`get_interview_context`)

**Problem:**
The 5-retry loop in `get_interview_context` eventually raises `RuntimeError`. The entrypoint catches it, logs it, and returns. The frontend receives no signal. The candidate sees a loading spinner indefinitely. They don't know whether to wait or refresh.

**Note:** Phase 1 added `_fail_interview()` which now handles this case — it marks DB FAILED and sends the frontend error signal. Verify that the `context_result` failure path (lines ~1181–1183 in agent_runtime.py after Phase 1 fix) correctly calls `_fail_interview("context_load_failed")` and that the frontend listens for `type: interview_failed` and shows the support message. If already wired up by Phase 1, this EC is resolved. If not, wire it up.

---

## EC-14 — MOVE_ON race drops one scored answer

**File:** `interview/agent_runtime.py` line 2514–2523

**Problem:**
If the candidate answers before the MOVE_ON opener is tracked (the new-topic question is fired but the TTS output callback hasn't cleared `_move_on_opener_pending` yet), the eval for that turn is skipped with the pending flag consumed. The candidate's answer on the new topic is never scored.

**Real example:**
```
Turn 8: MOVE_ON to "Databases" fires. Opener: "Let's talk about your DB experience — what have you worked with?"
Turn 9: Candidate answers immediately: "I've used PostgreSQL with partitioning and Redis for caching..."
_move_on_opener_pending is still True (TTS callback hasn't fired yet).
Eval for turn 9 is skipped. That PostgreSQL/Redis answer is never scored.
Topic only has turn 10+ scored. First substantive answer on the new topic is lost.
```

**Fix:**
Instead of discarding the eval entirely, queue the answer to be scored on the next turn:
```python
if agent._move_on_opener_pending:
    # Don't drop this answer — stage it for scoring next turn when the opener is confirmed.
    _pending_answer_for_next_eval = content
    logger.info("[MOVE_ON_RACE] answer arrived before opener confirmed — staging for next turn eval")
    agent._move_on_opener_pending = False   # clear the flag now, opener is implicitly delivered
    # Do not skip eval — score this answer normally against the new topic
```

---

## EC-21 — Unknown band silently defaults to "mid" with no warning

**File:** `interview/eval_pipeline.py` line 67–68

**Problem:**
```python
_band_cfg = _BAND_SATURATION.get(band, _BAND_SATURATION["mid"])
```
If `band` is `"senior_ic"`, `"staff"`, `"principal"`, or any misconfigured value, it silently falls back to `"mid"` thresholds. A senior candidate gets mid thresholds (lower bar). Topics saturate faster. Candidate is under-interrogated. Client gets wrong signal quality with no log entry to diagnose it.

**Fix:**
```python
_band_cfg = _BAND_SATURATION.get(band)
if _band_cfg is None:
    logger.warning(
        "[BAND] Unknown band=%r — falling back to 'mid' thresholds. "
        "Check InterviewBrief.candidate_band assignment. Valid bands: %s",
        band, list(_BAND_SATURATION.keys())
    )
    _band_cfg = _BAND_SATURATION["mid"]
```

---

## EC-22 — `weak_exit` trajectory check uses only last 2 scores

**File:** `interview/eval_pipeline.py` line 101 (`TopicState.is_weak_candidate_exit`)

**Problem:**
```python
if len(self.per_turn_scores) >= 2 and self.per_turn_scores[-1] > self.per_turn_scores[-2]:
    return False
```
Only the last two scores are compared. Score sequence `2.0 → 1.5 → 3.0 → 1.0`: last pair is `3.0 → 1.0` (dropped), so `weak_exit` fires — even though turn 3 showed real improvement. The candidate who had a good middle answer gets wrongly exited on a single bad final answer.

**Fix:**
Check if any of the last 3 scores shows improvement (any score above the topic's rolling average):
```python
def is_weak_candidate_exit(self) -> bool:
    if self.follow_up_turns < self.progress_check_turns:
        return False
    raw_base = self.base_turn_credit * self.follow_up_turns
    effective = max(self.saturation_score, raw_base)
    if effective >= self.saturation_threshold * self.progress_check_pct:
        return False
    # EC-22 fix: check last 3 scores, not just last 2
    recent = self.per_turn_scores[-3:] if len(self.per_turn_scores) >= 3 else self.per_turn_scores
    if len(recent) >= 2 and any(recent[i] > recent[i-1] for i in range(1, len(recent))):
        return False   # improving trajectory — do not exit
    if self.last_turn_new_tech:
        return False
    return True
```

---

## EC-23 — LLM can MOVE_ON on turn 1 of a CRITICAL topic

**File:** `interview/eval_pipeline.py` line 378

**Problem:**
There is no minimum probe count before the LLM's `MOVE_ON` is accepted. One strong answer on a CRITICAL topic (anchor, e.g. "System Design") causes the LLM to return `action=MOVE_ON`. The topic closes after a single exchange. Senior candidates breeze through anchor topics. The client gets a shallow report on their most important competency.

**Fix:**
Add a minimum probe guard before accepting LLM MOVE_ON for CRITICAL topics:
```python
# In the decision block of run_eval_and_build_directive, after action is determined:
if action == "MOVE_ON" and current_topic_state:
    _importance = current_topic_state.importance
    _min_probes = 2 if _importance == "CRITICAL" else 1
    if current_topic_state.follow_up_turns < _min_probes:
        logger.info(
            "[MOVE_ON_GUARD] LLM requested MOVE_ON on turn %d of %s topic — "
            "minimum %d probe(s) required. Overriding to PROBE.",
            current_topic_state.follow_up_turns, _importance, _min_probes,
        )
        action = "PROBE"
```

---

## EC-24 — `new_tech_thread` blindly suppresses `weak_exit` regardless of score

**File:** `interview/eval_pipeline.py` line 103–104 (`TopicState.is_weak_candidate_exit`)

**Problem:**
```python
if self.last_turn_new_tech:
    return False
```
If ANY signal on the last turn was `new_tech_thread`, `weak_exit` is completely blocked — even if the candidate casually mentioned an unrelated tool with a score of 0.8. The signal fires when a candidate mentions any new technology, regardless of whether the answer was substantive. A stuck candidate kept on a topic says "oh and I also used Kafka briefly" → `new_tech_thread` fires → `weak_exit` is suppressed for another turn. The topic drags on. Time wasted.

**Fix:**
Only suppress `weak_exit` when `new_tech_thread` fired AND the turn score was meaningful (above 3.0):
```python
# Replace the current check:
if self.last_turn_new_tech:
    return False

# With:
_last_score = self.per_turn_scores[-1] if self.per_turn_scores else 0.0
if self.last_turn_new_tech and _last_score >= 3.0:
    return False   # genuine new thread worth following — suppress exit
# If last_turn_new_tech fired but score < 3.0, it was a casual mention — don't suppress
```

---

## EC-25 — `dry_topic_cap=1` too aggressive for freshers

**File:** `interview/eval_pipeline.py` line 80

**Problem:**
```python
self.dry_topic_cap = 1 if band == "fresher" else 2
```
For freshers, one answer with `weighted <= 1.0` immediately triggers MOVE_ON via `is_dry_topic()`. A nervous fresher who gives a short first answer on their strongest topic (e.g. "Python — I've been using it for 2 years") gets moved on immediately with no second chance. The client sees no real Python signal for a candidate who may have been just nervous.

**Fix:**
Set `dry_topic_cap=2` for freshers as well:
```python
self.dry_topic_cap = 2   # same for all bands — one bad answer is not dry topic
```

Optionally, add a minimum word count guard in `add_contribution` so very short answers (< 10 words) increment `consecutive_low_yield` more conservatively:
```python
# In add_contribution, before the low-yield check:
_is_very_short = turn is not None and len(str(weighted)) < 10  # proxy — ideally pass word_count
if weighted <= 1.0:
    self.consecutive_low_yield += 1
```
The cleaner version: pass `answer_word_count` into `add_contribution` and only count as low-yield if `weighted <= 1.0 AND word_count >= 10` (so a genuinely short non-answer still counts, but a short sentence from a nervous fresher gets a chance).

---

## EC-28 — Partial transcript save races with final full save (last-write-wins)

**File:** `interview/agent_runtime.py` line 2267–2269 and `interview/agent_persistence.py` line 226–234

**Problem:**
`persist_transcript(partial=True)` fires as a background task for every candidate turn. If a session ends abruptly (candidate disconnects mid-turn), an in-flight partial save may complete after the final save has already written the complete transcript. Since both write the same `interviewTranscript` column with no row-version check, whichever completes last wins. A partial (incomplete) transcript can overwrite the final full one.

**Fix:**
Add an `updatedAt` optimistic concurrency check on partial saves — only update if `updatedAt` matches what we read, or simpler: track a `_transcript_save_version` counter and include it in the partial write condition:

```python
# In persist_transcript for partial=True, add a generation counter:
await conn.execute(
    """UPDATE "Interview" SET
         "interviewTranscript" = $1,
         "interviewDuration"   = $2,
         "updatedAt"           = NOW()
       WHERE "applicationId" = $3
         AND (status = 'IN_PROGRESS' OR status IS NULL)""",  # ← only update if still live
    full_text, duration, app_id,
)
```
The `AND status = 'IN_PROGRESS'` guard means a partial save that arrives after the final save (which sets `status = 'COMPLETED'`) silently no-ops — it cannot overwrite a completed interview's transcript.

---

## EC-29 — `_covered_topic_keys` case-sensitivity mismatch

**File:** `interview/agent_runtime.py` — `_covered_topic_keys.add()` vs comparisons

**Problem:**
`_covered_topic_keys.add()` uses lowercased/normalized keys (via `_mark_topic_covered` → `_topic_short_key`). But some comparison paths later in the code use raw topic strings without normalization. A topic key stored as `"python fastapi"` may be checked against `"Python [FastAPI]"` — no match. The topic is treated as uncovered and re-opened. The candidate gets asked about a topic they already completed.

**Fix:**
Audit every site that reads from `_covered_topic_keys` and ensure all key lookups pass through `_topic_short_key()` or `_normalize_topic_key()` before the `in` check. The write path already normalizes — the read path must match. Search for all occurrences of `in _covered_topic_keys` and confirm each one uses a normalized key.

---

## EC-30 — `_move_on_opener_pending` double-clear on warmup clearance turn

**File:** `interview/agent_runtime.py` ~line 2514

**Problem:**
`_move_on_opener_pending` is checked and cleared during eval processing. On turn 3 (the warmup clearance turn), both the warmup completion handler and the eval path can run, and both may attempt to clear this flag. A reentrant eval on turn 3 double-clears it. The next answer on the new topic gets its eval skipped even though the opener has been properly delivered.

**Fix:**
Replace the boolean flag with a typed state machine to make transitions explicit:
```python
# Instead of:
_move_on_opener_pending: bool = False

# Use:
_move_on_state: str = "IDLE"  # "IDLE" | "PENDING" | "DELIVERED"
```
Clear (`→ DELIVERED`) only happens once — in the TTS output callback when the opener is confirmed delivered. Eval skips only when state is `"PENDING"`, not `"DELIVERED"`. Prevents double-clear and accidental re-skip.

---

## File Map

| Edge Case | File | Approximate Line |
|-----------|------|-----------------|
| EC-6  | `interview/agent_runtime.py` | 2182 (`_apply_eval_result`) |
| EC-11 | `interview/agent_persistence.py` | 157 (`get_interview_context`) |
| EC-12 | `interview/agent_runtime.py` | 2434–2448 |
| EC-13 | `interview/agent_runtime.py` | 2396–2409 |
| EC-14 | `interview/agent_runtime.py` | 2514–2523 |
| EC-15 | `interview/eval_pipeline.py` | 315–323 |
| EC-16 | `interview/agent_runtime.py` | 2381–2390 |
| EC-17 | `interview/eval_pipeline.py` | 112–127 (`add_contribution`) |
| EC-18 | `interview/eval_pipeline.py` | 122–125 (`add_contribution`) |
| EC-19 | `interview/eval_pipeline.py` | 129–172 (`to_dict` / `from_dict`) |
| EC-20 | `interview/eval_pipeline.py` | 248–268 |
| EC-21 | `interview/eval_pipeline.py` | 67–68 |
| EC-22 | `interview/eval_pipeline.py` | 94–105 (`is_weak_candidate_exit`) |
| EC-23 | `interview/eval_pipeline.py` | 368+ (decision block) |
| EC-24 | `interview/eval_pipeline.py` | 103–104 (`is_weak_candidate_exit`) |
| EC-25 | `interview/eval_pipeline.py` | 80 (`__init__`) |
| EC-26 | `interview/agent_scoring.py` | 109 (`evaluate_answer`) |
| EC-27 | `interview/agent_runtime.py` | 2186–2192 (write) / 2622–2634 (read) |
| EC-28 | `interview/agent_runtime.py` | 2267–2269 |
| EC-29 | `interview/agent_runtime.py` | All `_covered_topic_keys` read sites |
| EC-30 | `interview/agent_runtime.py` | 2514 |

---

## Recommended Fix Order Within Each Phase

### Phase 2 (do in this order)

1. **EC-27** — Key mismatch (all avg scores wrong — highest impact, one-line fix)
2. **EC-19** — `per_turn_scores` not persisted (weak_exit broken after reconnect)
3. **EC-20** — Empty dict resets TopicState (re-asks completed topics on reconnect)
4. **EC-17** — Negative signals don't slow saturation (weak candidates exit too fast)
5. **EC-18** — Score 1.1 resets dry_topic counter (stuck candidates loop forever)
6. **EC-26** — Same signal fires every turn (terrible candidate experience)
7. **EC-15** — Timeout recovery hardcoded scores (fake data in DB)
8. **EC-13** — Opener flag never set → eval never fires (entire interview unscored)
9. **EC-12** — Greeting used as scored question (wrong scores turn 2–3)
10. **EC-16** — Late warmup zeros first real answer (anchor topic artificially dragged down)

### Phase 3 (do in this order)

1. **EC-21** — Unknown band no warning (easy, zero-risk, adds observability)
2. **EC-25** — `dry_topic_cap=1` too harsh for freshers (one-line fix)
3. **EC-23** — LLM MOVE_ON on turn 1 of CRITICAL topic (guards most important topics)
4. **EC-22** — Trajectory check too shallow (fairer weak_exit decisions)
5. **EC-24** — `new_tech_thread` blindly suppresses weak_exit (prevents topic dragging)
6. **EC-6**  — Out-of-order evals discarded (per-topic guard, more accurate scoring)
7. **EC-14** — MOVE_ON race drops one scored answer (queue instead of discard)
8. **EC-28** — Partial transcript overwrites final (status guard on partial saves)
9. **EC-29** — Case-sensitivity mismatch on covered topics (audit + normalize reads)
10. **EC-30** — Double-clear on `_move_on_opener_pending` (state machine refactor)
11. **EC-11** — Verify Phase 1 failure signal wiring covers this (may already be done)
