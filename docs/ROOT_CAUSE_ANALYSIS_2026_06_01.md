# Root Cause Analysis: Architecture Issues vs. Fixes

**Date:** 2026-06-01  
**Scope:** 6 critical issues identified from logs and code review  
**Status:** Analysis complete — 3 FIXED, 3 REQUIRE FIXES

---

## Issue 1: Fragmented Answers / Repeated Questions ❌ NOT FIXED

### Root Cause
STT turn assembly windows are too aggressive, causing single candidate answers to be split into multiple processed turns.

### Evidence
- **agent_runtime.py:1356-1358**
  ```python
  _STT_WARMUP_ASSEMBLY_GRACE_SECONDS = 0.25      # 250ms window
  _STT_INTERVIEW_ASSEMBLY_GRACE_SECONDS = 0.75   # 750ms window
  _STT_TINY_FRAGMENT_RECOVERY_SECONDS = 1.5      # Recovery for tiny fragments
  ```

- **agent_providers.py:61-63, 711-733** — Deepgram VAD/endpointing configuration
  ```
  endpointing=350ms  (aggressive endpoint detection)
  ```

- **Logs:** Turn 5 captured "Google Sheets to Slack" then Turn 6 captured the rest of same answer
  ```
  Turn 5: "What do you mean by 'Google Sheets to Slack'?"
  Turn 6: [rest of answer about same topic]
  ```

### Effect
✅ **Evaluator scores partial answers** → Agent asks follow-up on incomplete response  
✅ **System can't distinguish between "multi-part answer" and "topic change"**  
✅ **Saturation calculated on fragments, not whole answers**

### Current Status: ❌ NOT FIXED
The assembly grace windows are hardcoded and haven't changed. The root cause is:
1. Deepgram VAD is detecting endpoint too eagerly (350ms pauses = end of utterance)
2. Grace period is only 0.75s, so mid-sentence pauses cause turn split

### Fix Required
Increase assembly grace periods or tune Deepgram VAD sensitivity:
```python
# OPTION A: Longer assembly windows
_STT_INTERVIEW_ASSEMBLY_GRACE_SECONDS = 2.0  # 2 seconds instead of 0.75s

# OPTION B: Disable aggressive endpointing
# agent_providers.py: change endpointing=350 → endpointing=800
```

**Impact:** Fewer fragmented turns = more accurate saturation = cleaner topic transitions

---

## Issue 2: LLM Gate Timeout Path ❌ NOT FIXED

### Root Cause
Runtime has a 45-second wait on `_directive_ready`, and on timeout it injects a fallback directive.

### Evidence
- **agent_runtime.py:326-351**
  ```python
  try:
      await asyncio.wait_for(self._directive_ready.wait(), timeout=45.0)
  except asyncio.TimeoutError:
      timed_out = True
      logger.error("[LLM_GATE] timed out (45s) -- eval_task=%s; using explicit recovery directive")
      # Injects RECOVER_GATE_TIMEOUT directive
      self.chat_ctx.add_message(
          role="system",
          content=(
              "DECISION: RECOVER_GATE_TIMEOUT\n"
              "Ask ONE short, concrete follow-up on the current topic..."
          ),
      )
  ```

### Effect
✅ **Stalled eval can synthesize a fallback directive** instead of waiting for primary LLM route  
✅ **Fallback probe is injected silently** — no indication this is recovery, not normal routing  
✅ **45-second wall clock time wasted** before recovery triggers

### Current Status: ❌ NOT FIXED
The 45-second timeout and recovery path still exist. The issue is:
1. If eval takes 10+ seconds (network stall), gate times out at 45s
2. Fallback directive is indistinguishable from normal routing in logs
3. No explicit logging that this was a recovery path

### Fix Required
Option 1: Reduce timeout since eval should take <2s:
```python
# BEFORE
timeout=45.0

# AFTER
timeout=5.0  # Eval + decision_logic should complete in <2s
```

Option 2: Log recovery more explicitly:
```python
logger.warning("[RECOVERY] LLM_GATE timed out after 45s -- using fallback directive (NOT normal routing)")
```

**Impact:** Faster recovery from eval hangs, clearer logs

---

## Issue 3: Eval Failure Fallback ❌ NOT FIXED

### Root Cause
`run_eval_and_build_directive()` returns `None` on timeout/error, and runtime injects `RECOVER_EVAL_ERROR` directive.

