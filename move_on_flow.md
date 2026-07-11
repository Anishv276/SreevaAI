# MOVE_ON Flow - Complete Architecture

## Overview

When the eval system decides `action = "MOVE_ON"` (triggered by 4 cases: saturated, dry_topic, weak_exit, or forced_action), the interview transitions from the current topic to the next one. This is a **synchronous, pure-Python flow with zero LLM calls** for directive generation — Ishitha (the interview LLM) is the only call that fires.

---

## The 4 MOVE_ON Trigger Cases

### Case 1: SATURATED ✅
Topic has collected enough signal. Saturation threshold met based on band-aware scoring.

**Example:**
```
Turn 4, "React Optimization" topic
Candidate answers a deep question about optimization strategies
Score: clarity=8.0, depth=7.5, specificity=6.9, grounding=7.2
Saturation += 2.5 points
Total: 7.5 points >= 7.0 threshold (mid band)
→ MOVE_ON fires
```

### Case 2: DRY TOPIC 🏜️
Candidate can't/won't answer. Two mechanisms:
- **Consecutive streak**: 2+ bad answers in a row
- **Total burden**: 3+ weak answers regardless of order

**Example:**
```
Turn 2, "Backend Patterns" topic
Q: "What database patterns have you used?"
A: "Um, not much really"  (low_yield = 1)
→ consecutive_low_yield = 1

Turn 3
Q: "Which ones did you optimize?"
A: "I don't remember"  (low_yield = 2)
→ consecutive_low_yield = 2 >= cap(2)
→ DRY_TOPIC fires → MOVE_ON
```

### Case 3: WEAK EXIT 📉
Quality isn't good enough for time spent. Importance-based thresholds.

**Example:**
```
Topic: "Kubernetes" (JD_TOPIC = MEDIUM importance)
Saturation threshold: 5.0 points

Turn 1-3: collected 2.5 points (50%)
Turn 4: answer quality drops further
Saturation: 2.7 points (54%)

Band rule: MEDIUM needs >= 75% by turn 5
Current: 54% at turn 4, trending worse
→ WEAK_EXIT fires → MOVE_ON
```

### Case 4: FORCED ACTION 🚫
Explicit denial or warmup completion.

**Example:**
```
Turn 1: Warmup phase
Q: "How are you doing?"
A: "Good, ready to go"
→ forced_action = MOVE_ON (warmup always 1 turn)
→ MOVE_ON to anchor topic

---OR---

Turn 5, "Infrastructure" topic
Q: "Walk me through your DevOps setup"
A: "I don't want to talk about this"
→ forced_action = MOVE_ON (explicit denial)
→ MOVE_ON to next topic
```

---

## The Flow: Step-by-Step

### Step 1: Ban the Old Topic
```python
_old_topic = "React Optimization [React, Performance]"
_mark_topic_covered(_old_topic)
```

**Does:**
- Add normalized key `"react optimization"` to `_covered_topic_keys`
- Remove from `_topic_pool` permanently

**Result:** This topic can never be picked again — it's not in the pool to select from.

---

### Step 2: Record Scores (Bookkeeping Only)
```python
_topic_record = {
    "topic": "React Optimization [React, Performance]",
    "exit_reason": "saturated",
    "probe_count": 4,
    "scores": {
        "avg_overall": 6.8,
        "avg_depth": 7.1,
        "last_clarity": 8.0,
        "last_depth": 7.5,
        ...
    },
    "saturation_score": 7.5,
    "candidate_answers": [...last 6 answers...],
}
_topic_records.append(_topic_record)
```

**Purposes:**
- Debug report generation after interview ends
- Billing/usage tracking
- Zero impact on next topic selection

---

### Step 3: Pick the Next Topic
```python
_next_topic = _next_uncovered_topic()
```

**Logic (one-liner now):**
```python
return _topic_pool[0] if _topic_pool else None
```

Walks `_topic_pool` in order, returns first item. That's it.

**Pre-Conditions:**
- Brief has already ensured no overlapping/duplicate topics exist
- Topic pool is built from InterviewBrief and ordered by relevance

