# Phase 3: Topic Coverage & Breadth Enforcement

## Problem (Before Fix)

Candidate answers first question. It's vague. Evaluator picks PROBE (dig deeper). AI probes same topic. Candidate still vague. AI probes again. And again. Interview ends having covered only 1 topic instead of 5-7 required areas.

```
Turn 1: "Tell me about a complex system you built"
        Candidate: "Umm... we built something distributed" (vague)
Turn 2: "Can you give an example?"
        Candidate: "Yeah, at my last company..." (still vague)
Turn 3: "Walk me through the architecture"
        Candidate: "It had microservices..." (vague)
Turn 4: "What was the hardest part?"
        Candidate: "Scaling..." (vague)
        
⏰ TIME SPENT: 10 min on 1 topic
📋 TOPICS COVERED: 1 (System Design)
❌ TOPICS MISSED: Database, APIs, Leadership, Testing, Incidents

INTERVIEW ENDS
```

## Root Cause

1. **max_follow_ups hardcoded to 3** — Even if DB says 2, code uses 3
2. **State injection warns but doesn't force** — Every 3 turns, system says "Hey, you're stuck on System Design" but LLM can ignore it
3. **No explicit next question** — State injection says "move to next topic" but doesn't name which question to ask
4. **PROBE overrides MOVE_ON** — If evaluator says MOVE_ON but there's a signal, PROBE wins

---

## Solution (Phase 3 Changes)

### Change 1: Reduce max_follow_ups from 3 to 2

**File**: `turn_evaluator.py`, line 65

```python
# BEFORE:
async def run_turn_evaluation(
    ...
    max_follow_ups: int = 3,  # ← Default 3
    ...
):

# AFTER:
async def run_turn_evaluation(
    ...
    max_follow_ups: int = 2,  # ← Default 2
    ...
):
```

**What this does:**
- After 2 follow-ups on same topic, `route()` logic automatically says MOVE_ON
- Prevents drilling into vague answers forever
- Hard cap: can't exceed 2 follow-ups regardless of answer quality

---

### Change 2: Pass uncovered_topics to build_directive()

**File**: `turn_evaluator.py`

Add parameter to `run_turn_evaluation()`:

```python
async def run_turn_evaluation(
    *,
    ...
    max_follow_ups: int = 2,
    uncovered_topics: Optional[list[str]] = None,  # ← NEW
    ...
):
    # At the end, pass to build_directive:
    directive = build_directive(
        action=action,
        probe_mode=probe_mode,
        signal_events=signal_events,
        depth_signal=depth_signal,
        uncovered_topics=uncovered_topics,  # ← PASS IT
    )
```

**File**: `probe_strategy.py`, update `build_directive()` signature:

```python
def build_directive(
    *,
    action: str,
    probe_mode: Optional[str],
    signal_events: list[SignalEvent],
    depth_signal: str,
    uncovered_topics: Optional[list[str]] = None,  # ← NEW
) -> str:
```

**What this does:**
- When MOVE_ON fires, directive now says "BRIDGE TO: [next uncovered topic]"
- Names the actual next question, not just "move to something else"

---

### Change 3: Strengthen state_summary prompt

**File**: `agent_persistence.py`, in `generate_interview_state_summary()`

```python
# OLD stuck alert:
"⚠️ STUCK ALERT: Stuck on System Design for 5 turns. 
 Consider moving to Database topic."

# NEW stuck alert (SPECIFIC):
"⚠️ STUCK ALERT: Stuck on System Design for 5 turns.
 MOVE ON NOW to: 'Tell me about a database scaling challenge you faced.
 What was the biggest bottleneck?'"
```

**What this does:**
- Instead of "move to next topic", inject the exact question to ask next
- Makes it harder for LLM to ignore (specific instruction vs vague suggestion)

---

### Change 4: Pass uncovered_topics from agent_runtime to evaluator

**File**: `agent_runtime.py`, in the turn evaluation call (around line 1456):

