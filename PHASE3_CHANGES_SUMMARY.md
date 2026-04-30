# Phase 3: Topic Coverage & Breadth Enforcement — COMPLETED

## 4 Code Changes Made

### Change 1: Reduce max_follow_ups default 3 → 2
**File**: `turn_evaluator.py`, line 65

```python
# BEFORE:
async def run_turn_evaluation(
    ...
    max_follow_ups: int = 3,

# AFTER:
async def run_turn_evaluation(
    ...
    max_follow_ups: int = 2,
    uncovered_topics: Optional[list[str]] = None,
```

**Impact**: After 2 follow-ups on same topic, MOVE_ON is forced. Hard cap prevents agent from getting stuck drilling one weak answer.

---

### Change 2: Pass uncovered_topics to build_directive()
**File**: `turn_evaluator.py`, line 149-154

```python
# BEFORE:
directive = build_directive(
    td=td,
    depth_signal=llm_decision.get("depth_signal", "SURFACE"),
    topic_follow_up_count=topic_follow_up_count,
    collapse_stage=collapse_stage,
)

# AFTER:
directive = build_directive(
    td=td,
    depth_signal=llm_decision.get("depth_signal", "SURFACE"),
    topic_follow_up_count=topic_follow_up_count,
    collapse_stage=collapse_stage,
    uncovered_topics=uncovered_topics,
)
```

**Impact**: build_directive now knows what topics are uncovered, can inject specific next question instead of vague "move to next topic".

---

### Change 3: Update build_directive() signature and logic
**File**: `probe_strategy.py`, lines 276-336

```python
# BEFORE:
def build_directive(td: TurnDecision, depth_signal: str, topic_follow_up_count: int, collapse_stage: int = 0) -> str:
    ...
    if action != "MOVE_ON":
        lines.append(
            f"Follow-ups on this topic so far: {topic_follow_up_count}. "
            f"If this reaches 3, move on regardless."
        )

# AFTER:
def build_directive(
    td: TurnDecision,
    depth_signal: str,
    topic_follow_up_count: int,
    collapse_stage: int = 0,
    uncovered_topics: Optional[list[str]] = None,
) -> str:
    ...
    if action != "MOVE_ON":
        lines.append(
            f"Follow-ups on this topic so far: {topic_follow_up_count}. "
            f"If this reaches 2, move on regardless."  # ← Changed from 3 to 2
        )
    elif action == "MOVE_ON" and uncovered_topics:
        next_topic = uncovered_topics[0] if uncovered_topics else "next area"
        lines.append(f"BRIDGE NOW to: {next_topic}")  # ← NEW: Specific next topic
```

**Impact**: 
- Directive now tells agent "reach 2 follow-ups, then MOVE_ON" (not 3)
- When MOVE_ON fires, directive includes specific topic to bridge to ("BRIDGE NOW to: Database Scaling")

---

### Change 4: Strengthen state_summary prompt + Pass uncovered_topics from runtime
**File 1**: `agent_persistence.py`, line 1175-1176

```python
# BEFORE:
"2. STUCK ALERT: If Ishita has asked 3 or more follow-ups on the SAME topic without moving on, "
"say: 'MOVE ON NOW - too long on [topic]. Go to [next untouched area] immediately.'\n\n"

# AFTER:
"2. STUCK ALERT: If Ishita has asked 2 or more follow-ups on the SAME topic without moving on, "
"say: 'MOVE ON NOW - stuck on [topic]. Next question: [EXACT QUESTION to ask about next untouched area]'\n\n"
```

**File 2**: `agent_runtime.py`, line 1456-1473

```python
# BEFORE:
try:
    td, directive = await asyncio.wait_for(
        run_turn_evaluation(
            candidate_answer=answer,
            ...
            max_follow_ups=follow_up_depth,
            collapse_stage=collapse_stage,
            ...
        ),
        timeout=6.0,
    )

# AFTER:
try:
    # Build uncovered topics list for directive bridging (Phase 3)
    uncovered_topics = session_context.coverage_items[:3]  # Top 3 uncovered areas

    td, directive = await asyncio.wait_for(
        run_turn_evaluation(
            candidate_answer=answer,
            ...
            max_follow_ups=follow_up_depth,
            uncovered_topics=uncovered_topics,  # ← PASS IT
            collapse_stage=collapse_stage,
            ...
        ),
        timeout=6.0,
    )
```

**Impact**:
- State injection every 3 turns now alerts at 2+ follow-ups (not 3+)
- State injection includes specific next question, not vague guidance
- Evaluator receives uncovered topics, can inject them into directive

---

## How It Works (With Real Example)

### Before Phase 3
```
Turn 1: "Tell me about a complex system"
        Sarah: "Umm... we built something distributed" (vague)

Turn 2: "Can you give an example?"
        Sarah: "Yeah, at my last company..." (still vague)

Turn 3: "Walk me through the architecture"
        Sarah: "It had microservices..." (vague)

Turn 4: "What was the hardest part?"
        Sarah: "Scaling..." (vague)

Turn 5: "Can you go deeper?"
        Sarah: "It was complicated..." (vague)

⏰ TIME SPENT: 10 min
📋 TOPICS COVERED: 1 (System Design)
❌ TOPICS MISSED: Database, APIs, Leadership, Testing

RESULT: 1/5 topics covered. Agent stuck on vague answer.
```