**Example Pool State:**
```
Before MOVE_ON:
[
  "React Optimization [React]"       ← just covered, already removed
  "API Design Patterns [REST, GQL]"   ← this will be picked
  "Kubernetes [K8s]"
  "System Design"
]

After _next_uncovered_topic():
_next_topic = "API Design Patterns [REST, GraphQL API design...]"
```

**If pool is empty:**
→ Jump to **WRAP_UP** (interview over, all topics covered)

---

### Step 4: Fetch Brief Item for New Topic
```python
_next_brief_item = next(
    t for t in _interview_brief.topic_pool 
    if t.title == "API Design Patterns"
)

TopicItem(
    title="API Design Patterns",
    tag="RESUME_TOPIC",
    topic_type="skill",
    full_description="Built REST and GraphQL APIs; probe design decisions and scalability tradeoffs",
    tech_stack=["REST", "GraphQL", "Node.js"],
    why_relevant="Core to backend role",
    probe_focus=["REST vs GraphQL tradeoffs", "API versioning", "Error handling"],
    probe_avoid=["implementation details", "framework specifics"],
    relevance_score=0.9,
)
```

---

### Step 5: Build Directive (Pure Python, No LLM)
```python
_directive = _build_move_on_directive(
    old_topic_title="React Optimization",
    new_topic_title="API Design Patterns",
    source="RESUME_TOPIC",
    band="mid",
    topic_item=_next_brief_item,
    prev_answer="We used React DevTools and memoization to optimize component renders.",
)
```

**Process:**
1. Look up `band="mid"` in `_band_depth` dict → "Push past team language..."
2. Look up `source="RESUME_TOPIC"` framing rules
3. Classify candidate's last answer intent (substantive → "Ah, makes sense" reaction)
4. Assemble string from brief fields + band rules + reaction hint

**Output (the directive):**
```
[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
DECISION: MOVE_ON
TOPIC YOU ARE LEAVING: React Optimization — CLOSED. Do not reference it again.
NEW ACTIVE TOPIC: API Design Patterns  [TAG: RESUME_TOPIC]

TOPIC: API Design Patterns
CONTEXT: Built REST and GraphQL APIs; probe design decisions and scalability tradeoffs
TECH STACK: REST, GraphQL, Node.js
WHY RELEVANT: Core to backend role
PROBE FOCUS: REST vs GraphQL tradeoffs, API versioning, Error handling
PROBE AVOID: implementation details, framework specifics

SOURCE: RESUME_TOPIC — a skill they listed on their resume. The candidate HAS done this; we know it from their resume. Ask about what they built, decided, or what broke -- do not ask IF they did it.
DEPTH TARGET (MID): Push past team language — ask what was specifically their own call or ownership.
FORBIDDEN: 'do you have experience', 'why did you work there', 'what drew you to X'.

OPENING REACTION: candidate's last answer was "We used React DevTools and memoization to optimize component renders."
ANSWER INTENT: Substantive answer → use 'Ah, makes sense.' or 'Right.' or 'Okay.'
Pick ONE micro-reaction (3-8 words) matching the intent, then ask ONE question that builds the new topic name naturally into it -- the candidate is on a voice call and needs context to know what you're asking about.
NEVER say 'Great!', 'Awesome!', 'Fantastic!', or any hollow praise. NEVER say 'Thanks for sharing'. NEVER reference the old topic 'React Optimization' — it is closed. ONE question only.
```

**Latency:** ~0ms (pure string assembly, no network)

---

### Step 6: Inject into Chat Context
```python
# Strip old messages
remove_system_messages_multi(chat_ctx, 
    ("[NEXT_TURN_DIRECTIVE", "[TOPIC_LOCK", "[RECENT_CONTEXT"))

# Add new directive (step 5 output)
chat_ctx.add_message(role="system", content=_directive)

# Add topic-lock frame (tells Ishitha what to do)
chat_ctx.add_message(role="system", content=(
    "[TOPIC_LOCK - CRITICAL INSTRUCTION]\n"
    "PREVIOUS TOPIC IS CLOSED. DO NOT REFERENCE IT.\n"
    "NEW ACTIVE TOPIC: API Design Patterns\n"
    "FULL CONTEXT: API Design Patterns - REST and GraphQL...\n"
    "SOURCE: RESUME. The candidate has direct experience here.\n"
    "Ask about what they built, decided, or what broke. "
    "NEVER ask 'do you have experience with X' or 'why did you work there' -- they did.\n"
    "Generate ONE fresh, specific question to open this topic..."
))

agent._move_on_opener_pending = True
```