```python
# Build list of uncovered topics from coverage checklist
uncovered_topics = [
    item for item in session_context.coverage_items
    if item not in covered_areas  # covered_areas tracks what we've asked about
]

td, directive = await asyncio.wait_for(
    run_turn_evaluation(
        ...
        max_follow_ups=follow_up_depth,
        uncovered_topics=uncovered_topics,  # ← NEW
        ...
    ),
    timeout=6.0,
)
```

---

## Real Example: Interview with Phase 3 Fixes

### Setup

**Candidate**: Sarah (mid-level engineer, 5 years)
**JD Requirements**: Database design, APIs, System design, Testing, Leadership
**Coverage Checklist** (5 items):
1. System Design
2. Database Scaling
3. API Design
4. Testing Strategy
5. Team Leadership

**max_follow_ups**: 2 (NEW: was 3)

---

## Turn 1-2: Warmup (skipping details)

```
Ishita: "Hey, how are you doing?"
Sarah: "Good, how are you?"
Ishita: "Doing well! So let me dig into your background..."
```

---

## Turn 3: FIRST REAL QUESTION (System Design)

### What Ishita Says

```
"Tell me about the most complex system you've designed and built.
What problem were you solving?"
```

### What Sarah Says

```
"Um, we built a payment processing system. 
It handled transactions. 
We used AWS and databases."
```

**Quality Score**: 
- Clarity: 4/10 (vague, "it handled transactions")
- Depth: 2/10 (no reasoning shown)
- Specificity: 2/10 (no names, "AWS and databases")
- Grounding: 3/10 (sounds generic)
- **Overall**: 2.75 (WEAK)

### Signal Detection

```
No collapse (first answer, no prior scores)
No depth decay (only 1 answer so far)
```

### Route Decision

```
LLM evaluator: "Answer is vague and generic. 
                topic_follow_up_count = 0, max_follow_ups = 2
                DECISION: PROBE (mode: evidence)
                REASON: Missing concrete example"
```

### Build Directive

```python
# uncovered_topics = ["Database Scaling", "API Design", "Testing Strategy", "Team Leadership"]

build_directive(
    action="PROBE",
    probe_mode="evidence",
    uncovered_topics=uncovered_topics,
):
    # Returns:
    "[NEXT_TURN_DIRECTIVE]
    PROBE MODE: evidence
    Goal: Ask for a concrete example or named project
    
    Ask: 'That's helpful. Give me a specific example — 
         what was a concrete transaction or feature you built? 
         Name the system or the actual use case.'
    
    Status: 1/5 topics partially covered (System Design weak, 4 to go)
    Topics ready to cover next: Database Scaling, API Design, Testing, Leadership"
```

### State Injection (Every 3 turns)

Not yet (only turn 3, need turn 6 for first injection).

---

## Turn 4: FOLLOW-UP #1 on System Design

### What Ishita Says

```
"That's helpful. Give me a specific example — 
what was a concrete transaction or feature you built? 
Name the system or the actual use case."
```

### What Sarah Says

```
"Uh, like we had this payment feature. 
We stored the transactions in a database. 
It was pretty complex."
```

**Quality Score**: 
- Clarity: 3/10 (still vague)
- Depth: 2/10 (no real explanation)
- Specificity: 2/10 (just "database")
- Grounding: 2/10 (no specific example)
- **Overall**: 2.25 (WEAK AGAIN)

### Signal Detection

```
prior_depth_scores = [2.75]
current_depth = 2.25
topic_follow_up_count = 1 (this is first follow-up)
drop = 2.75 - 2.25 = 0.5 (small drop, but already low)

follow_up_collapse? No (current > 3.0, not a collapse)
depth_decay? No (only 2 answers so far)
```

### Route Decision

```
LLM evaluator: "Still vague. topic_follow_up_count = 1, max_follow_ups = 2
                One more follow-up allowed, then must MOVE_ON.
                DECISION: PROBE (mode: evidence)
                But note: this is FINAL probe on this topic"
```

### Build Directive

