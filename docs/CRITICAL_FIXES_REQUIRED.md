# Critical Fixes Required for flow.md Compliance

**Status:** 4 architectural violations identified  
**Timeline:** 2 hours (estimated)  
**Complexity:** Medium-High

---

## FIX #1: CRITICAL — Eval Failure Fallback

**File:** `interview/agent_runtime.py`  
**Lines:** 1754-1767  
**Current behavior:** Eval timeout → silent RECOVER_EVAL_ERROR directive  
**Should be:** Eval timeout → escalate to agent decision_logic

### Current Code
```python
if _eval_result_inline is None:
    logger.error("[EVAL] turn=%d | eval failed -- using explicit non-scoring recovery", turn_snapshot)
    _recovery_dir = (
        "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
        "DECISION: RECOVER_EVAL_ERROR\n"
        f"BAND: {payload.get('band', 'mid').upper()}\n"
        "Evaluation failed for the last answer. Ask ONE concrete clarification on the same topic "
        "using the candidate's last answer. Do not move topics, do not mark coverage complete, "
        "and do not treat this as a scored routing decision."
    )
    remove_system_messages_multi(chat_ctx, ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT"))
    chat_ctx.add_message(role="system", content=_recovery_dir)
    logger.info("[EVAL] turn=%d | releasing LLM gate -- Ishita will speak now", turn_snapshot)
    agent._waiting_for_eval = False
    agent._directive_ready.set()
    return
```

### Problem
- Silent recovery bypasses agent's decision_logic
- No saturation check
- No topic tracking
- Violates "agent owns all decisions" principle

### Fix
Replace with agent-level fallback that goes through normal decision path:

```python
if _eval_result_inline is None:
    logger.critical("[EVAL] turn=%d | eval failed -- CRITICAL RECOVERY: escalating to agent default", turn_snapshot)
    
    # Construct a default eval result (no scores, but saturation/action)
    # Agent will treat this as: "eval failed, stay on same topic"
    _eval_result_inline = {
        "action": "PROBE",  # Default fallback action
        "probe_family": "clarification",
        "saturation": {
            "is_saturated": False,
            "weak_exit": False,
            "depth_decay": False,
            "score": 0.0,
            "threshold": 5.0,
        },
        "quality_record": {},
        "signal_events": [
            {"signal_name": "eval_error", "severity": "critical"}
        ],
        "new_trust_state": _trust_state,
        "risk_integrity_delta": 0,
        "risk_depth_delta": 0,
    }
    logger.info("[EVAL] turn=%d | using agent-level fallback (eval failure)", turn_snapshot)
    # Continue to normal decision_logic path (line 1786+)
```

### Why This Works
- **Agent still owns the decision** via normal decision_logic
- **Saturation is checked** even in failure case
- **Logging is explicit** about this being recovery
- **Fallback is deterministic** not hidden

### Testing
- Next turn after eval failure, should see `[AGENT] decision_logic:` log
- Should show saturation=0.0/X.X
- Should result in PROBE (because saturation not met)

---

## FIX #2: HIGH — Eval Contract Drift

**Files:** `interview/eval_pipeline.py` + `interview/agent_runtime.py`  
**Lines:** eval_pipeline.py:578-580, agent_runtime.py:1773-1774, 1897-1898  
**Current behavior:** Eval returns probe_goal/style → agent uses them  
**Should be:** Eval returns only action → agent computes all details

### Part A: Remove from eval return (eval_pipeline.py)

**Current (lines 574-605):**
```python
return {
    "action": action,
    "probe_family": probe_family,
    "probe_goal": probe_goal,       # ← REMOVE THIS
    "probe_style": probe_style,     # ← REMOVE THIS
    "quality_record": quality_record,
    ...
}
```

**Change to:**
```python
return {
    "action": action,
    "probe_family": probe_family,
    # probe_goal and probe_style removed -- agent computes these
    "quality_record": quality_record,
    ...
}
```

### Part B: Compute in agent (agent_runtime.py)

**Current (lines 1773-1774):**
```python
_probe_goal = _eval_result_inline.get("probe_goal") or get_probe_goal(_probe_family)
_probe_style = _eval_result_inline.get("probe_style") or get_probe_style(_probe_family)
```

**Change to:**
```python
_probe_goal = get_probe_goal(_probe_family)      # Always agent-computed
_probe_style = get_probe_style(_probe_family)    # Always agent-computed
```

### Why This Works
- **Clean separation:** Eval scores, agent plans
- **Deterministic:** Agent always controls how to probe
- **Testable:** Agent's probe strategy is decoupled from eval scoring

---

## FIX #3: HIGH — Fragmented Answers