---

### Step 7: Ishitha's LLM Call (The ONLY LLM Call)
`llm_node` wakes up:

1. **Detects MOVE_ON in context:** sees `DECISION: MOVE_ON` in system messages
2. **Strips old conversation:** removes all user/assistant messages so nothing anchors her back to React Optimization
3. **Reads the two system messages:** the directive + TOPIC_LOCK frame
4. **Generates a fresh question** on the new topic

**Ishitha speaks:**
```
"Ah, makes sense. So you've worked on API design — walk me through a time 
you chose between REST and GraphQL. What was driving that call?"
```

**Breakdown:**
- **"Ah, makes sense"** — micro-reaction matching the substantive answer intent (from Step 5)
- **"So you've worked on API design"** — acknowledges the new topic, no reference to React
- **"walk me through a time you chose between REST and GraphQL"** — ONE specific, grounded question
- **"What was driving that call?"** — probes the decision (mid-band ownership focus)

**Result:**
- Candidate hears this as natural flow, no jarring topic switch
- Candidate immediately knows what topic they're on (topic name in the question)
- Interview moves to the new topic cleanly

---

## Special Case: WRAP_UP (All Topics Covered)

If `_next_topic is None` at Step 3:

```python
_directive = (
    "[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]\n"
    "DECISION: WRAP_UP\n"
    "All planned interview topics have been covered. The interview is complete.\n"
    "[COVERED TOPICS -- DO NOT RE-OPEN ANY OF THESE]\n"
    "  - react optimization\n"
    "  - api design patterns\n"
    "  - kubernetes\n"
    "Wrap up the interview naturally and warmly.\n"
    "Say something like 'That covers everything I wanted to go through — "
    "it was great speaking with you!'\n"
    "Call end_call after your closing line."
)
```

Ishitha reads this and:
1. Says a warm closing
2. Calls `end_call` tool
3. Session ends

---

## Architecture Simplifications Made