```python
build_directive(
    action="PROBE",
    probe_mode="evidence",
    uncovered_topics=["Database Scaling", "API Design", "Testing", "Leadership"],
):
    "[NEXT_TURN_DIRECTIVE]
    PROBE MODE: evidence (FINAL PROBE on System Design)
    
    Ask: 'Walk me through a specific transaction end-to-end. 
         For example, when someone clicks "Pay", what happens?
         What does the code do?'
    
    ⚠️ If this answer is still vague/generic, 
       MOVE_ON to Database Scaling immediately. 
       You've given this topic 3 turns already."
```

---

## Turn 5: FOLLOW-UP #2 on System Design (MAX REACHED)

### What Ishita Says

```
"Walk me through a specific transaction end-to-end. 
For example, when someone clicks "Pay", what happens?
What does the code do?"
```

### What Sarah Says

```
"So they click pay, and like, we validate the amount, 
then we charge the card, 
and then we store it in the database."
```

**Quality Score**: 2.5 (STILL VAGUE)

### Signal Detection

```
topic_follow_up_count = 2 (now at MAX of 2)
Still no collapse signal
```

### Route Decision

```python
# CRITICAL: topic_follow_up_count = 2, max_follow_ups = 2
# This check (in route() function):

if topic_follow_up_count >= max_follow_ups:
    # Force MOVE_ON regardless of evaluator recommendation
    action = "MOVE_ON"  # ← HARD RULE
    reason = "Maximum follow-ups reached on this topic"
```

**LLM evaluator might say**: "Could probe deeper"
**But route() overrides**: "No, max follow-ups hit. Move on."

### Build Directive (WITH PHASE 3 FIXES)

```python
uncovered_topics = ["Database Scaling", "API Design", "Testing", "Leadership"]

build_directive(
    action="MOVE_ON",  # ← FORCED by max_follow_ups check
    uncovered_topics=uncovered_topics,  # ← PHASE 3: SPECIFIC next question
):
    "[NEXT_TURN_DIRECTIVE]
    ACTION: MOVE_ON (topic exhausted after 3 turns)
    
    BRIDGE NOW to next uncovered area:
    'Alright, I've got a sense of the architecture. 
     Let me shift to something different.
     
     I see you used databases in that system — 
     tell me about a time you had to scale a database.
     What was the challenge you ran into?'
    
    Reset topic tracking.
    Next topic: Database Scaling
    Topics covered: 1/5 (weak)
    Topics remaining: 4/5"
```

**Difference from Phase 2:**
- **Before Phase 3**: "Move on to next topic" (vague, LLM often ignores)
- **After Phase 3**: "Ask about database scaling challenge" (specific, hard to ignore)

### Coverage Tracking Updated

```
Covered: ["System Design (weak - 2.5 avg)"]
Remaining: ["Database Scaling", "API Design", "Testing", "Leadership"]
```

---

## Turn 6: MOVE TO DATABASE SCALING

### What Ishita Says (PHASE 3: SPECIFIC NEXT QUESTION)

```
"Alright, I've got a sense of the architecture. 
Let me shift to something different.

I see you used databases in that system — 
tell me about a time you had to scale a database.
What was the challenge you ran into?"
```

### What Sarah Says

```
"Yeah, so our transactions table grew really large, 
to like 50 million rows. 
Queries were getting slow. 
We added partitioning by date, which helped a lot."
```

**Quality Score**:
- Clarity: 7/10 (clear explanation)
- Depth: 6/10 (mentions solution, some reasoning)
- Specificity: 8/10 ("50 million rows", "date partitioning")
- Grounding: 7/10 (real experience)
- **Overall**: 7.0 (STRONG)

### Signal Detection

```
prior_depth_scores = []  # Fresh topic!
topic_follow_up_count = 0  # First answer on Database Scaling
No signals fired
```

### Route Decision

```
Evaluator: "Strong answer, specific, good depth
            topic_follow_up_count = 0, max_follow_ups = 2
            DECISION: MOVE_ON
            REASON: Topic sufficiently covered on first answer"
```

### Build Directive

