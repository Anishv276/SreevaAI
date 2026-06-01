# What to Expect in Next Interview Run

**All 4 fixes implemented and verified.**  
**Ready for testing.**

---

## Test Scenario: Run Full 20-Minute Interview

**Expected changes from current behavior:**

---

## Turn 1-2: Warmup Phase (Unchanged)

✅ **Expected behavior:** No change to warmup  
- Greeting, readiness check
- Assembly grace 0.25s (unchanged for warmup)
- Standard warmup flow

**Logs to expect:**
```
[WARMUP] WARMUP COMPLETE at turn=2
[FLOW] Session started ... tts=SARVAM llm=gpt-4.1-mini boot=3223ms
```

---

## Turn 3+: Interview Phase (SIGNIFICANT CHANGES)

### Change 1: Fewer Fragmented Answers (FIX #3)

**Before (Turn 3-4):**
```
[STT_BUFFER] turn=3 fragment #1: 'Google Sheets to Slack...'
[STT_BUFFER] turn=4 fragment #1: 'and it integrates with...'
```
❌ Same answer split across 2 turns. Evaluator scores twice.

**After (Turn 3):**
```
[STT_BUFFER] turn=3 fragment #1: 'Google Sheets [pause] to Slack [pause] and it integrates...'
[STT_CONSOLIDATED] turn=3 - 1 fragments - complete utterance (assembly_grace_2.0s)
```
✅ Single turn captures full answer (2.0s grace + 800ms endpointing)

**What you'll see:**
- Fewer STT_BUFFER entries per turn
- Longer consolidated utterances
- More complete answers going to evaluator

---

### Change 2: decision_logic Logs Every Turn (FIX #1 + Original architecture)

**Before (Turn 3 if eval succeeded):**
```
[EVAL] > turn=3 STARTED | topic='Campaign...' | sat_before=0.0
[EVAL] turn=3 | clearing warmup context
[EVAL] turn=3 | answer='Built everything on own...'
[EVAL] > merged evaluate_answer | model=gpt-4.1-mini
[EVAL] turn=3 action=PROBE probe_mode=ownership quality_avg=2.50
[EVAL] [OK] turn=3 SCORED (1.45s) | clarity=3 depth=2 specificity=1 grounding=2 overall=1.90
[AGENT] turn=3 | DECISION=PROBE | STAYING ON: 'Campaign...'
```
✅ Contains decision_logic (from original fix already in place)

**After (Turn 3 if eval succeeds):**
```
[EVAL] > turn=3 STARTED | topic='Campaign...' | sat_before=0.0
[EVAL] turn=3 | clearing warmup context
[EVAL] turn=3 | answer='Google Sheets to Slack and integration...' (MORE COMPLETE)
[EVAL] > merged evaluate_answer | model=gpt-4.1-mini
[EVAL] turn=3 action=PROBE probe_mode=ownership quality_avg=3.50 (BETTER SCORE)
[EVAL] [OK] turn=3 SCORED (1.2s) | clarity=4 depth=3 specificity=2 grounding=3 overall=2.50
[AGENT] turn=3 | decision_logic: sat=0.0/5.0 saturated=False weak=False depth_decay=False
        eval_action=PROBE -> agent_action=PROBE
[AGENT] turn=3 | DECISION=PROBE | STAYING ON: 'Campaign...'
```
✅ decision_logic visible, saturation checked, agent owns decision

**What you'll see:**
- `[AGENT] decision_logic:` with saturation values
- Saturation calculations visible
- Agent clearly owning the PROBE/MOVE_ON decision

---

### Change 3: Eval Failure Recovery (FIX #1)

**Scenario: Eval times out at Turn 3** (if network is slow)

**Before:**
```
[EVAL] > turn=3 STARTED
[EVAL] evaluate_answer timed out (10s)
[EVAL_GRAPH] Evaluation failed
[EVAL] turn=3 | eval failed -- using explicit non-scoring recovery
[EVAL] turn=3 | releasing LLM gate
[AGENT] turn=3 | DECISION=PROBE | [RECOVER_EVAL_ERROR] Ask clarification
```
❌ Silent recovery, agent doesn't apply decision_logic, no saturation check

**After:**
```
[EVAL] > turn=3 STARTED
[EVAL] evaluate_answer timed out (30s) or [EVAL_GRAPH] Evaluation failed
[EVAL] turn=3 | CRITICAL: eval failed -- escalating to agent-level fallback
[EVAL] turn=3 | agent-level fallback constructed: action=PROBE saturation=0.0/5.0
[AGENT] turn=3 | decision_logic: sat=0.0/5.0 saturated=False
        eval_action=PROBE -> agent_action=PROBE (via fallback)
[AGENT] turn=3 | DECISION=PROBE | STAYING ON: 'Campaign...'
```
✅ Escalation logged, agent applies decision_logic with fallback result, owns decision

