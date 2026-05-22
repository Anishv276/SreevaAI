# Agent-Eval Synchronization Integration Guide

## Problem
The current architecture has a **race condition**:
- Turn N eval result comes back 4+ seconds AFTER turn N+1 LLM generation starts
- Agent asks old topic follow-up instead of moving to new topic
- Fire-and-forget `asyncio.ensure_future()` doesn't guarantee injection before LLM runs

Example from your logs:
```
Turn 5: Eval says MOVE_ON to Sensex Analysis Project
Turn 6: Agent asks: "How did you decide what logic...?" (still about old topic)
```

## Root Cause
1. **No blocking gate** between user turn and LLM generation
2. **Eval result read is defensive**, happens AFTER LLM generation has already started
3. **Fire-and-forget injection** via `asyncio.ensure_future()`
4. **One-turn lag assumption broken** by 4-second eval latency

## Solution: Explicit State Machine

### Architecture Changes

**Before (Current):**
```
User speaks
  ↓
_process_user_conversation_item()
  ├─ asyncio.ensure_future(_inject_directive) ← Background task, might miss LLM
  ├─ _read_and_apply_eval_result() ← Already too late, LLM started
  └─ return (LLM generates here)
       ↓
LLM response generated (with wrong topic!)
       ↓
Eval result arrives (4 seconds later) - too late
```

**After (New):**
```
User speaks
  ↓
AgentTurnStateMachine.process_user_turn()
  │
  ├─ GATE 1: await wait_for_eval_result(turn-1, timeout=5s)
  │          └─ BLOCKS until previous turn's eval result arrives
  │
  ├─ APPLY: state.apply_eval_result(eval_result)
  │         └─ Update topic, signals, scores atomically
  │
  ├─ INJECT: state.inject_directive_into_chat_context()
  │          └─ Add directive+topic_lock to chat_ctx
  │
  └─ GENERATE: LLM generates (directive already in context)
                └─ Always uses correct topic
                   ↓
                Eval result available BEFORE generation starts ✅
```

## Implementation Steps

### Step 1: Create InterviewState at session init

**File:** `interview/agent_runtime.py`, around line 1200 (where session is created)

Replace the loose variable tracking with a unified state object:

```python
# BEFORE (current - many loose variables):
_active_topic = None
_topic_states = {}
_covered_topic_keys = set()
_injected_directive = ""
# ... 50+ other variables

# AFTER (new - unified state):
from interview.agent_state_machine import InterviewState, AgentTurnStateMachine

session_state = InterviewState(
    app_id=app_id,
    session_start_time=session_start_time,
    job_title=job_title,
    current_turn=0,
    warmup_complete=False,
    chat_ctx=chat_ctx,
    redis_client=_eval_redis_client,
)

state_machine = AgentTurnStateMachine(session_state, _eval_redis_client)
```

### Step 2: Replace _process_user_conversation_item

**File:** `interview/agent_runtime.py`, around line 1324

Current flow (problematic):
```python
async def _process_user_conversation_item(event, content: str, role: str, turn_snapshot: int):
    # ... validation ...
    
    # PROBLEM: This happens AFTER or DURING LLM generation
    if warmup_complete and turn_count > 2 and _eval_redis_client:
        asyncio.ensure_future(_inject_directive_before_llm())  # ← Fire-and-forget!
    
    # PROBLEM: Blocks for eval result, but LLM generation waits for this function to return
    try:
        applied = await _read_and_apply_eval_result(turn_snapshot)
    except Exception:
        pass
    
    # Function returns, and THEN LiveKit triggers LLM generation
    # But directive might not be injected yet!
```

New flow (synchronized):
```python
async def _process_user_conversation_item(event, content: str, role: str, turn_snapshot: int):
    # ... validation ...
    
    # WAIT FOR EVAL RESULT (BLOCKING)
    # This is now called FIRST, before anything else
    if warmup_complete and turn_snapshot > 2:
        await state_machine.process_user_turn(
            turn_number=turn_snapshot,
            user_answer=content,
        )
        # Function returns only after:
        # 1. Previous turn's eval result is received
        # 2. State is applied
        # 3. Directive is injected into chat_ctx
        # 4. LLM is ready to generate
    
    # Push current turn for eval (background, no blocking)
    payload = _build_eval_payload()
    await state_machine.push_eval_payload(payload)
```

### Step 3: Update _read_and_apply_eval_result

**File:** `interview/agent_runtime.py`, around line 1600

Current:
```python
async def _read_and_apply_eval_result(turn_for_log):
    # Reads from Redis
    raw = await _eval_redis_client.getdel(...)
    result = json.loads(raw)
    
    # Applies mutations with 50+ lines of code scattered
    _active_topic = result.get("new_active_topic", _active_topic)
    _covered_topic_keys = set(result.get("new_covered_topic_keys", []))
    answer_scores.append(result.get("quality_record"))
    # ... 40 more lines of individual assignments
    
    chat_ctx.add_message(role="system", content=directive)  # Injection happens HERE
```

New:
```python
async def _read_and_apply_eval_result(turn_for_log):
    # Just read from Redis
    raw = await state_machine.redis_client.getdel(...)
    result_dict = json.loads(raw)
    
    # Let state machine handle all mutations atomically
    result = EvalResultSnapshot.from_dict(result_dict)
    session_state.apply_eval_result(result)
    
    # Directive injection is NOW the job of state machine
    # (happens before user's next turn processes)
```