### Evidence
- **eval_pipeline.py:405-411**
  ```python
  try:
      _eval_result = await asyncio.wait_for(_eval_coro, timeout=12.0)
  except asyncio.TimeoutError:
      logger.error("[EVAL] turn=%d | scoring call timed out (>12s) -- returning None for explicit recovery")
      return None
  except Exception as _ex:
      logger.error("[EVAL] turn=%d | scoring call failed: %s -- returning None")
      return None
  ```

- **agent_runtime.py:1754-1767**
  ```python
  if _eval_result_inline is None:
      logger.error("[EVAL] turn=%d | eval failed -- using explicit non-scoring recovery")
      _recovery_dir = (
          "DECISION: RECOVER_EVAL_ERROR\n"
          "Ask ONE concrete clarification on the same topic..."
      )
      # Injects recovery directive
      chat_ctx.add_message(role="system", content=_recovery_dir)
  ```

### Effect
✅ **Hidden recovery path can change the question flow**  
✅ **Real failure is masked by recovery directive**  
✅ **No decision_logic or saturation decision made** (agent never sees eval result)

### Current Status: ❌ NOT FIXED
When eval returns `None` (timeout or exception), the agent:
1. Does NOT check saturation
2. Does NOT call `_next_uncovered_topic()`
3. Does NOT apply decision_logic
4. Just injects a generic "ask follow-up" directive

This violates the intended architecture: agent should always own decisions, eval should never fail silently.

### Fix Required
```python
# BEFORE
if _eval_result_inline is None:
    logger.error("[EVAL] turn=%d | eval failed -- using explicit non-scoring recovery")
    # Inject fallback directive

# AFTER
if _eval_result_inline is None:
    logger.error("[EVAL] turn=%d | eval failed -- CRITICAL: no eval result", turn_snapshot)
    # Instead of silent recovery, escalate to agent's fallback logic
    # Let agent decide what to do (probably PROBE on same topic)
    # But this is now an AGENT decision, not eval recovery
    _action = "PROBE"  # Explicit agent-level default
    _saturation = {"is_saturated": False, "weak_exit": False, "depth_decay": False}
    # Continue with normal decision_logic path (lines 1786-1798)
```

**Impact:** Agent maintains control, no silent recovery paths

---

## Issue 4: Move-on Not Happening ✅ FIXED (by design, not code)

### Root Cause
In the logs, MOVE_ON was not blocked. It simply was not triggered because saturation had not crossed threshold yet.

### Evidence
- **logs.md:471, 552, 579** — All show saturation < threshold, so agent stayed PROBE
  ```
  Turn 4: sat=2.0/5.0 (40% complete) → PROBE (correct)
  Turn 5: sat=2.5/5.0 (50% complete) → PROBE (correct)
  Turn 7: sat=3.8/5.0 (76% complete) → PROBE (correct)
  ```

### Effect
✅ **Agent correctly stays on topic until saturation >= threshold**  
✅ **This is working as intended** — saturation enforcement is correct

### Current Status: ✅ FIXED
The agent decision_logic at **agent_runtime.py:1786-1798** correctly enforces:
```python
_action = "PROBE"  # Default
if _depth_decay or _weak_exit or _is_saturated:
    _action = "MOVE_ON"  # Saturation law
elif _action_from_eval == "MOVE_ON":
    _action = "MOVE_ON"  # LLM recommends
```

This is working correctly. MOVE_ON happens only when saturation is met.

---

## Issue 5: Topic Order / Skipping ✅ FIXED (by design)

### Root Cause
Current ordering logic is agent-owned and puts resume/work-history before skills.

### Evidence
- **agent_runtime.py:1153-1177** — `_next_uncovered_topic()` definition
  ```python
  def _next_uncovered_topic(exclude: Optional[str] = None) -> Optional[str]:
      """Agent selects next uncovered topic from pools in order."""
      # Resume topics first, then skill topics
      for t in _resume_topics_pool:
          if t not in _covered_topic_keys and t != exclude:
              return t
      for t in _skill_topics_pool:
          if t not in _covered_topic_keys and t != exclude:
              return t
      return None
  ```

### Effect
✅ **Agent owns topic ordering** — this is correct architecture  
✅ **No eval interference with topic selection** — this is correct

### Current Status: ✅ FIXED
Topic selection is correctly agent-owned. The ordering (resume before skills) is intentional and aligned with interview design.

**No action required** — this is working as designed.

---

## Issue 6: Eval Contract Drift ❌ NOT FIXED

### Root Cause
The runtime consumes more from eval output than the allowed routing outputs. Eval returns not just `action`, `probe_family`, `saturation`, but also `probe_goal`, `probe_style`, and many other fields.