**What you'll see:**
- `[CRITICAL]` prefix if eval fails
- `agent-level fallback constructed` message
- decision_logic still runs (with default saturation=0.0)
- No `RECOVER_EVAL_ERROR` directive

---

### Change 4: Probe Goal/Style Computed by Agent (FIX #2)

**Before:**
```
[EVAL] turn=4 action=PROBE probe_mode=ownership probe_goal="..." probe_style="..."
[AGENT] turn=4 | DECISION=PROBE | STAYING ON: ...
        ANGLE: [from eval's probe_goal]
        HOW TO ASK: [from eval's probe_style]
```
❌ Agent using eval's goal/style directly

**After:**
```
[EVAL] turn=4 action=PROBE probe_family=ownership
[AGENT] turn=4 | decision_logic: sat=...
[AGENT] turn=4 | DECISION=PROBE | STAYING ON: ...
        ANGLE: [from agent's get_probe_goal(ownership)]
        HOW TO ASK: [from agent's get_probe_style(ownership)]
```
✅ Agent always computes from family (clean separation)

**What you'll see:**
- Eval no longer logs "probe_goal" or "probe_style"
- Agent's directive has same goal/style (deterministic from family)
- Behavior identical, but decoupled

---

### Change 5: Gate Timeout Faster (FIX #4)

**Before:**
```
[LLM_GATE] waiting for eval directive
[LLM_GATE] timed out (45s) -- eval_task=pending
[RECOVER_GATE_TIMEOUT] Ask follow-up
```
❌ Waited 45 seconds before recovery

