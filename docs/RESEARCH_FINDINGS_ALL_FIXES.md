# Research Findings: Complete Documentation Review

**Date:** 2026-06-01  
**Scope:** Research for all 4 critical fixes  
**Status:** Research complete — ready for implementation

---

## FIX #1: Fragmented Answers (STT Assembly Configuration)

### Research: Deepgram VAD Endpointing

**Source:** [Endpointing | Deepgram's Docs](https://developers.deepgram.com/docs/endpointing)

#### Key Findings

1. **Default endpointing:** 10ms (very aggressive)
2. **Customization:** Set `endpointing=<milliseconds>` parameter
3. **Disable:** Set `endpointing=false`
4. **How it works:** VAD detects speech→silence transitions. When silence ≥ endpointing value, returns `speech_final=true`

#### Optimal Settings Guidance

- **Aggressive (10-350ms):** Fast response but risk of cutting off multi-clause answers mid-thought
- **Moderate (400-800ms):** Balanced for natural speech patterns with pauses
- **Conservative (1000-1500ms):** Prevents cut-offs, captures full answers including pauses between clauses

#### For Multi-Clause Sentences

**Problem:** Current setting (350ms) assumes 350ms silence = end of utterance, but speakers naturally pause between clauses

**Best Practice:** Use 800-1000ms for interviews where candidates give detailed answers with natural pauses

**Evidence from docs:** "Be aware that in environments with significant background noise... the background noise can cause the VAD to trigger and prevent the detection of silent audio"

---

### Research: LiveKit Agents STT Assembly

**Source:** [Turns overview | LiveKit docs](https://docs.livekit.io/agents/build/turns/)

#### Turn Detection Modes

LiveKit supports 5 detection approaches:
1. Custom turn detector model
2. Realtime models (OpenAI Realtime, Gemini Live)
3. **VAD only** ← Currently used
4. STT endpointing
5. Manual turn control

#### Assembly Grace Period Configuration

**In our code:** `debounce_seconds = _STT_INTERVIEW_ASSEMBLY_GRACE_SECONDS = 0.75`

**How it works:**
- STT returns fragments as they arrive (live transcript updates)
- Agent waits `debounce_seconds` after fragment before deciding "turn is complete"
- If new fragment arrives within grace period, extends the turn
- If silence > grace period, finalizes turn and sends to evaluator

#### Problem with 0.75s Grace

Candidate answer structure:
```
[Clause 1] [0.5s pause] [Clause 2] [0.5s pause] [Clause 3]
```

With 0.75s grace:
- Clause 1 + 0.5s pause = turn ends (0.5s < 0.75s BUT STT endpoint triggered)
- Actually gets fragmented at 350ms Deepgram endpointing

**Compounding issue:** Deepgram (350ms) + Agent grace (0.75s) = splits multi-clause answers

#### Optimal Configuration

Two levers:
1. **Increase Deepgram endpointing:** 350ms → 800-1000ms
2. **Increase agent grace period:** 0.75s → 2.0s

**Why both?** Deepgram decides where VAD cuts. Grace period decides when to wait for more fragments. Both needed.

---

## FIX #2: Eval Failure Fallback

### Research: Graceful Degradation Patterns

**Source:** [Error Recovery and Fallback Strategies in AI Agent Development](https://www.gocodeo.com/post/error-recovery-and-fallback-strategies-in-ai-agent-development)

#### Silent vs. Explicit Recovery

**Anti-pattern (current code):**
```
IF eval times out:
    → Inject fallback directive silently
    → Continue as if normal routing decision
    → No log indicating this was recovery
```

**Problem:** Masks real failures, agent loses control of decisions

**Best practice:**
```
IF eval times out:
    → Log CRITICALLY that eval failed
    → Escalate to agent-level decision
    → Agent applies fallback logic (same decision path, just with default values)
    → Clear logging that this was recovery, not normal routing
```

#### Multi-Layered Approach

From [LLM Error Handling and Fallback Strategies for Production](https://www.buildmvpfast.com/blog/building-with-unreliable-ai-error-handling-fallback-strategies-2026):

- **Circuit Breaker Pattern:** Track failures, stop retrying after threshold
- **Graceful Degradation:** Reduce feature set but maintain core function
- **Orchestrator Pattern:** Route to backup module based on error type

#### Our Case

Current: Silent recovery, hidden from agent  
Should be: Escalate to agent, apply normal decision_logic with default eval result

**Default eval result:**
```python
{
    "action": "PROBE",  # Safe default: stay on topic
    "probe_family": "clarification",  # Generic probe
    "saturation": {
        "is_saturated": False,  # Conservative: don't force MOVE_ON
        "weak_exit": False,
        "depth_decay": False,
        "score": 0.0,
        "threshold": 5.0,
    },
    # ... rest of fields ...
}
```

This goes through normal agent decision_logic, which respects saturation thresholds.

---

### Research: Python asyncio Timeout Best Practices

**Source:** [Asyncio wait_for() to Wait With a Timeout – SuperFastPython](https://superfastpython.com/asyncio-wait_for/)

#### Timeout Specification

- Value: `None` (no timeout), integer or float (seconds)
- Exception: `asyncio.TimeoutError` raised if timeout exceeded
- Cancellation: Underlying task is cancelled, may need cleanup

#### Error Handling Pattern

```python
try:
    result = await asyncio.wait_for(task, timeout=10.0)
except asyncio.TimeoutError:
    # Handle timeout: escalate, log critically, apply fallback
    logger.critical("Task timed out")
except Exception as e:
    # Handle other failures
    logger.error(f"Task failed: {e}")
```

#### Modern Approach (Python 3.11+)

**Better:** Use `asyncio.timeout()` instead of `wait_for()`
- Faster (no new task creation)
- Cleaner syntax
- Supports `timeout.expired` boolean

But current code uses wait_for (compatible with Python 3.9+), which is fine.

---

## FIX #3: LLM Gate Timeout

### Research: OpenAI API Timeout Configuration

**Source:** [How do I handle API timeouts and retries when using OpenAI?](https://milvus.io/ai-quick-reference/how-do-i-handle-api-timeouts-and-retries-when-using-openai)

#### Default & Recommended Timeouts

- **Default:** 10 minutes (production-safe, very conservative)
- **Simple completions:** 10-20 seconds
- **Complex tasks:** 30 seconds or more
- **Streaming:** First token in <100ms, full response in 1-2 seconds

#### Retry Strategy

OpenAI SDK auto-retries:
- 429 (rate limit): exponential backoff
- 5xx errors: exponential backoff
- Timeouts: exponential backoff
- Max default retries: 2

#### For Our Case

Current gate timeout: **45 seconds**
Expected eval time: **<2 seconds** (with streaming optimization)

**Problem:** Waiting 45 seconds for something that should arrive in <2 seconds wastes time and masks eval stalls

**Solution:** Reduce to **5 seconds** (safe upper bound, but signals stall quickly)

---

### Research: Circuit Breaker Pattern

**Source:** [Fault Tolerance in LLM Pipelines: Key Techniques | Latitude](https://latitude.so/blog/fault-tolerance-llm-pipelines-techniques/)

#### Circuit Breaker States

1. **CLOSED** (normal): Track failures, allow requests
2. **OPEN** (threshold exceeded): Block requests, fail fast
3. **HALF-OPEN** (cooldown): Test if service recovered

#### Application to Gate Timeout

If eval consistently times out:
- Current: Wait 45s, then recover
- Better: After 2-3 timeouts, open circuit, fail fast
- Recovery: Explicitly signal retry or escalate

We won't implement full circuit breaker, but the pattern suggests: **fail fast on timeout, don't wait 45 seconds**.

---

## FIX #4: Eval Contract Drift

### Research: Separation of Concerns in Agent Architectures

**Key Principle:** Each component has a single responsibility

**Current violation:**
- Eval computes: clarity, depth, specificity, grounding, **probe_goal, probe_style**
- Agent uses eval's probe_goal/style directly

**Should be:**
- Eval computes: quality scores, signal detection
- Agent computes: probe strategy (family → goal → style)

#### Why This Matters

From [LangGraph Agent Error Handling in Production | Focused](https://focused.io/lab/langgraph-agent-error-handling-production):

> "Clear separation of concerns makes error handling and testing easier. Each node should have one responsibility."

**In our case:**

Eval's responsibility:
- Score the answer
- Detect signals
- Calculate saturation
- Recommend action (PROBE vs MOVE_ON)

Agent's responsibility:
- Own all decisions
- Map probe_family → goal
- Map probe_family → style
- Build full directive with context

**Coupling problem:**
If eval's probe_goal logic changes, agent breaks.
If agent's probe strategy changes, eval needs updating.

**Decoupled solution:**
Eval returns action + probe_family only.
Agent always computes goal/style from family.
Each can evolve independently.

---

### Research: Probe Family Determination

**Current code:** `_probe_family` set in eval_pipeline.py, used by agent

**Should be:** Agent-computed based on signals detected by eval

**Logic:**
```python
# In agent, NOT eval:
if signal_name == "example_evasion":
    probe_family = "depth"  # Probe deeper
elif signal_name == "generic_answer":
    probe_family = "specificity"  # Get specific
elif signal_name == "weak_exit":
    probe_family = "clarification"  # Clarify
elif signal_name == "pressure":
    probe_family = "pressure"  # Apply pressure
else:
    probe_family = "ownership"  # Default: probe ownership
```

Then:
```python
probe_goal = get_probe_goal(probe_family)      # Deterministic lookup
probe_style = get_probe_style(probe_family)    # Deterministic lookup
```

This keeps eval focused on detection, agent on strategy.

---

## Summary: Implementation Order & Rationale

### Phase 1: Fix Eval Failure (CRITICAL)
- **File:** agent_runtime.py:1754-1767
- **Change:** Silent recovery → escalate to agent decision_logic
- **Reason:** Agent ownership is foundational
- **Effort:** 20 minutes

### Phase 2: Fix Eval Contract (HIGH)
- **Files:** eval_pipeline.py + agent_runtime.py
- **Change:** Remove probe_goal/style from eval return; agent computes
- **Reason:** Clean separation of concerns
- **Effort:** 15 minutes

### Phase 3: Fix STT Assembly (CRITICAL)
- **File:** agent_runtime.py:1357 + agent_providers.py
- **Change:** Increase endpointing (350→800ms) + assembly grace (0.75→2.0s)
- **Reason:** Capture complete answers, not fragments
- **Effort:** 10 minutes

### Phase 4: Fix Gate Timeout (MEDIUM)
- **File:** agent_runtime.py:333
- **Change:** Reduce timeout 45s → 5s
- **Reason:** Fail fast on eval stalls, improve logs
- **Effort:** 5 minutes

---

## Testing Strategy

### Unit Tests
1. Eval failure → default result flows through agent decision_logic
2. Probe goal/style deterministically computed from family
3. Assembly grace captures multi-clause answers
4. Gate timeout triggers within 5 seconds

### Integration Tests
Run full interview, verify:
- No fragmented answers (turns 3-20)
- `[AGENT] decision_logic:` log every eval turn
- Saturation thresholds respected
- MOVE_ON happens at right saturation level
- No `[RECOVER_EVAL_ERROR]` in normal flow

### Failure Scenarios
- Simulate eval timeout → should escalate to agent, not silent recovery
- Simulate eval returning None → should use default result
- Simulate STT fragmentation → longer grace should collect full answer

---

## References

**Deepgram:**
- [Endpointing | Deepgram's Docs](https://developers.deepgram.com/docs/endpointing)
- [Understanding End of Speech Detection | Deepgram](https://developers.deepgram.com/docs/understanding-end-of-speech-detection)

**LiveKit:**
- [Turns overview | LiveKit docs](https://docs.livekit.io/agents/build/turns/)
- [Using a transformer to improve end of turn detection | LiveKit](https://livekit.com/blog/using-a-transformer-to-improve-end-of-turn-detection)

**Error Handling & Resilience:**
- [Error Recovery and Fallback Strategies | Gocodeo](https://www.gocodeo.com/post/error-recovery-and-fallback-strategies-in-ai-agent-development)
- [Graceful Degradation in LLM Frameworks | Markaicode](https://markaicode.com/implement-graceful-degradation-llm-frameworks/)
- [Fault Tolerance in LLM Pipelines | Latitude](https://latitude.so/blog/fault-tolerance-llm-pipelines-techniques/)

**Python asyncio:**
- [Asyncio wait_for() | SuperFastPython](https://superfastpython.com/asyncio-wait_for/)

**OpenAI API:**
- [Timeout and Retry Handling | Milvus AI Reference](https://milvus.io/ai-quick-reference/how-do-i-handle-api-timeouts-and-retries-when-using-openai)
- [Error codes | OpenAI API Docs](https://developers.openai.com/api/docs/guides/error-codes)

---

## Ready for Implementation

All research complete. Proceeding with 4-fix implementation in order.