### Removed Dead Weight
1. **Tech-bracket extraction** — `[React, Performance]` parsing → no auto-skill coverage
2. **Coverage memory block** — no forbidden-questions list in MOVE_ON directive
3. **Cross-reference rule** — `_build_cross_ref_rule()` function deleted
4. **Pre-fire LLM task** — no async `asyncio.ensure_future()` parallel directive gen
5. **Fallback directive template** — no "if LLM call fails" path (now it can't fail — pure Python)
6. **Semantic overlap dedup** — `_topics_overlap()` and `_topic_signature()` deleted
7. **Exclude param** — `_next_uncovered_topic(exclude=topic)` → `_next_uncovered_topic()`
8. **Covered-topic lookup in loop** — `k in _covered_topic_keys` check removed

### What Remains
- **`_mark_topic_covered(topic)`** — 2 operations: add to covered set, remove from pool
- **`_next_uncovered_topic()`** — returns `_topic_pool[0]` or None
- **`_build_move_on_directive()`** — pure string assembly from brief + band + reaction
- **Ishitha's LLM call** — only call that generates the spoken question
- **`_OVERLAP_STOPWORDS`** — still used by TOPIC_GUARD (separate mechanism)

---

## Latency Profile

| Step | Operation | Latency | Bottleneck |
|------|-----------|---------|------------|
| 1 | Ban old topic | ~0ms | None |
| 2 | Record scores | ~0ms | None |
| 3 | Pick next | ~0ms | None |
| 4 | Fetch brief item | ~0ms | Linear scan (small list) |
| 5 | Build directive | ~0ms | String ops |
| 6 | Inject into context | ~0ms | List ops |
| 7 | **Ishitha LLM call** | **~1-2s** | **OpenAI API** |

Total: **~1-2 seconds** per MOVE_ON, all in Ishitha's generation. No wasted LLM calls for directive prose.

---

## Data Flow Example (Complete Interview)

```
TURN 1 — Warmup
  Q: "How are you doing?"
  A: "Good, ready to go"
  → forced_action = MOVE_ON
  → _mark_topic_covered("warmup")
  → _next_topic = _next_uncovered_topic()  → "DataFlow Project"
  → _directive = "MOVE_ON to DataFlow Project"
  → Ishitha: "Alright, let's start with the DataFlow project you mentioned..."

TURNS 2-5 — DataFlow Project (RESUME_TOPIC)
  Q1: "Walk me through what you built"
  A1: [good answer, saturation += 1.5]
  Q2: "What decisions were yours?"
  A2: [deep answer, saturation += 2.0]
  Q3: "What broke and how'd you fix it?"
  A3: [detailed answer, saturation += 2.5]
  Total: 6.0 points >= 6.0 threshold (anchor, CRITICAL importance)
  → saturated = True
  → _mark_topic_covered("DataFlow Project")
  → _next_topic = _next_uncovered_topic()  → "API Design Patterns"
  → _directive = "MOVE_ON to API Design Patterns"
  → Ishitha: "Ah, makes sense. So you've worked on API design..."

TURNS 6-8 — API Design Patterns (RESUME_TOPIC)
  Q1: "Walk me through choosing REST vs GraphQL"
  A1: [good answer, saturation += 1.8]
  Q2: "Why that tradeoff?"
  A2: [solid answer, saturation += 1.9]
  Total: 3.7 points >= 3.5 threshold (mid)
  → saturated = True
  → _mark_topic_covered("API Design Patterns")
  → _next_topic = _next_uncovered_topic()  → "Kubernetes" (JD_TOPIC)
  → _directive = "MOVE_ON to Kubernetes"
  → Ishitha: "Got it. This role involves Kubernetes heavily. What's your experience there?"

TURNS 9-11 — Kubernetes (JD_TOPIC)
  Q1: "What's your exposure to Kubernetes?"
  A1: "Not much, mostly read about it"
  → saturation = 2.0, low quality
  Q2: "What clusters have you run?"
  A2: "I don't remember"
  → saturation = 2.5, consecutive_low_yield = 2 >= cap(2)
  → dry_topic = True
  → _mark_topic_covered("Kubernetes")
  → _next_topic = _next_uncovered_topic()  → None (pool empty)
  → _directive = "WRAP_UP"
  → Ishitha: "That covers everything I wanted to go through. Thanks for your time!"
  → Ishitha calls end_call

SESSION ENDS
Covered topics: warmup, DataFlow Project, API Design Patterns, Kubernetes
Report generated with scores, signals, coverage
```

---

## Key Principles

1. **Brief owns ordering** — topic pool sequence is sacred; brief must never emit duplicates
2. **No runtime dedup** — brief generation handles overlap prevention, not runtime loop
3. **One LLM call per turn** — Ishitha asks the question, no middleware LLM prose-ifying directives
4. **Pure Python directives** — band rules, brief fields, reaction hints are all lookup tables
5. **Topic is banned immediately** — remove from pool before picking next, so no race conditions
6. **Ishitha strips history** — old Q&A torn from context during MOVE_ON, fresh start
7. **No coverage memory** — no forbidden-questions list, Ishitha judges repetition from her own read of context

---

## Summary

MOVE_ON is a **7-step linear flow** that transitions the interview to a new topic cleanly:

1. Ban old topic (2 ops)
2. Record scores (bookkeeping)
3. Pick next topic (index [0])
4. Fetch brief item (linear search)
5. Build directive (Python string assembly, ~0ms)
6. Inject into context (2 messages)
7. Ishitha speaks (only LLM call, ~1-2s)

**No pre-fire tasks, no fallbacks, no overlap dedup, no forbidden-questions caching.** Brief generates a clean, non-overlapping topic list; runtime executes it in order; Ishitha generates natural transitions.
