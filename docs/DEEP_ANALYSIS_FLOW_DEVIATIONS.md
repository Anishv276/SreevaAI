# DEEP ANALYSIS: Flow Deviations & Root Causes

**Date:** 2026-06-01 | **Session:** app-vamsi-resume-gtm-cmps7cu-8541  
**Candidate:** Vadla Vamsi Krishna | **Role:** GTM engineer | **Band:** fresher | **Duration:** 20 minutes

---

## EXECUTIVE SUMMARY

The interview system has **THREE CRITICAL ARCHITECTURAL BUGS** that violate `flow.md`:

1. **EVALUATION IS PICKING TOPICS** — Eval decides "MOVE_ON" and evaluation code (eval_pipeline.py:1818-1866) injects the next topic, not the agent
2. **TOPIC SWITCHING WITHOUT AGENT CONTROL** — Agent never calls `_next_uncovered_topic()` because eval has already picked it
3. **SATURATION-DRIVEN TOPIC JUMPS** — Evaluation triggers "weak_exit" and "candidate_cannot_answer" to force topic switches, bypassing agent judgment

**Result:** Flow follows `flow.md` opening moves, then **evaluation hijacks topic selection at turn 4**, causing unexpected topic switches that violate the interview design.

---

## EXPECTED BEHAVIOR (per `flow.md`)

```
TURN 1-2: GREETING + WARMUP
  → LLM fires with WARMUP directive
  → No eval gate (directive_ready is SET)
  → Ishita: "Hi Vamsi... How are you doing?"

TURN 2-3: OPENING QUESTION (Agent-Controlled)
  → After warmup complete, agent builds opening directive
  → LLM reads directive with opening angle (RANDOM ANCHOR TOPIC)
  → Ishita asks about "Campaign Metrics and Slack Reporting System"
  → directive_ready.CLEARED ← Turn 3 guard set
  
TURN 3-7: FIRST TOPIC (Agent Controls Probing + Saturation)
  → Eval scores answer
  → If quality is low: PROBE (agent builds probe)
  → If saturated (sat >= threshold): MOVE_ON (agent picks next topic)
  → Agent owns topic selection via _next_uncovered_topic()

TURN 5+: MOVE_ON DECISION
  → Eval computes saturation score
  → If score >= threshold: tell agent "MOVE_ON"
  → Agent calls _next_uncovered_topic(exclude="current")
  → Agent builds MOVE_ON directive with new topic
  → Chat history wiped, new topic injected
  → LLM reads new topic context + directive
  → Ishita asks opening question on new topic
```

**Key Principle:** `Evaluation only SIGNALS (PROBE/MOVE_ON). Agent EXECUTES (picks topic, builds directive).`

---

## ACTUAL BEHAVIOR (from logs)

### ✅ TURNS 1-3: CORRECT (Matches Flow)

**Turn 2 (Greeting wrap):**
```
[PHASE_STATUS] Opening question sealed
[LLM_GATE] Pre-cleared after opening question delivery (Turn 3 guard)
```
Agent correctly asks about "Campaign Metrics and Slack Reporting System"

**Turn 3 (First answer):**
```
[EVAL] > turn=3 STARTED | topic='Campaign Metrics and Slack Reporting System'
[EVAL] turn=3 action=PROBE probe_mode=clarification
[DECISION] 🔄 PROBE family=clarification
[EVAL] turn=3 | DECISION=PROBE(clarification) | STAYING ON: 'Campaign Metrics...'
```
✅ Evaluation correctly returns PROBE. Agent should build probe.

---

### ❌ TURN 4: EVALUATION HIJACKS TOPIC SELECTION

**Turn 4 answer (candidate rambles):**
```
Candidate: "Okay. So first, I'll go through the Slack. Sorry. First, I'll go through 
the campaigns. Nothing is working well, then I'll see why it's not working well. 
Then after that, what I'll do is so next thing, I'll re reverify all the campaigns..."

[EVAL] turn=4 | explicit redirect -- MOVE_ON immediately
[EVAL] turn=4 | DECISION=MOVE_ON | TOPIC SWITCH: 
  'Campaign Metrics and Slack Reporting System' 
  → 'Multi Channel Lead Qualification System - Created automated lead...'
[EVAL] turn=4 | MOVE_ON directive injected | new_topic='Multi Channel...'
```

