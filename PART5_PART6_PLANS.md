# PART 5 & 6: Advanced Features

Based on your original comprehensive rebuild plan, PART 5 & 6 add refinement layers.

---

## PART 5: Exchange Log & Short-Term Memory

### Purpose
Add **4-turn memory buffer per topic** so the system remembers recent exchanges and can reference them in probes.

**Example:**
```
Turn 1 (Anchor):     "Tell me what you built on Project X"
        Answer:      "I architected the payment system..."

Turn 2 (Follow-up):  "What was the hardest part?"
        Answer:      "Handling idempotency..."

Turn 3 (Probe):      "You mentioned idempotency — walk me through how you solved it"
        (System reference: "The candidate just said X on turn 2, now asking them to expand")

Turn 4 (Probe):      "That's great. Earlier you said Y about... did that come up here?"
        (System reference: "Anchoring to prior context from turn 1")
```

### Implementation

#### 1. TopicState enhancement
Add to TopicState class:
```python
class TopicState:
    def __init__(self, topic_name, importance):
        # ... existing fields ...
        self.exchange_log: list[dict] = []  # [{"turn": 3, "question": "...", "answer": "..."}, ...]
    
    def add_exchange(self, turn: int, question: str, answer: str) -> None:
        """Add Q&A exchange to memory buffer (max 4 exchanges)."""
        self.exchange_log.append({
            "turn": turn,
            "question": question[:200],  # Trim for size
            "answer": answer[:400],      # Trim for size
        })
        # Keep only last 4 exchanges
        if len(self.exchange_log) > 4:
            self.exchange_log.pop(0)
    
    def recent_exchanges(self, n: int = 2) -> str:
        """Return recent exchanges formatted for injection into directive."""
        if not self.exchange_log:
            return ""
        
        recent = self.exchange_log[-n:] if len(self.exchange_log) >= n else self.exchange_log
        lines = ["[RECENT EXCHANGE MEMORY]"]
        for ex in recent:
            lines.append(f"Turn {ex['turn']}: Q: {ex['question'][:80]}")
            lines.append(f"        A: {ex['answer'][:100]}...")
        return "\n".join(lines)
```

#### 2. eval_pipeline.py changes
In `run_eval_and_build_directive()`:
```python
# After turn_evaluator returns, before saturation check:
if current_topic_state and p.question and p.answer:
    current_topic_state.add_exchange(
        turn=p.turn,
        question=p.question,
        answer=candidate_answer
    )

# In directive building, inject memory for next turn:
if action == "PROBE" and current_topic_state:
    memory_block = current_topic_state.recent_exchanges(n=2)
    if memory_block:
        directive += f"\n\n{memory_block}"
        directive += "\nUse this context to ground your next probe in specific things they said."
```

#### 3. agent_runtime.py
No changes needed — TopicState already serializes in `to_dict()` and deserializes on read.

### Benefits
- ✅ Probes can anchor to specific prior claims (increases grounding)
- ✅ System can test consistency without re-asking same thing
- ✅ Prevents duplicate questions
- ✅ Allows deeper follow-ups that reference earlier context
- ✅ Memory decays (max 4 exchanges) so interview feels natural

### Files to Modify
1. `eval_pipeline.py` — Add exchange to TopicState
2. `eval_pipeline.py` — Inject memory block into directive

---

## PART 6: Final Window Logic & Comprehensive Logging

### Purpose
Implement **45-second wrap-up window** and **saturation dashboard logging**.

#### 6.1: Final Window Logic

When `remaining_seconds < 45`:
- Force MOVE_ON even if not saturated
- Wrap up current topic gracefully
- Don't start new topics (wrap final one only)

**Implementation in eval_pipeline.py:**
```python
# In saturation decision logic (after evaluate_topic_saturation):
remaining_seconds = p.remaining_seconds
final_window_threshold = p.no_new_question_cutoff_seconds  # 45 sec from config

if remaining_seconds < final_window_threshold and action != "VERIFY":
    # Force wrap-up
    action = "MOVE_ON"
    td["decision"]["action"] = "MOVE_ON"
    td["decision"]["next_goal"] = (
        f"You have {int(remaining_seconds)} seconds left. "
        f"Wrap up this topic gracefully: briefly acknowledge their answer, "
        f"thank them for their time, and end the interview. "
        f"Keep wrap-up to < {int(remaining_seconds)} seconds."
    )
    directive = DirectiveCompiler.move_on(td["decision"]["next_goal"])
    logger.info(
        "[FINAL_WINDOW] Remaining=%.0fs → forcing MOVE_ON turn=%d",
        remaining_seconds, p.turn,
    )
```

#### 6.2: Comprehensive Saturation Logging

Add **detailed saturation dashboard** to final summary:

```python
# In eval_pipeline.py, build a saturation_log entry:
saturation_log_entry = {
    "turn": p.turn,
    "timestamp_sec": p.remaining_seconds,  # How much time left
    "topic": current_topic_state.topic_name if current_topic_state else "?",
    "importance": current_topic_state.importance if current_topic_state else "?",
    "saturation": {
        "score": round(current_topic_state.saturation_score, 2) if current_topic_state else 0,
        "threshold": current_topic_state.saturation_threshold if current_topic_state else 0,
        "percent": round(100 * min(1.0, current_topic_state.saturation_score / current_topic_state.saturation_threshold), 1) if current_topic_state else 0,
        "is_saturated": current_topic_state.is_saturated if current_topic_state else False,
    },
    "probe": {
        "rotation_index": current_topic_state.probe_rotation_index if current_topic_state else 0,
        "rotation_name": ["ownership", "outcome", "tradeoff", "failure"][min(3, current_topic_state.probe_rotation_index if current_topic_state else 0)],
        "signal_override": any_signal_fired,
    },
    "quality": {
        "clarity": round(td["quality"]["clarity"], 1),
        "depth": round(td["quality"]["depth"], 1),
        "specificity": round(td["quality"]["specificity"], 1),
        "grounding": round(td["quality"]["grounding"], 1),
        "overall": round(quality_avg, 2),
    },
    "signals": signal_names_final,
    "action": action,
    "contributions": {
        "response_score": round(response_score, 2),
        "contribution_band": contribution,
        "signal_penalty": round(signal_penalty, 2),
        "final_contribution": round(final_contribution, 2),
    },
}

# Log it
logger.info(
    "[SATURATION_TURN] %s",
    json.dumps(saturation_log_entry, indent=2)
)

# Return in result for agent_runtime to store
return {
    # ... existing fields ...
    "saturation_log_entry": saturation_log_entry,
}
```

#### 6.3: Interview Saturation Summary (Final Report)

Add to agent_runtime.py when interview ends:
```python
# In the exit/wrap-up handler:
async def build_saturation_summary():
    """Create saturation dashboard for final report."""
    summary = {
        "interview_duration_sec": int(time.time() - session_start_time),
        "total_turns": turn_count,
        "topics_covered": list(_covered_topic_keys),
        "topics_partial": [t for t in _topic_states if not _topic_states[t].get("is_saturated", False)],
        "saturation_by_topic": {
            topic: {
                "importance": state.get("importance", "?"),
                "score": state.get("saturation_score", 0),
                "threshold": state.get("saturation_threshold", 0),
                "percent": round(100 * min(1.0, state.get("saturation_score", 0) / max(1, state.get("saturation_threshold", 1))), 1),
                "probes_used": state.get("follow_up_turns", 0),
                "saturated": state.get("is_saturated", False),
            }
            for topic, state in _topic_states.items()
        },
        "interview_quality": {
            "avg_clarity": round(sum(s.get("clarity", 0) for s in answer_scores) / max(1, len(answer_scores)), 1),
            "avg_depth": round(sum(s.get("depth", 0) for s in answer_scores) / max(1, len(answer_scores)), 1),
            "avg_specificity": round(sum(s.get("specificity", 0) for s in answer_scores) / max(1, len(answer_scores)), 1),
            "avg_grounding": round(sum(s.get("grounding", 0) for s in answer_scores) / max(1, len(answer_scores)), 1),
        },
        "signal_summary": {
            signal: len([e for e in proctoring_events if e.get("signal_name") == signal])
            for signal in ["ownership_ambiguity", "example_evasion", "follow_up_collapse", "contradiction", "latency_mismatch"]
        },
    }
    
    logger.info(
        "[SATURATION_SUMMARY] Interview complete\n%s",
        json.dumps(summary, indent=2)
    )
    
    # Store for final report
    return summary
```

#### 6.4: Recruiter-Facing Saturation Report

Create summary for HTML report:
```python
saturation_report = f"""
ADAPTIVE SATURATION ANALYSIS
═══════════════════════════════════════

Interview Duration: {interview_duration}s
Total Questions: {len(answer_scores)}
Topics Covered: {len(_covered_topic_keys)} / {total_topics}

TOPIC SATURATION MATRIX
─────────────────────────────────────────
Topic                    Importance  Score/Thresh  Probes  Status
─────────────────────────────────────────
{topic_rows}
─────────────────────────────────────────

SIGNAL PATTERN ANALYSIS
─────────────────────────────────────────
Ownership Ambiguity:     {signal_counts["ownership_ambiguity"]} occurrences
Example Evasion:         {signal_counts["example_evasion"]} occurrences
Follow-up Collapse:      {signal_counts["follow_up_collapse"]} occurrences
Contradiction:           {signal_counts["contradiction"]} occurrences
Latency Mismatch:        {signal_counts["latency_mismatch"]} occurrences

INTERPRETATION
─────────────────────────────────────────
{interpretation_text}
"""
```

### Benefits
- ✅ Clean interview wrap-up (never cuts off mid-topic)
- ✅ Respects time boundaries (45-sec window)
- ✅ Detailed saturation metrics for recruiter review
- ✅ Dashboard shows coverage vs. depth trade-offs
- ✅ Signal pattern summary reveals candidate weak areas
- ✅ Historical data for improving interview design

### Files to Modify
1. `eval_pipeline.py` — Add final_window logic, saturation_log_entry
2. `agent_runtime.py` — Build saturation_summary on interview end
3. `recruiter_summary.py` — Add saturation report section (if exists)

---

## Implementation Effort

| Part | Files | Lines | Complexity | Time Est |
|------|-------|-------|-----------|----------|
| PART 5 | eval_pipeline.py | ~80 | Medium | 1-2 hours |
| PART 6 | eval_pipeline.py, agent_runtime.py | ~150 | High | 2-3 hours |
| **Total** | **2** | **~230** | **Medium-High** | **3-5 hours** |

---

## Ready to Implement?

Would you like me to implement PART 5 & 6 now? 

Options:
1. **PART 5 only** — Exchange log for memory within topics
2. **PART 6 only** — Final window + comprehensive logging  
3. **Both PART 5 & 6** — Complete refinement suite
4. **Skip for now** — System is production-ready without them

Your call! Let me know which direction you want to go.