**File:** `interview/agent_runtime.py` (and possibly `agent_providers.py`)  
**Lines:** 1356-1358, 2159-2161  
**Current behavior:** Assembly grace 0.75s → splits mid-answer  
**Should be:** Longer grace period → captures full utterance

### Option A: Increase Assembly Grace (Safer)

**Current:**
```python
_STT_INTERVIEW_ASSEMBLY_GRACE_SECONDS = 0.75  # 750ms
```

**Change to:**
```python
_STT_INTERVIEW_ASSEMBLY_GRACE_SECONDS = 2.0   # 2 seconds
```

**Why:** Gives STT time to collect multi-clause answers without premature cutoff

### Option B: Tune Deepgram VAD (Alternative)

**File:** `interview/agent_providers.py`  
**Lines:** 711-733  
**Current:**
```python
endpointing_ms=350  # 350ms silence = end of utterance
```

**Change to:**
```python
endpointing_ms=800  # 800ms silence = end of utterance
```

**Why:** Gives speaker time to pause mid-thought without triggering endpoint

### Testing
- Next interview, candidate gives a multi-clause answer
- Watch logs for STT_BUFFER fragments
- Should see fewer splits, more complete turns

---

## FIX #4: MEDIUM — LLM Gate Timeout

**File:** `interview/agent_runtime.py`  
**Lines:** 333  
**Current behavior:** 45s timeout before recovery  
**Should be:** 5s timeout (eval should complete in <2s)

### Current
```python
try:
    await asyncio.wait_for(self._directive_ready.wait(), timeout=45.0)
except asyncio.TimeoutError:
    timed_out = True
    logger.error("[LLM_GATE] timed out (45s) -- eval_task=%s; using explicit recovery directive")
```

### Change to
```python
try:
    await asyncio.wait_for(self._directive_ready.wait(), timeout=5.0)
except asyncio.TimeoutError:
    timed_out = True
    logger.error("[LLM_GATE] timed out (5s) -- eval likely stalled; escalating")
```

### Why This Works
- **Faster failure detection:** Don't wait 45 seconds
- **Paired with eval streaming:** We optimized eval to 1-2s, so 5s is safe
- **Clearer logs:** Indicates eval stall, not normal operation

---

## Implementation Order

```
1. START: Run one interview to establish baseline
   - Capture logs with current code
   - Verify Issue #4 and #5 are indeed "FIXED"

2. FIX #1 (Eval failure fallback)
   - Most critical for agent architecture
   - Enables agent to own all decisions
   - Test with intentional eval timeout

3. FIX #2 (Eval contract drift)
   - Clean separation of concerns
   - Agent computes all directive details
   - Test with normal interview flow

4. FIX #3 (Fragmented answers)
   - Longer assembly grace period
   - Run interview, watch for answer splits
   - Verify Turn 4+ work on complete answers

5. FIX #4 (LLM gate timeout)
   - Reduce from 45s to 5s
   - Paired with streaming optimization
   - Test with stalled eval scenario

6. VERIFY: Run final interview
   - Collect full logs (20 min, all turns)
   - Verify no fragmented answers
   - Verify decision_logic appears every turn
   - Verify saturation thresholds respected
   - Verify MOVE_ON happens at right time
```

---

## Code Review Checklist

Before implementing, verify:
- [ ] Is `get_probe_goal()` function available in agent_runtime.py?
- [ ] Is `get_probe_style()` function available?
- [ ] What is current STT assembly grace baseline?
- [ ] Are there any other code paths that depend on probe_goal/style from eval?

---

## Success Criteria

After all 4 fixes:

✅ **Issue #1 Fixed:** No more fragmented answers (assembly grace 2.0s)  
✅ **Issue #2 Fixed:** Eval failure goes through agent decision_logic  
✅ **Issue #3 Fixed:** Agent computes probe_goal/style (not eval)  
✅ **Issue #4 Fixed:** LLM gate timeout 5s (not 45s)  
✅ **Issue #5 Verified:** MOVE_ON happens when saturation >= threshold  
✅ **Issue #6 Verified:** Topic order is agent-owned  

**Result:** flow.md architecture fully compliant.

---

## Estimated Timeline

| Fix | Effort | Testing | Total |
|-----|--------|---------|-------|
| #1  | 15 min | 10 min  | 25 min |
| #2  | 10 min | 10 min  | 20 min |
| #3  | 5 min  | 15 min  | 20 min |
| #4  | 5 min  | 5 min   | 10 min |
| Final verification | - | 30 min | 30 min |
| **TOTAL** | 35 min | 70 min | **105 min** |

**Ready to start? Let me know which fix to tackle first.**