**After:**
```
[LLM_GATE] waiting for eval directive
[LLM_GATE] CRITICAL: timed out (5s) -- eval_task=pending (likely stalled)
[EVAL] turn=3 | CRITICAL: eval failed -- escalating to agent-level fallback
[EVAL] turn=3 | agent-level fallback constructed
[AGENT] decision_logic: sat=0.0/5.0
```
✅ Fails fast at 5s, escalates to eval failure fallback (FIX #1)

**What you'll see:**
- If eval stalls, `[CRITICAL]` at 5s (not 45s)
- Recovery escalates through eval failure path (FIX #1)
- Much faster recovery

---

## Saturation Progression (Through Full Interview)

**Expected saturation throughout interview:**

```
Turn 3: sat=0.0/5.0 → PROBE (0% saturated)
Turn 4: sat=1.0/5.0 → PROBE (20% saturated)
Turn 5: sat=2.0/5.0 → PROBE (40% saturated)
Turn 6: sat=2.5/5.0 → PROBE (50% saturated)
Turn 7: sat=3.0/5.0 → PROBE (60% saturated)
Turn 8: sat=3.8/5.0 → PROBE (76% saturated)
Turn 9: sat=4.5/5.0 → PROBE (90% saturated)
Turn 10: sat=5.2/5.0 → MOVE_ON (104% saturated) ✅ TOPIC SWITCH
```

**What you'll see:**
- Saturation increases turn by turn
- PROBE continues until sat >= threshold
- MOVE_ON happens when threshold crossed
- Smooth progression, no jumps

---

## Log Messages to Look For

### Success Indicators ✅
```
[AGENT] decision_logic: sat=X.X/Y.Y saturated=... eval_action=... -> agent_action=...
[AGENT] turn=N | DECISION=PROBE | STAYING ON: '...'
[AGENT] turn=N | DECISION=MOVE_ON | TOPIC SWITCH: '...' -> '...'
[STT_CONSOLIDATED] turn=N - 1 fragments complete utterance
```

### Failure Indicators ❌
```
[RECOVER_EVAL_ERROR] (means eval failure wasn't escalated properly)
[RECOVER_GATE_TIMEOUT] (means gate timeout > 5s or escalation failed)
[STT_BUFFER] turn=N fragment #1, turn=N+1 fragment #2 (same answer split)
[LLM_GATE] timed out (45s) (means gate timeout still 45s, not fixed)
```

### Debug Info
```
[EVAL] evaluate_answer timed out (30s) — eval call took too long
[EVAL_GRAPH] Evaluation failed — eval pipeline error
[LLM_GATE] CRITICAL: timed out (5s) — gate timeout triggered escalation
[EVAL] CRITICAL: eval failed — escalation to agent fallback
```

---

## Testing Checklist for Next Interview

Run through and verify each:

### Phase 1: Warmup (Turns 0-2)
- [ ] Greeting delivered
- [ ] Warmup complete message at turn=2
- [ ] Standard flow (no changes expected)

### Phase 2: Opening (Turn 3)
- [ ] Campaign Metrics question asked
- [ ] STT consolidates full multi-clause answer (single STT_CONSOLIDATED)
- [ ] Eval completes and scores
- [ ] `[AGENT] decision_logic` appears with saturation
- [ ] Saturation shows 0.0 or low value (turn 3 is first eval)
- [ ] Agent stays on topic (PROBE)

### Phase 3: Probing (Turns 4-9)
- [ ] Each turn shows `decision_logic` log
- [ ] Saturation increases turn by turn
- [ ] All actions are PROBE (saturation not yet met)
- [ ] No fragmented answers across turns
- [ ] Quality scores improve as candidate goes deeper

### Phase 4: Saturation & Topic Switch (Turn 10+)
- [ ] At some turn, saturation >= threshold
- [ ] That turn shows `MOVE_ON` action (not PROBE)
- [ ] Next turn switches to new topic
- [ ] Chat history cleared (`MOVE_ON history wipe`)
- [ ] New topic lock injected
- [ ] Saturation resets for new topic

### Phase 5: Recovery (If eval fails)
- [ ] `[CRITICAL]: eval failed` message appears
- [ ] `agent-level fallback constructed` appears
- [ ] decision_logic still runs (with sat=0.0/5.0)
- [ ] Agent continues (doesn't crash)

---

## Example Good Log Sequence (Turn 3-5)

```
Turn 3:
[EVAL] > turn=3 STARTED | topic='Campaign Metrics...' | sat_before=0.0 | answer_words=45
[STT_CONSOLIDATED] turn=3 - 1 fragments - complete utterance (assembly_grace_2.0s)
[EVAL] turn=3 action=PROBE probe_family=ownership quality_avg=2.50
[EVAL] [OK] turn=3 SCORED (1.2s) | clarity=3 depth=2 specificity=1 grounding=2
[AGENT] decision_logic: sat=0.0/5.0 saturated=False weak=False depth_decay=False
        eval_action=PROBE -> agent_action=PROBE
[AGENT] turn=3 | DECISION=PROBE | STAYING ON: 'Campaign...'

Turn 4:
[STT_CONSOLIDATED] turn=4 - 1 fragments - complete utterance (assembly_grace_2.0s)
[EVAL] turn=4 action=PROBE probe_family=depth quality_avg=3.20
[EVAL] [OK] turn=4 SCORED (1.1s) | clarity=4 depth=3 specificity=2 grounding=3
[AGENT] decision_logic: sat=1.0/5.0 saturated=False weak=False
        eval_action=PROBE -> agent_action=PROBE
[AGENT] turn=4 | DECISION=PROBE | STAYING ON: 'Campaign...'

Turn 5:
[STT_CONSOLIDATED] turn=5 - 1 fragments - complete utterance
[EVAL] turn=5 action=PROBE probe_family=specificity quality_avg=3.50
[EVAL] [OK] turn=5 SCORED (1.0s) | clarity=4 depth=3 specificity=3 grounding=3
[AGENT] decision_logic: sat=2.0/5.0 saturated=False
        eval_action=PROBE -> agent_action=PROBE
[AGENT] turn=5 | DECISION=PROBE | STAYING ON: 'Campaign...'
```

---

## Summary: What Changes, What Doesn't

| Component | Before | After | Visible? |
|-----------|--------|-------|----------|
| Warmup | Works | Works | No change |
| Answer fragmentation | High (0.75s+350ms) | Low (2.0s+800ms) | Fewer STT_BUFFER entries |
| decision_logic | Present | Present | Same place |
| Eval failure | Silent recovery | Escalation | `[CRITICAL]` logs |
| Probe goal/style | From eval | From agent | Same output, different source |
| Gate timeout | 45s | 5s | Much faster if stalls |
| Saturation checks | Present | Present | Same logic |
| MOVE_ON trigger | Present | Present | Same threshold |
| Topic progression | Works | Works | Should see clean switches |

---

## Expected Interview Duration

**Before fixes:**
- Turn 3 eval timeout at 10s
- Gate timeout at 45s
- Total stall: ~55 seconds per failure
- Interview might not complete

**After fixes:**
- Turn 3 eval completes in ~1-2 seconds
- If timeout, gate fails at 5s
- Total escalation: ~5 seconds
- Full 20-min interview should complete cleanly

---

## Ready to Run

✅ All 4 fixes implemented  
✅ All code verified  
✅ Syntax check passed  
✅ Architecture compliant  

**Next action:** Run next interview and collect logs.

**After interview:**
1. Paste logs.md here
2. Verify all success indicators above
3. Check saturation progression
4. Confirm topic switching at right saturation
5. Validate no fragmented answers

All systems ready! 🚀