```python
build_directive(
    action="MOVE_ON",
    uncovered_topics=["API Design", "Testing", "Leadership"],
):
    "[NEXT_TURN_DIRECTIVE]
    ACTION: MOVE_ON (good coverage on this topic)
    
    BRIDGE to next area:
    'That's a great example of scaling thinking.
     So you've clearly handled database challenges.
     
     Now let me ask about APIs — 
     tell me about an API you designed that had to support different clients.
     How did you think about versioning or backwards compatibility?'
    
    Topics covered: 2/5
    Topics remaining: 3/5"
```

### Coverage Tracking Updated

```
Covered: [
  "System Design (weak - 2.5 avg, 3 turns)",
  "Database Scaling (strong - 7.0 avg, 1 turn)"
]
Remaining: ["API Design", "Testing", "Leadership"]
```

---

## Turn 7: STATE INJECTION (Every 3 Turns)

**Turn count = 6** (6 % 3 = 0, so inject now)

```python
generate_interview_state_summary(
    transcript_lines=[...],
    questions_list=coverage_checklist,
    turn_count=6,
    total_turns_expected=10,
    seconds_remaining=600,
):
```

### State Summary Output (PHASE 3: SPECIFIC)

```
[INTERVIEW STATE SUMMARY — Turn 6 of 10]

Progress: 2/5 topics covered (System Design weak, Database strong)

WEAK AREAS (need focus):
  ⚠️ System Design: Answer quality 2.5 avg — weak reasoning, no specifics
  ⏳ API Design: NOT YET ADDRESSED (skip if time < 4 min)
  ⏳ Testing: NOT YET ADDRESSED (skip if time < 3 min)
  ❓ Leadership: NOT YET ADDRESSED (skip if time < 3 min)

ON PACE: ✅ Covering ~1 topic per turn. If pace holds, 
         can cover 3-4 more topics in remaining 4 turns.

CRITICAL NEXT MOVE (PHASE 3 — SPECIFIC):
"Next question: Ask about API design experience.
  
  'So you've handled database scaling well.
   Now tell me about an API you designed — 
   did you have to worry about different versions or backward compatibility?
   Walk me through a specific decision you made there.'"

BREADTH REMINDER: You have 4 turns left. 
                   Prioritize coverage: APIs > Testing > Leadership
                   Don't get stuck on any one area.
```

**Injected into chat** as system message. LLM now has explicit next question.

---

## Turn 8: API DESIGN QUESTION

### What Ishita Says

```
"So you've handled database scaling well.
Now tell me about an API you designed — 
did you have to worry about different versions or backward compatibility?
Walk me through a specific decision you made there."
```

### What Sarah Says

```
"Yeah, our REST API had multiple clients — 
web, mobile, third-party integrations.
We couldn't break them, so we added versioning through URL paths: v1/, v2/.
When we needed to change something, we deprecated the old version 
but kept it running for 6 months.
We also added deprecation headers in responses."
```

**Quality Score**: 7.5/10 (STRONG)

### Route Decision

```
Evaluator: "Good specific example, clear reasoning
            DECISION: MOVE_ON"
```

### Coverage Tracking

```
Covered: [
  "System Design (weak)",
  "Database Scaling (strong)",
  "API Design (strong)"  ← NEW
]
Remaining: ["Testing", "Leadership"]
```

---

## Turn 9: TESTING STRATEGY QUESTION

```
Ishita: "Great approach to versioning. 
         Let me ask about testing — 
         how do you think about testing a system like that?
         What's your testing strategy?"

Sarah: "We had unit tests for the core logic, 
        integration tests for the API endpoints, 
        and some end-to-end tests for the critical user flows.
        We aimed for 80% code coverage."

Quality: 7.0/10
Route: MOVE_ON
```

---

## Turn 10: LEADERSHIP QUESTION

```
Ishita: "That's solid testing practice. 
         One last thing — 
         I see you mentioned working with teams.
         Tell me about a time you had to influence a technical decision 
         or lead a junior engineer through a complex problem."

Sarah: "Yeah, we had a junior engineer who wanted to use NoSQL 
        for everything. I walked them through the tradeoffs — 
        consistency guarantees, query flexibility, operational burden.
        We ended up using PostgreSQL for core data and Redis for caching.
        They learned a lot from the analysis."

Quality: 7.5/10
Route: MOVE_ON
```