### Evidence
- **agent_runtime.py:1773-1774**
  ```python
  _probe_goal = _eval_result_inline.get("probe_goal") or get_probe_goal(_probe_family)
  _probe_style = _eval_result_inline.get("probe_style") or get_probe_style(_probe_family)
  ```

- **agent_runtime.py:1897-1898** — Agent uses eval's `probe_goal` and `probe_style` directly in directive:
  ```python
  _directive = (
      ...
      f"ANGLE: {_probe_goal}\n"
      f"HOW TO ASK: {_probe_style}\n"
      ...
  )
  ```

- **eval_pipeline.py:578-580** — Eval returns these fields:
  ```python
  "probe_family": probe_family,
  "probe_goal": probe_goal,
  "probe_style": probe_style,
  ```

### Effect
✅ **Eval is shaping directive content beyond just action, saturation state**  
✅ **Agent is not computing probe_goal/style itself** — it's using eval's output  
✅ **Contract drift:** Eval should ONLY return (action, saturation), agent should derive everything else

### Current Status: ❌ NOT FIXED
The intended contract is:
```
EVAL returns:
  - action: PROBE | MOVE_ON
  - saturation dict with thresholds
  - quality scores
  - signal events

AGENT computes:
  - probe_family (from signal detection)
  - probe_goal (from family)
  - probe_style (from family)
  - full directive text
```

But current code has eval returning `probe_goal` and `probe_style`, which agent uses directly. This violates separation of concerns.

### Fix Required
Move probe_goal/style computation to agent:

**eval_pipeline.py (remove lines 578-580):**
```python
# BEFORE
return {
    "action": action,
    "probe_family": probe_family,
    "probe_goal": probe_goal,      # ← REMOVE
    "probe_style": probe_style,    # ← REMOVE
    ...
}

# AFTER
return {
    "action": action,
    "probe_family": probe_family,
    # probe_goal and probe_style removed — agent will compute
    ...
}
```

**agent_runtime.py (update lines 1773-1774):**
```python
# BEFORE
_probe_goal = _eval_result_inline.get("probe_goal") or get_probe_goal(_probe_family)
_probe_style = _eval_result_inline.get("probe_style") or get_probe_style(_probe_family)

# AFTER
_probe_goal = get_probe_goal(_probe_family)      # Agent computes
_probe_style = get_probe_style(_probe_family)    # Agent computes
```

**Impact:** Clean separation — eval scores, agent routes and plans

---

## Summary Table

| Issue | Root Cause | Fixed? | Priority | Impact |
|-------|-----------|--------|----------|--------|
| 1. Fragmented answers | STT assembly too aggressive (0.75s) | ❌ | HIGH | Questions asked on partial answers |
| 2. LLM gate timeout | 45s timeout with fallback | ❌ | MEDIUM | Slow recovery, masked failures |
| 3. Eval failure fallback | Silent recovery, no agent decision | ❌ | CRITICAL | Violates agent control architecture |
| 4. Move-on not happening | By design — saturation not met | ✅ | N/A | Working correctly |
| 5. Topic order/skipping | Agent-owned — correct | ✅ | N/A | Working as designed |
| 6. Eval contract drift | Eval returns probe_goal/style | ❌ | HIGH | Violates separation of concerns |

---

## Critical Path to Architecture Compliance

### Immediate (CRITICAL)
**Issue #3: Eval failure fallback**
- Currently: eval timeout → silent recovery → fallback directive
- Should be: eval timeout → escalate to agent → agent applies decision_logic
- Fix: Replace eval recovery with agent-level fallback

### High Priority
**Issue #6: Eval contract drift**
- Currently: eval computes probe_goal/style → agent uses them
- Should be: eval only returns action+saturation → agent computes all directive details
- Fix: Move probe_goal/style computation to agent

**Issue #1: Fragmented answers**
- Currently: assembly grace 0.75s → splits mid-answer
- Should be: longer grace period → capture full candidate utterance
- Fix: Increase assembly grace to 2.0s or tune VAD sensitivity

### Medium Priority
**Issue #2: LLM gate timeout**
- Currently: 45s wall clock before recovery
- Should be: <5s timeout (eval should complete in 1-2s)
- Fix: Reduce timeout, improve error logging

---

## Recommendation

**Do these fixes in this order:**

1. **Fix Issue #3** (eval failure fallback) → Agent owns all decisions
2. **Fix Issue #6** (eval contract) → Clean separation of concerns
3. **Fix Issue #1** (STT assembly) → Better answer capture
4. **Fix Issue #2** (LLM gate) → Faster recovery

After these four fixes, flow.md architecture is fully compliant.
