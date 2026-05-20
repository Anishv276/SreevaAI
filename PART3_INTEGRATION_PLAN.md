# PART 3: TopicState Integration — Dead Code Removal & Saturation Wiring

## Dead Fields to Remove (34 refs in eval_pipeline, 10 in turn_evaluator)

**From EvaluationPayload schema:**
- `follow_up_count: int` - replaced by TopicState.follow_up_turns
- `follow_up_depth: int` - replaced by saturation thresholds (CRITICAL=8.0, HIGH=6.5, etc)
- `depth_history: list[float]` - replaced by TopicState + ResponseScoreCalculator
- `collapse_stage: int` - no longer needed (signals handled directly)
- `last_action_was_move_on: bool` - not needed for saturation system
- `enforce_move_on_until_new: bool` - not needed
- `forced_next_topic_hint: Optional[str]` - not needed
- `expected_topic_kind: str` - not needed

**From turn_evaluator.py function signature:**
- `topic_follow_up_count: int` - becomes part of TopicState context
- `depth_history: list[float]` - becomes TopicState context
- `max_follow_ups: int` - becomes threshold lookup from TopicState importance
- `collapse_stage: int` - signals are now first-class (not staged)

---

## Implementation Strategy (3 phases)

### Phase 1: Clean eval_pipeline.py
1. Remove dead fields from EvaluationPayload
2. Remove CounterManager (no longer needed)
3. Update run_eval_and_build_directive to:
   - Deserialize TopicState from payload
   - Call evaluate_topic_saturation() after turn_evaluator
   - Implement probe rotation advance logic
   - Return updated TopicState in result dict
4. Remove all references to dead fields (34 → 0 occurrences)

### Phase 2: Clean turn_evaluator.py
1. Remove dead parameters from run_turn_evaluation signature (10 refs)
2. Remove dead signal_events handling related to old collapse_stage logic
3. Keep signal detection intact (that's still needed)
4. Remove route() call parameters related to max_follow_ups/topic_follow_up_count

### Phase 3: Wire agent_runtime.py
1. Add TopicState storage in session state dict: `_topic_states: dict[str, dict]`
2. Update _build_eval_payload to:
   - Serialize active TopicState and include as `active_topic_state`
   - Remove all dead field additions
3. Update _read_and_apply_eval_result to:
   - Deserialize TopicState from result
   - Update session state
4. Keep all trust/contradiction/risk logic unchanged (that's orthogonal)

### Phase 4: Update probe_strategy.py
1. New function: `select_probe_family(probe_rotation_index: int, signals_fired: list[str]) -> str`
   - Index 0 → "ownership"
   - Index 1 → "outcome"  (new family to add)
   - Index 2 → "tradeoff" (new family to add)
   - Index 3 → "failure"  (new family to add, CRITICAL topics only)
   - If signals fired → use signal family instead (override)
2. Update build_directive to use returned family

---

## Key Integration Points

**In eval_pipeline.py:**
```
run_eval_and_build_directive(payload, client):
  ✓ Deserialize TopicState from payload.active_topic_state
  ✓ Run turn_evaluator (simplified signature)
  ✓ Call evaluate_topic_saturation(topic_state, quality, signal_events)
  ✓ If saturated → action = "MOVE_ON"
  ✓ Else if not saturated → action = "PROBE"
  ✓ Advance probe_rotation_index (unless signal fired)
  ✓ Return updated TopicState in result dict
```

**In agent_runtime.py:**
```
Session state:
  _topic_states: dict[str, dict] = {}  # serialized TopicState per topic
  
When building eval payload:
  active_topic_state = _topic_states.get(active_topic, {})
  payload["active_topic_state"] = active_topic_state
  
When reading eval result:
  if result.get("new_active_topic_state"):
    _topic_states[active_topic] = result["new_active_topic_state"]
```

**In turn_evaluator.py:**
```
run_turn_evaluation(
  candidate_answer, last_question, transcript_lines,
  contradiction_detected, client, org_id, llm_model,
  score_answer_quality_fn, evaluate_answer_and_decide_fn,
  signal_toggles=None
)
  # Removed: topic_follow_up_count, depth_history, collapse_stage, max_follow_ups
  # These are now in TopicState context at call site
```

**In probe_strategy.py:**
```
New probe families to add:
  "outcome": {
    "goal": "What was the actual outcome/impact? Did it ship?",
    "style": "Move from claim to measurable result."
  }
  "tradeoff": {
    "goal": "What choices did you make? Why that approach?",
    "style": "Test decision-making, not just execution."
  }
  "failure": {
    "goal": "What went wrong? What would you do differently?",
    "style": "Test judgment and learning ability."
  }
```

---

## Saturation Decision Flow (PART 3)

```
1. TopicState loaded from payload
2. run_turn_evaluation() called (simplified)
3. evaluate_topic_saturation() called → (is_saturated, status_str)
4. If is_saturated:
     action = "MOVE_ON"
     next_topic = tracker.next_uncovered()
5. Else:
     action = "PROBE"
     probe_family = select_probe_family(probe_rotation_index, signals)
     directive = build_directive using probe_family
     advance probe_rotation_index (unless signal fired)
6. Serialize TopicState → return in result dict
7. agent_runtime reads result, updates session state
```

---

## Before/After Code Examples

### BEFORE (Old system):
```python
if topic_follow_up_count >= max_follow_ups:
    action = "MOVE_ON"
else:
    action = "PROBE"
```

### AFTER (New system):
```python
is_saturated, status = evaluate_topic_saturation(
    topic_state, 
    quality_scores, 
    signal_events
)
if is_saturated:
    action = "MOVE_ON"
else:
    action = "PROBE"
    # Probe type selected by probe_rotation_index
```

---

## Testing Points (Ready in PART 3)

1. **Strong candidate scenario**: Saturation reached in 1-2 answers, probe rotation skipped
2. **Weak candidate scenario**: Stuck at low saturation, cycles through all 4 probe types, eventually MOVE_ON with low confidence
3. **Signal override**: If ownership_ambiguity fires, probe_rotation_index stays same (doesn't advance)
4. **Time pressure**: MOVE_ON can happen mid-saturation if remaining_seconds < 45 (final window)
5. **Topic switching**: New topic opens with probe_rotation_index = 0 (starts with ownership probe)

---

## Files Modified in PART 3

1. **eval_pipeline.py** - 34 dead refs removed, saturation wiring added
2. **turn_evaluator.py** - 10 dead refs removed, simplified signature
3. **agent_runtime.py** - TopicState storage and serialization wiring
4. **probe_strategy.py** - Add outcome/tradeoff/failure families, implement rotation logic

---

## Success Criteria

- ✅ All 34 dead field refs in eval_pipeline removed
- ✅ All 10 dead field refs in turn_evaluator removed
- ✅ TopicState fully integrated into agent session state
- ✅ Saturation scoring drives MOVE_ON/PROBE decisions
- ✅ Probe rotation advances correctly (with signal override)
- ✅ No errors on fresh interview start (new TopicState initialization)
- ✅ Interview flow: more topics covered, better quality signals detected, time used adaptively