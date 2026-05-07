# Timing Bug: Phase Transitions Should Be Time-Based, Not Turn-Based

## Issue Summary

**Requirement (from FINAL_SUMMARY.md and DATA_FLOW_DIAGRAM.md):**
```
0–3s:   Greeting (scripted)
3–20s:  Warmup (turn-based, but within time constraint)
20–45s: Phase 1 questions
45–60s: Phase 3 questions
60s+:   End
```

**Actual Implementation (agent_runtime.py):**
```python
# Line 1655-1658: Warmup based on turn count, NOT elapsed time
if not warmup_complete:
    warmup_responses_received += 1
    if warmup_responses_received >= 2:  # ← TURN-BASED
        warmup_complete = True
        # Immediately inject Phase 1 questions
```

**The Bug:**
- If warmup finishes in 5 seconds (fast talker), Phase 1 questions start at 5s instead of 20s
- If warmup takes 40 seconds (slow talker), Phase 1 questions start at 40s instead of 20s
- No time-based phase boundaries exist
- Interview length varies dramatically based on speech rate, not interview design

---

## Evidence

### 1. Documentation Says Time-Based
**FINAL_SUMMARY.md lines 28-35:**
```
DURING INTERVIEW:
├─ 0–3s: Greeting (scripted, outside QB)
├─ 3–20s: Warmup (2 turns, outside QB)
├─ 20–45s: Phase 1 questions (Q1-Q5 from QB)
├─ 45–60s: Phase 3 questions (Q6-Q12 filtered by critical skills)
└─ 60s+: Interview ends, evaluation stored
```

**DATA_FLOW_DIAGRAM.md lines 195-284:** Same time-based structure, labeled `↓ (0s)`, `↓ (3s)`, `↓ (20s)`, etc.

### 2. Code Is Actually Turn-Based
**agent_runtime.py line 1657:**
```python
if warmup_responses_received >= 2:  # After 2 candidate responses
    warmup_complete = True
    # Transition to Phase 2 immediately (no time check)
```

**No timer that says "after 20s, move to Phase 1"**
- No `elapsed >= 20` check before Phase 1
- No `elapsed >= 45` check before Phase 3
- No `elapsed >= 60` check for hardstop

---

## Impact

### Scenario 1: Fast Talker
- Greeting: 2s
- Warmup turn 1 (candidate answer): 3s
- Warmup turn 2 (Ishita reply + candidate answer): 4s
- **Total warmup: 9 seconds**
- **Phase 1 starts at 9s instead of 20s**
- **Interview is 30-40 seconds shorter than designed**

### Scenario 2: Slow Talker
- Greeting: 3s
- Warmup turn 1 (candidate answer): 15s
- Warmup turn 2 (Ishita reply + candidate answer): 25s
- **Total warmup: 43 seconds**
- **Phase 1 starts at 43s instead of 20s**
- **Phases are compressed, rush through questions**

### What Should Happen
- Warmup should finish by 20s mark (hard stop if still in progress)
- Phase 1 should start at 20s (or on warmup completion, whichever comes later)
- Phase 3 should start at 45s (or after Phase 1 completes, whichever comes later)
- Hard end at 60s

---

## Root Cause

The interview was designed with **time-based phase boundaries** (documented in all summaries), but the implementation only uses **turn-based boundaries**.

The timer exists:
```python
# Line 2004
session_start_time = time.time()

# Line 1714-1715 (in evaluation loop)
_elapsed = time.time() - session_start_time
_secs_remaining = max(0.0, time_limit_mins * 60 - _elapsed)
```

But it's **not used for phase transitions**. It's only used for:
- Wrap-up nudge (20% remaining)
- Final thanks (10 seconds left)
- Inactivity detection

---

## Fix Strategy

Add explicit elapsed-time checks for phase boundaries:

```python
# At warmup completion, check elapsed time
if warmup_complete and elapsed_since_start >= 20:
    # Phase 1 is now safe to start
    inject_phase_1_questions()

# Check if should move to Phase 3 (after Phase 1 complete or at 45s mark)
if phase_1_complete and elapsed_since_start >= 45:
    # Phase 3 is now active
    # Ishita should ask Phase 3 questions from question bank
    
# Hard stop at 60s
if elapsed_since_start >= 60:
    # Interview must end
```

Additionally:
- If warmup reaches 20s mark before completing, force completion
- If Phase 1 reaches 45s mark before completing, move to Phase 3
- Ensure phases are enforced regardless of speech rate

---

## Files to Modify

- `agent_runtime.py`: Add elapsed-time checks in main interview loop
- Potentially `interview_phases.py`: Add phase boundary constants
- Tests: Create test case that verifies phase transitions at expected times

---

## Severity

**HIGH** — This is a core design requirement. Interview pacing is inconsistent based on candidate speech rate rather than designed timeline.

---

## Verification

To verify the bug:
1. Run an interview with fast talker (answers quickly)
2. Run same interview with slow talker (takes pauses)
3. Compare when Phase 1 questions start
4. Should both be at ~20s mark (requirement)
5. Currently they will differ by 10-30 seconds (bug)