**🚨 CRITICAL BUG #1:** Evaluation code (eval_pipeline.py:339-383) returns MOVE_ON before agent can decide.

**🚨 CRITICAL BUG #2:** Agent runtime code (agent_runtime.py:1818-1866) reads eval decision and **picks the next topic itself** instead of agent doing it:

```python
# agent_runtime.py:1818-1825
elif _action == "MOVE_ON":
    _old_topic = _active_topic
    _mark_topic_covered(_old_topic)
    _next_topic = _next_uncovered_topic(exclude=_old_topic)  # ← Agent picks topic
    async with _session_state_lock:
        _active_topic = _next_topic or _old_topic
```

**🚨 CRITICAL BUG #3:** The evaluation is deciding to MOVE_ON based on `_candidate_cannot_answer()` heuristic (eval_pipeline.py:339) **BEFORE** saturation scoring:

```python
# eval_pipeline.py:339-383
_cannot_answer = _candidate_cannot_answer(p.answer)

if _is_redirect:
    logger.info("[EVAL] turn=%d | explicit redirect -- MOVE_ON immediately", p.turn)
    return {
        "action": "MOVE_ON",  # ← Eval decides to move on BEFORE saturation calc
        ...
    }
```

This bypasses the saturation and follow-up counting logic entirely.

---

### TURN 4 DETAILED TRACE

Let me trace turn 4 step-by-step from logs:

```
TIMESTAMP: 15:12:07,905
[QUALITY] turn=4 | clarity=1.0 depth=0.0 specificity=0.0 grounding=0.0 | avg=0.25 weighted=0.20
[EVAL] turn=4 action=MOVE_ON probe_mode=normal quality_avg=0.25 signals=[example_evasion]
[SAT_CALC] score: 1.0 -> 2.0 (delta=+1.0) | follow_ups: 1 -> 2
[SAT_RESULT] 🔄 NOT SATURATED | score=2.0 < threshold=5.0 (40% done) | need 3.0 more
[DECISION] [OK] MOVE_ON reason=candidate_cannot_answer turn=4
```

**🚨 SMOKING GUN:** Turn 4 has:
- Quality score: **0.25** (extremely low)
- Saturation: **2.0 / 5.0** (only 40% done — NOT saturated)
- Reason: **candidate_cannot_answer** ← Eval heuristic triggered

**This violates `flow.md` because:**
1. Topic should NOT switch until saturation >= 5.0
2. Agent should decide MOVE_ON, not eval's heuristic
3. Topic has only 2 follow-ups; saturation rules say keep probing

---

## ROOT CAUSE ANALYSIS

### Bug #1: Eval Making Topic Decisions

**Location:** `interview/eval_pipeline.py:337-383`

```python
_is_redirect = (
    _utterance_cls is not None
    and _utterance_cls["response_class"] == "explicit_redirect"
)
_cannot_answer = _candidate_cannot_answer(p.answer)  # ← Heuristic decides fate

if _is_redirect:
    logger.info("[EVAL] turn=%d | explicit redirect -- MOVE_ON immediately", p.turn)
    return {
        "action": "MOVE_ON",  # ← Eval returns MOVE_ON before saturation calc
        ...
    }
```

**Problem:**
- `_candidate_cannot_answer()` is a heuristic that detects rambling/evasion
- When it fires, eval returns MOVE_ON **immediately**, bypassing saturation logic
- Agent never gets to apply its own judgment

**Why it's wrong:**
- Eval is supposed to SCORE, not DECIDE topic switches
- Agent should apply saturation thresholds, not eval's heuristics
- "Cannot answer" ≠ "should move on" — the agent owns that decision

---

### Bug #2: Agent Topic Selection Happens In Runtime, Not Eval

**Location:** `interview/agent_runtime.py:1818-1866`

```python
elif _action == "MOVE_ON":
    # -- Agent picks the next topic ----------------------------
    _old_topic = _active_topic
    _mark_topic_covered(_old_topic)
    _next_topic = _next_uncovered_topic(exclude=_old_topic)  # ← Agent picks here

    async with _session_state_lock:
        _active_topic = _next_topic or _old_topic
    
    logger.info("[EVAL] turn=%d | TOPIC SWITCH: %r -> %r", ..., _old_topic, _active_topic)
    _next_question = _build_move_on_question(_active_topic or "")
    
    # Wipe conversation history ...
    _directive = "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n..."
```