### Step 4: Update topic state tracking

**File:** `interview/agent_runtime.py`, throughout

Replace all direct assignments:
```python
# BEFORE:
_active_topic = result.get("new_active_topic", _active_topic)
_topic_states[_active_topic] = TopicState(...)
_covered_topic_keys = set(...)

# AFTER:
# All mutations go through:
session_state.apply_eval_result(result)
# Then read from state object:
current_topic = session_state.active_topic
topic_state = session_state.topic_states.get(current_topic)
covered = session_state.covered_topic_keys
```

### Step 5: Remove fire-and-forget injection

**File:** `interview/agent_runtime.py`, around line 2029-2059

Delete this entire block:
```python
# DELETE THIS:
if warmup_complete and turn_count > 2 and _eval_redis_client:
    async def _inject_directive_before_llm(_tc=turn_count):
        try:
            _raw = await asyncio.wait_for(
                _eval_redis_client.get(f"interview:{app_id}:eval_result"),
                timeout=0.25,
            )
            if _raw:
                _r = json.loads(_raw)
                _d = _r.get("directive", "")
                if _d:
                    remove_system_messages(chat_ctx, "[NEXT_TURN_DIRECTIVE")
                    chat_ctx.add_message(role="system", content=_d)
                    ...
        except asyncio.TimeoutError:
            logger.warning("[INJECT_EARLY] ...")
    asyncio.ensure_future(_inject_directive_before_llm())  # ← REMOVE
```

Replace with single blocking call in `_process_user_conversation_item`:
```python
# In _process_user_conversation_item, at the TOP after validation:
if warmup_complete and turn_snapshot > 2:
    await state_machine.process_user_turn(turn_snapshot, content)
    # This single call now does:
    # 1. Wait for eval result
    # 2. Apply state
    # 3. Inject directive
    # Then returns, ready for LLM
```

## Testing the Fix

### Test Case 1: Turn transition (PROBE → PROBE)
```
Turn 4: Eval decides PROBE (ownership mode)
Turn 5: Agent generates follow-up about same topic ✅

Expected:
- Directive arrives before turn 5 LLM generation
- Agent asks: "What specifically did YOU build?"
```

### Test Case 2: Topic transition (PROBE → MOVE_ON)
```
Turn 5: Eval decides MOVE_ON to Sensex
Turn 6: Agent generates question about Sensex ✅

Expected:
- Eval result: turn=5, action=MOVE_ON, new_active_topic=Sensex
- State machine applies this BEFORE turn 6 LLM
- Agent asks about Sensex, not old topic
```

### Test Case 3: Timeout fallback
```
Turn 7: Eval worker times out (>5s)
Turn 8: Agent generates without waiting ✅

Expected:
- state_machine.wait_for_eval_result() timeout after 5s
- Falls back to inline eval or continues with current state
- Agent generates without hanging
```

## Logging to Verify Sync

Once integrated, you should see:

```
[SM_START] turn=6 | waiting for previous eval result...
[WAIT_EVAL] ✅ turn=5 Received: action=MOVE_ON topic=Sensex Analysis Project signals=[]
[STATE] Applying eval result turn=5 action=MOVE_ON | topic: Multi Channel→Sensex | signals=[]
[TOPIC_CHANGE] Multi Channel Lead Qualification System → Sensex Analysis Project (turn=5)
[SATURATION_UPDATE] topic='Sensex Analysis Project' | score=0.0/6.5 (0%) | follow_ups=0 | saturated=False
[DIRECTIVE_READY] turn=5 action=MOVE_ON | directive_preview: [NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD] ↵ DECISION: MOVE_ON ↵ NEW ACTIVE TOPIC: Sensex Analysis Project
[DIRECTIVE_INJECTED] turn=6 | ready for LLM generation
[SM_READY_FOR_LLM] turn=6 | directive injected | topic locked | ready to generate
[EVAL_PUSH] ✅ turn=6 queued for worker
```

## Performance Impact

- **Latency added:** 0-5s wait for eval result (with 5s timeout fallback)
- **Benefit:** Zero race conditions, deterministic behavior
- **Trade-off:** If eval worker is slow (>5s), agent waits. But then you have a bigger problem (slow eval = kill eval worker performance)

## Fallback Strategy

If eval result doesn't arrive in 5s:
```python
# In wait_for_eval_result():
try:
    result = await asyncio.wait_for(redis_client.getdel(...), timeout=5.0)
except asyncio.TimeoutError:
    logger.warning("[WAIT_EVAL] turn=%d Timeout — using current state (no topic change)", turn)
    return None  # Agent continues with current topic
```

This ensures agent never hangs waiting for eval.

## Migration Path

1. **Phase 1:** Create `InterviewState` + `AgentTurnStateMachine` (done ✅)
2. **Phase 2:** Integrate at session init, add `process_user_turn()` call
3. **Phase 3:** Consolidate `_read_and_apply_eval_result()` into state machine
4. **Phase 4:** Remove fire-and-forget injection, verify logs show [SM_*] checkpoints
5. **Phase 5:** Run test interview, verify turn transitions