---

## FINAL COVERAGE REPORT (PHASE 3 IMPACT)

**With Phase 3 Fixes:**
```
✅ System Design: 3 turns, avg 2.5 (weak but covered)
✅ Database Scaling: 1 turn, avg 7.0 (strong)
✅ API Design: 1 turn, avg 7.5 (strong)
✅ Testing: 1 turn, avg 7.0 (strong)
✅ Leadership: 1 turn, avg 7.5 (strong)

Total: 7 turns, 5/5 topics covered
Time: 20 minutes
Coverage: EXCELLENT (all major areas)
```

**Without Phase 3 Fixes (original problem):**
```
❌ System Design: 5+ turns, avg 2.5 (weak, beaten to death)
❌ Database Scaling: NOT COVERED
❌ API Design: NOT COVERED
❌ Testing: NOT COVERED
❌ Leadership: NOT COVERED

Total: 5+ turns, 1/5 topics covered
Time: 20 minutes
Coverage: POOR (missing 80% of required areas)
```

---

## Code Changes Summary

### File: turn_evaluator.py

```python
# CHANGE 1: Line 65
async def run_turn_evaluation(
    ...
-   max_follow_ups: int = 3,
+   max_follow_ups: int = 2,  # ← Reduce default
+   uncovered_topics: Optional[list[str]] = None,  # ← NEW param
    ...
):
    ...
    # At the end, pass to build_directive:
-   directive = build_directive(action, probe_mode, signal_events, depth_signal)
+   directive = build_directive(
+       action, probe_mode, signal_events, depth_signal,
+       uncovered_topics=uncovered_topics
+   )
```

### File: probe_strategy.py

```python
# CHANGE 2: build_directive signature
def build_directive(
    *,
    action: str,
    probe_mode: Optional[str],
    signal_events: list[SignalEvent],
    depth_signal: str,
+   uncovered_topics: Optional[list[str]] = None,
) -> str:
    ...
    # When action is MOVE_ON:
    if action == "MOVE_ON" and uncovered_topics:
        next_topic = uncovered_topics[0] if uncovered_topics else "next area"
        directive += f"\nBRIDGE NOW to: {next_topic}"
```

### File: agent_persistence.py

```python
# CHANGE 3: Strengthen state summary prompt
# In generate_interview_state_summary():

# OLD:
prompt = f"...Coverage so far: {covered}. 
           Consider moving to {next_area}..."

# NEW (SPECIFIC):
if stuck_on_topic:
    next_question = extract_next_question_from_list(questions_list)
    prompt = f"...Coverage so far: {covered}.
              MOVE ON NOW to: '{next_question}'..."
```

### File: agent_runtime.py

```python
# CHANGE 4: Pass uncovered_topics to evaluator
# Around line 1456:

uncovered_topics = [
    item for item in session_context.coverage_items
    if item not in covered_areas
]

td, directive = await asyncio.wait_for(
    run_turn_evaluation(
        ...
        max_follow_ups=follow_up_depth,
+       uncovered_topics=uncovered_topics,  # ← NEW
        ...
    ),
    timeout=6.0,
)
```

---

## Why Phase 3 Works

| Mechanism | Before | After |
|-----------|--------|-------|
| **Max follow-ups** | 3 (hardcoded) | 2 (configurable, can be DB setting) |
| **MOVE_ON trigger** | Evaluator suggests but LLM ignores | Hard rule: if topic_follow_up >= 2, force MOVE_ON |
| **Next question** | "Move to next topic" (vague) | Specific: "Ask about database scaling..." (explicit) |
| **State injection** | Every 3 turns, warns about stuck topic | Every 3 turns, injects exact next question |
| **Coverage enforcement** | Depends on LLM compliance | Mechanical: hard-capped at 2 follow-ups per topic |

**Result**: Interview breadth **guaranteed**. Instead of 1 topic drilled to death, all 5-7 required areas covered.