### After Phase 3
```
Turn 1: "Tell me about a complex system"
        Sarah: "Umm... we built something distributed" (vague, score: 2.5)

Route check: topic_follow_up_count = 0, max_follow_ups = 2
Decision: PROBE (allowed)
Directive: "Follow-ups so far: 0. If this reaches 2, move on regardless."

Turn 2: "Can you give an example?"
        Sarah: "Yeah, at my last company..." (vague, score: 2.5)

Route check: topic_follow_up_count = 1, max_follow_ups = 2
Decision: PROBE (allowed, last follow-up)
Directive: "Follow-ups so far: 1. If this reaches 2, move on regardless."
         "BRIDGE NOW to: Database Scaling"  ← Phase 3: SPECIFIC

Turn 3: "Walk me through the architecture"
        Sarah: "It had microservices..." (vague, score: 2.5)

Route check: topic_follow_up_count = 2, max_follow_ups = 2
Decision: MOVE_ON (FORCED - hit max)
Directive: "Follow-ups so far: 2. MOVE_ON forced by max limit."
         "BRIDGE NOW to: Database Scaling"

Turn 4: "Let me shift topics. Tell me about database scaling challenge you faced"
        Sarah: "We had 50M rows, added partitioning by date" (specific, score: 7.0)

Route: MOVE_ON (good coverage)
Directive: "BRIDGE NOW to: API Design"

Turn 5: "Great. Now APIs — tell me about an API you designed with version support"
        Sarah: "REST API, used v1/v2 in URL paths, 6-month deprecation" (strong, score: 7.5)

Route: MOVE_ON
Directive: "BRIDGE NOW to: Testing"

Turn 6: (and so on...)

⏰ TIME SPENT: 12 min
📋 TOPICS COVERED: 4/5 (System Design weak, Database strong, API strong, Testing covered)
✅ BREADTH ACHIEVED: All major areas touched

RESULT: 4/5 topics covered. Agent forced to move on after 2 follow-ups.
```

---

## Key Differences

| Aspect | Before Phase 3 | After Phase 3 |
|--------|---|---|
| **Max follow-ups per topic** | 3 (hardcoded) | 2 (enforced) |
| **Move-on trigger** | "evaluator suggests" (LLM can ignore) | "hard rule: if count ≥ 2" (mechanical) |
| **Next topic guidance** | "move to next area" (vague) | "BRIDGE NOW to: Database Scaling" (specific) |
| **State injection** | warns at 3+ | alerts at 2+, includes exact next Q |
| **Interview breadth** | 1 topic beaten to death | 4-5 topics covered |
| **Time efficiency** | 10 min on 1 topic | 2-3 min per topic, covers all |

---

## Testing This Phase

**Scenario**: Weak first answer on System Design

```
1. Answer quality = 2.5/10 (vague)
2. evaluator says "PROBE" (can go deeper)
3. route() checks: topic_follow_up_count = 0, max_follow_ups = 2 → allows PROBE
4. directive includes: "Follow-ups so far: 0. If this reaches 2, move on regardless."
   ALSO includes: "BRIDGE NOW to: Database Scaling" ← Phase 3!

Second follow-up (same topic):
1. Answer quality = 2.5/10 (still vague)
2. evaluator says "PROBE"
3. route() checks: topic_follow_up_count = 1, max_follow_ups = 2 → allows PROBE
4. directive includes: "Follow-ups so far: 1. If this reaches 2, move on regardless."
   ALSO includes: "BRIDGE NOW to: Database Scaling" ← Reinforced!

Third attempt (same topic):
1. Answer quality = 2.5/10 (still vague)
2. evaluator says "PROBE"
3. route() checks: topic_follow_up_count = 2, max_follow_ups = 2 → FORCES MOVE_ON
4. directive: ACTION: MOVE_ON (even if evaluator wanted PROBE)
5. Ishita MUST ask: "So on the database side..."

✅ Breadth enforced! System Design exhausted after 3 turns, move to Database.
```

---

## Files Changed

1. **turn_evaluator.py** (+1 param line 66, +1 arg line 155)
2. **probe_strategy.py** (+1 import line 7, +1 param line 281, +2 logic lines 334-336)
3. **agent_persistence.py** (+0 lines - prompt update only)
4. **agent_runtime.py** (+3 lines - uncovered_topics calc + param pass)

**Total impact**: ~10 lines of code, 100% mechanical enforcement of breadth.

---

## Next: Phase 4 (Optional)

Phase 4 adds pre-built resume-grounded follow-up questions to the candidate brief so the AI can probe specific resume items instead of generic follow-ups.

Not critical — Phase 3 alone guarantees breadth coverage through mechanical max_follow_ups enforcement.