**Problem:**
- Agent does pick the topic with `_next_uncovered_topic()`
- But only AFTER eval has forced MOVE_ON decision
- Eval should never force MOVE_ON; it should only recommend it

**Why it's wrong:**
- Agent executes eval's decision, not its own judgment
- Agent follows saturation thresholds blindly
- No agent-level strategy for when to probe vs. move

---

### Bug #3: Saturation Logic Bypassed by `_candidate_cannot_answer`

**Location:** `interview/eval_pipeline.py:509-549`

Saturation calculation happens at line 513:
```python
is_saturated, saturation_status = evaluate_topic_saturation(...)
```

But if `_candidate_cannot_answer()` triggered earlier (line 339), the function returns early and saturation is **never computed**:

```
EARLY RETURN (line 344-361):
  return {
      "action": "REPHRASE",
      "saturation": {"score": 0, ...}  # ← Placeholder, not real calc
  }

EARLY RETURN (line 365-383):
  return {
      "action": "MOVE_ON",
      "saturation": {"score": 0, ...}  # ← Placeholder, not real calc
  }
```

**Evidence from Turn 4 logs:**
```
[SAT_RESULT] 🔄 NOT SATURATED | score=2.0 < threshold=5.0 (40% done) | need 3.0 more
[DECISION] [OK] MOVE_ON reason=candidate_cannot_answer turn=4
```

Saturation was computed (2.0), but the decision **ignored it** because `_candidate_cannot_answer` took precedence.

---

### Bug #4: Turn 4 Topic Switch Was Not Required By Flow

**According to `flow.md`:**
- "Campaign Metrics" saturation threshold: **5.0** (CRITICAL importance)
- Turn 4 saturation: **2.0 / 5.0** (40% done)
- Expected action: Continue probing until 5.0
- Actual action: MOVE_ON (to "Multi Channel Lead Qualification System")

**Why Turn 4 triggered a switch:**
1. Candidate rambled / gave unclear answer
2. `_candidate_cannot_answer()` detected example_evasion signal
3. Eval returned MOVE_ON with `reason=candidate_cannot_answer`
4. Agent picked next topic
5. LLM asked about new topic

**This is wrong because:**
- Saturation was NOT met (2.0 < 5.0)
- Agent should have probed harder, not jumped topics
- Eval's heuristic overrode saturation logic

---

## TURNS 5-7: PATTERN REPEATS

### Turn 5: Saturation at 1.2/3.0, Still Probing ✓

```
[TOPIC_STATE] CREATED | topic=Multi Channel Lead Qualification System ... threshold=3.0
[SAT_RESULT] 🔄 NOT SATURATED | score=1.2 < threshold=3.0 (40% done) | need 1.8 more
[DECISION] 🔄 PROBE family=clarification
[EVAL] turn=5 | DECISION=PROBE(clarification) | STAYING ON: 'Multi Channel...'
```

✅ Correct: Saturation not met (1.2 < 3.0), eval recommends PROBE.

### Turn 6: Saturation at 2.9/3.0, Still Probing ✓

```
[SAT_RESULT] 🔄 NOT SATURATED | score=2.9 < threshold=3.0 (96% done) | need 0.1 more
[DECISION] 🔄 PROBE family=depth
[EVAL] turn=6 | DECISION=PROBE(depth) | STAYING ON: 'Multi Channel...'
```

✅ Correct: Very close to saturation (2.9 < 3.0), eval recommends PROBE.

### Turn 7: Saturation at 4.1/3.0, Move On ✓

```
[SAT_RESULT] [OK] SATURATED | score=4.1 >= threshold=3.0 (100%)
[DECISION] [OK] MOVE_ON reason=saturated
[EVAL] turn=7 | TOPIC SWITCH: 'Multi Channel Lead Qualification System' -> 'n8n'
[EVAL] turn=7 | MOVE_ON directive injected | new_topic='n8n'
```

✓ **Technically correct** — saturation threshold met (4.1 >= 3.0).

**But here's the problem:** Topic switched from "Multi Channel Lead Qualification System" (project) to "n8n" (skill). This is fine per flow.md, but notice what happened at Turn 5:

```
Turn 4: Topic = "Campaign Metrics" (CRITICAL, threshold=5.0)
        → Jumped to "Multi Channel Lead" (MEDIUM, threshold=3.0) via _candidate_cannot_answer
        
Turn 7: Topic = "Multi Channel Lead" (MEDIUM, threshold=3.0)
        → Jumped to "n8n" (skill, threshold=3.0) via saturation
```

**The original "Campaign Metrics" topic was abandoned at 2.0/5.0 saturation — only 40% complete.**

---

## COMPARISON: EXPECTED vs. ACTUAL

| Turn | Expected Topic | Expected Sat | Actual Topic | Actual Sat | Root Cause |
|------|---|---|---|---|---|
| 3 | Campaign Metrics | 1.0/5.0 (PROBE) | Campaign Metrics | 1.0/5.0 (PROBE) | ✅ Correct |
| 4 | Campaign Metrics | ~2.5/5.0 (PROBE) | Multi Channel | 0/3.0 | ❌ _candidate_cannot_answer forced MOVE_ON |
| 5 | Multi Channel | 1.2/3.0 (PROBE) | Multi Channel | 1.2/3.0 (PROBE) | ✅ Correct |
| 6 | Multi Channel | 2.9/3.0 (PROBE) | Multi Channel | 2.9/3.0 (PROBE) | ✅ Correct |
| 7 | Multi Channel | ~3.0+/3.0 (MOVE_ON?) | n8n | 0/3.0 (MOVE_ON) | ✅ Correct saturation, but topic picked by agent post-eval |

---

## REQUIRED CODE CHANGES

### Change #1: Eval Must ONLY Compute Saturation, Not Force MOVE_ON

**File:** `interview/eval_pipeline.py`  
**Lines:** 335-383

**Current code (WRONG):**
```python
_cannot_answer = _candidate_cannot_answer(p.answer)

if _is_redirect:
    logger.info("[EVAL] turn=%d | explicit redirect -- MOVE_ON immediately", p.turn)
    return {
        "action": "MOVE_ON",  # ← Eval forces decision
        ...
    }
```

**Fixed code:**
```python
# Do NOT check _candidate_cannot_answer before saturation calc
# Let saturation logic handle it

# Remove early MOVE_ON return for redirect
# Instead: compute saturation, and let depth_decay / weak_exit handle it
```

**Rationale:**
- Eval should return saturation score + quality, not action
- Agent reads results and decides PROBE vs. MOVE_ON
- Eval's heuristics (`_candidate_cannot_answer`) are signals, not commands

---

### Change #2: Move Action Decision to Agent

**File:** `interview/agent_runtime.py`  
**Lines:** 1800-1890

**Current flow:**
1. Eval returns action ("PROBE" | "MOVE_ON")
2. Agent reads action and executes it

**Fixed flow:**
1. Eval returns saturation + quality + signals
2. Agent computes action:
   - If saturation >= threshold: MOVE_ON
   - Else if quality + signals → PROBE
   - Else if weak_exit: MOVE_ON
   - Else: PROBE

**Code outline:**
```python
# Agent decides action based on eval signals
if eval_saturation.is_saturated:
    _action = "MOVE_ON"
elif eval_result.get("weak_exit"):
    _action = "MOVE_ON"
else:
    _action = eval_result.get("action", "PROBE")  # Default to PROBE

# Then: agent builds directive based on action
if _action == "MOVE_ON":
    _old_topic = _active_topic
    _mark_topic_covered(_old_topic)
    _next_topic = _next_uncovered_topic(exclude=_old_topic)
    _active_topic = _next_topic or _old_topic
    # ... build MOVE_ON directive
```

---

### Change #3: Remove Topic Picking from Eval

**File:** `interview/eval_pipeline.py`  
**Lines:** 693-695 (in agent_runtime where eval injects topic)

**Current (WRONG):**
```python
logger.info("[EVAL] turn=%d | MOVE_ON directive injected | new_topic=%r", turn_snapshot, _active_topic)
```

**Fixed (Agent owns it):**
```python
# Eval NEVER picks topic. Remove this logic entirely.
# Agent calls _next_uncovered_topic() after eval returns MOVE_ON signal.
```

---

## SATURATION THRESHOLD VIOLATIONS

Turn 4 left "Campaign Metrics" at **2.0 / 5.0** (40% complete):

```python
# This should never happen. The saturation threshold (5.0) was NOT met,
# yet eval forced MOVE_ON via _candidate_cannot_answer heuristic.

[SAT_RESULT] 🔄 NOT SATURATED | score=2.0 < threshold=5.0 (40% done)
[DECISION] [OK] MOVE_ON reason=candidate_cannot_answer turn=4  # ← WRONG!
```

**Expected behavior:**
```
If sat < threshold:
    → PROBE (ask follow-up to gather more depth)

If sat >= threshold:
    → MOVE_ON (topic is saturated, pick next)

If candidate clearly cannot answer (extreme low quality):
    → Maybe MOVE_ON, but only if saturation < threshold * 0.2
```

---

## SUMMARY OF DEVIATIONS

| Issue | Source | Impact | Severity |
|-------|--------|--------|----------|
| Eval forces MOVE_ON via `_candidate_cannot_answer` before saturation calc | eval_pipeline.py:339-383 | Topics switch before saturation met | CRITICAL |
| Agent picks topic only after eval decides | agent_runtime.py:1818-1866 | Flow control in wrong place | HIGH |
| Saturation bypassed when redirect/evasion detected | eval_pipeline.py:513-520 | Follow-up counting breaks | CRITICAL |
| `_candidate_cannot_answer` is evaluated before saturation | eval_pipeline.py:339 | Early exits skip saturation logic | CRITICAL |
| Eval injects MOVE_ON directive with topic | agent_runtime.py:1866 | Eval controls interview flow | HIGH |

---

## IMPLEMENTATION FIXES

### Step 1: Refactor Eval to Return Signals, Not Actions

```python
# eval_pipeline.py: Change return structure
return {
    "action": None,  # Agent will decide (PROBE/MOVE_ON/REPHRASE)
    "saturation": {
        "score": current_topic_state.saturation_score,
        "threshold": current_topic_state.saturation_threshold,
        "is_saturated": is_saturated,
        "weak_exit": _weak_exit,
    },
    "quality": td["quality"],
    "signals": signal_events,
    "cannot_answer_signal": _cannot_answer,  # Signal only, not command
    ...
}
```

### Step 2: Agent Decides Action

```python
# agent_runtime.py:1800-1860
eval_result = await eval_gate_fn(...)

# Agent applies saturation logic
if eval_result["saturation"]["is_saturated"]:
    _action = "MOVE_ON"
elif eval_result["saturation"]["weak_exit"]:
    _action = "MOVE_ON"
elif eval_result["cannot_answer_signal"]:
    # Optional: Check if we've tried 3+ follow-ups
    # If yes: MOVE_ON; else: PROBE
    if follow_up_count >= 3:
        _action = "MOVE_ON"
    else:
        _action = "PROBE"
else:
    _action = eval_result.get("action", "PROBE")  # Use LLM judge default

# Now agent executes action
if _action == "MOVE_ON":
    # Agent picks topic
    _old_topic = _active_topic
    _mark_topic_covered(_old_topic)
    _next_topic = _next_uncovered_topic(exclude=_old_topic)
    _active_topic = _next_topic
    # Build directive with _active_topic
```

### Step 3: Remove Topic Picking from Eval

Delete lines in agent_runtime.py that show eval picked the topic:
```python
# DELETE THIS:
logger.info("[EVAL] turn=%d | MOVE_ON directive injected | new_topic=%r", turn_snapshot, _active_topic)
```

---

## VERIFICATION CHECKLIST

After fixes, verify:

- [ ] Turn 4 candidate (rambling): Saturation = 2.0/5.0 → PROBE (not MOVE_ON)
- [ ] Eval returns saturation + signals, no action decision
- [ ] Agent reads eval signals and applies thresholds
- [ ] Agent calls `_next_uncovered_topic()` only after MOVE_ON decision
- [ ] Chat history wiped only after agent decides MOVE_ON
- [ ] `flow.md` directives match actual execution
- [ ] Topics don't switch until saturation >= threshold (or weak_exit)
- [ ] Follow-up counting works correctly
- [ ] No early eval returns that skip saturation logic

---

## CONCLUSION

The interview system **correctly implements the opening flow** (greetings, warmups, opening question), but **evaluation hijacks control at turn 3-4** by making MOVE_ON decisions based on heuristics instead of saturation. The agent then dutifully picks topics and asks questions, but the flow has already been corrupted.

**To fix:** Move action decisions from eval to agent. Eval scores; agent decides. Saturation is law, not advisory.
