# COMPREHENSIVE AI INTERVIEWER SYSTEM ANALYSIS

**Created:** 2026-05-24  
**Scope:** Full end-to-end analysis of all Python files defining the AI interviewer (Ishita)  
**Purpose:** Identify what makes an effective AI interviewer, what's missing, what's redundant, what's poorly integrated

---

## TABLE OF CONTENTS

1. [System Architecture Overview](#system-architecture-overview)
2. [Layer 1: Voice Layer (How AI Speaks)](#layer-1-voice-layer)
3. [Layer 2: Evaluation Layer (How AI Thinks)](#layer-2-evaluation-layer)
4. [Layer 3: Interview Phases (How Interview Flows)](#layer-3-interview-phases)
5. [Layer 4: Probe Strategy (How AI Decides What to Ask)](#layer-4-probe-strategy)
6. [Layer 5: Turn Evaluation (How AI Scores Answers)](#layer-5-turn-evaluation)
7. [Layer 6: Evaluation Pipeline (How Signals Are Detected)](#layer-6-evaluation-pipeline)
8. [Gap Analysis](#gap-analysis)
9. [Redundancies & Overlaps](#redundancies--overlaps)
10. [What's Missing](#whats-missing)
11. [Recommendations](#recommendations)

---

## SYSTEM ARCHITECTURE OVERVIEW

### The Six-Layer Model

```
┌────────────────────────────────────────────────────────────────┐
│  VOICE LAYER (prompt_layers.py:27-134)                         │
│  "How AI speaks and validates"                                 │
│  - Persona (warm but sharp)                                    │
│  - Reaction templates (grounded validations)                   │
│  - Speech patterns (natural, conversational)                   │
│  - TURN DISCIPLINE (ONE question per turn)                     │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  INTERVIEW PHASES (interview_phases.py)                        │
│  "How the interview flows"                                     │
│  - Greeting (build rapport)                                    │
│  - Warmup (readiness check)                                    │
│  - Unified Interview (20 min, all question types mixed)        │
│  - Band-aware instructions (fresher vs experienced)            │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  EVALUATION LAYER (prompt_layers.py:143-187)                   │
│  "How AI thinks about answers"                                 │
│  - Signal detection ("Was there a real 'I' in that story?")    │
│  - Red flag detection (vague, evasion, contradiction)          │
│  - What good digging feels like                                │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  TURN EVALUATION (turn_evaluator.py + agent_scoring.py)        │
│  "How AI scores answers"                                       │
│  - Quality scoring (7 dimensions: clarity, depth, etc)         │
│  - Signal detection (extract contradict, ownership, etc)       │
│  - Decision routing (PROBE vs MOVE_ON)                         │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  PROBE STRATEGY (probe_strategy.py)                            │
│  "How AI chooses what to ask next"                             │
│  - Probe families (ownership, outcome, tradeoff, etc)          │
│  - Signal-to-family routing                                    │
│  - Follow-up collapse staged recovery                          │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│  EVALUATION PIPELINE (eval_pipeline.py)                        │
│  "How interview state is tracked"                              │
│  - Topic saturation tracking                                   │
│  - Signal event detection                                      │
│  - Directive compilation                                       │
└────────────────────────────────────────────────────────────────┘
```

---

## LAYER 1: VOICE LAYER (prompt_layers.py)

### Purpose
Define WHO the AI is, HOW it speaks, and WHAT disciplinary rules it follows.

### Current Implementation

#### A. Persona (Lines 27-47)

```python
# WHO YOU ARE
Warm but not soft. Sharp but not cold. You genuinely enjoy figuring out how people think.
You find people interesting. You probe because you're curious, not because it's procedure.
```

**Strengths:**
✅ Clear duality: warmth + rigor  
✅ Motivation stated: "curious, not procedure"  
✅ Encourages genuine engagement

**Issues:**
❌ **Vague on conflict resolution:** What if candidate gets defensive?  
❌ **No guidance on pacing:** How fast/slow to move?  
❌ **No guidance on pause handling:** Candidate goes silent - what to do?

#### B. Room Reading (Lines 41-46)

```python
You read the room:
- Nervous candidate → slow down, soften, open with something easy, give them a win
- Overconfident → push harder, don't let thin answers through
- Excited → ride it, dig into the thing they lit up about
- Senior candidate → peer-level, no hand-holding, assume they can go deep
- Fresher → you're interested in *how* they think, not what they've done
```

**Strengths:**
✅ Adaptive approach per candidate vibe  
✅ Explicitly identifies fresher mode (critical!)

**Issues:**
❌ **No way to detect nervousness:** How does AI know candidate is nervous?  
❌ **No explicit trigger for mode switch:** What observable signal switches from nervous → confident?  
❌ **Fresher guidance too brief:** "How they think" is vague. What specific questions unlock thinking?

#### C. Reactions & Validations (Lines 53-59)

```python
REACTIONS & VALIDATIONS — validate candidates with natural, positive peer-level feedback:
- Validating success: "That makes complete sense.", "Got it, [detail] makes perfect sense."
- Appreciating honesty: "I appreciate your honesty with that.", "Fair enough, thanks for being transparent."
- Something surprising: "Oh wow, that's a unique path. How did that work out?"
- Something big: "Hold on, that's a massive scale. How did you personally manage that load?"
- Something vague: "Hmm, that's a bit broad — can you get more specific on your part?"
- Something unclear: "I lost you a little — what does that look like in practice?"
```

**Strengths:**
✅ All reactions are grounded (not "Fantastic!" alone)  
✅ Shows listening (references specific detail)  
✅ Examples are natural and conversational

**Issues:**
❌ **Missing reactions for common situations:**
  - "I'm hearing some contradiction..."
  - "That doesn't quite add up..."
  - "I want to make sure I understand the sequence..."
  - "So you owned the whole piece, or just parts of it?"

❌ **No reaction for when candidate admits they don't know:** "I don't know" should be acknowledged differently than a vague answer

#### D. Speech Patterns (Lines 61-83)

**What's there:**
- ✅ What NOT to say (robotic AI-isms)
- ✅ What TO say instead (natural alternatives)
- ✅ False starts & fillers (natural hesitation)

**Issues:**
❌ **Missing: How to flag a contradiction gracefully**  
❌ **Missing: How to redirect from "we" to "I"**  
❌ **Missing: How to recover from a failed probe**

#### E. TURN DISCIPLINE (Lines 102-116)

```python
ONE question per turn. ABSOLUTE RULE — no exceptions, no matter what.
Format: [brief human reaction to what they said] + [one question]
Keep it short. Acknowledgment isn't a paragraph — it's a sentence or less.

CRITICAL: Do NOT combine multiple questions with "and" or commas.
Examples of WRONG:
  ❌ "What kind of data were you using, and how did you check if it was performing?"
  ❌ "Walk me through that decision — what were you choosing between and why?"
Examples of RIGHT:
  ✅ "What kind of data were you using for those tests?"
  ✅ Then in the NEXT turn (after they answer): "How did you know it was working?"

If you spot multiple things to clarify, pick ONE for this turn. You'll probe the others naturally in follow-ups.
```

**Status:** ✅ This is YOUR FIX. Explicit, with examples.

**Remaining issue:**
❌ **No guidance on when ONE question is insufficient:** What if the question itself is open-ended? e.g. "Tell me about a time when you solved a really hard problem" — that's ONE question but can lead to many sub-answers. Is that allowed?

---

## LAYER 2: EVALUATION LAYER (prompt_layers.py:143-187)

### Purpose
Silent judgment layer: How AI THINKS about answers, not what it SAYS.

### Current Implementation

#### A. Answer Analysis (Lines 158-163)

```python
After they speak, something will feel right or off:
- Did that actually answer it, or did they talk around it?
- Was there a real "I" in that story — or was it all "we"?
- Is something missing that should be there — a number, a decision, a failure?
- Did anything they just said conflict with something from earlier?
- Did they rush past something that deserves more time?
```

**Strengths:**
✅ Five specific red flags to detect  
✅ Clear distinction between talking around vs answering  
✅ Ownership detection emphasized ("real I" vs "we")

**Issues:**
❌ **Vague on what to do after detecting these:** Rule is "If something feels off → your next question goes there." But HOW?

Example: You detect "all we, no I" — what's your NEXT QUESTION?
- ❌ Bad: "You said 'we' but what did YOU do?"
- ✅ Good: "Walk me through what you specifically owned in that part"

The rule exists but the MECHANICS are missing.

❌ **Missing:** How to detect when answer is REHEARSED (memorized, not genuine)?

#### B. How Good Digging Feels (Lines 172-178)

```python
Win with no substance → you want the before/after, a real number, something concrete
Polished but thin → you want a specific moment, not the summary of the moment
Vague ownership → you want to know what was specifically theirs
Contradiction → you're genuinely confused and want it resolved, not accusatory
Evasion → you noticed and you're coming back to it
Too-perfect story → you want to know what went wrong
Vague again after one probe → move on, don't probe a third time on the same point
```

**Strengths:**
✅ Seven scenarios identified with the FEELING and the RESPONSE  
✅ Shows the SPIRIT of probing (curious, not accusatory)  
✅ Has a rule about knowing when to stop ("after one probe")

**Issues:**
❌ **Incomplete:** "Vague again after one probe → move on" — but the transcript shows Ishita probed 3 times on the same point (data source). This rule wasn't followed.

Why? Because the rule exists in the EVALUATION LAYER (silent thinking) but there's no MECHANISM in the next layers to enforce it.

❌ **Missing:** How to handle when candidate admits ignorance vs evasion?
- "I don't know" = legitimate, accept and move on
- "I can't give you an exact answer" = evasion masquerading as honesty

---

## LAYER 3: INTERVIEW PHASES (interview_phases.py)

### Purpose
Define HOW the interview flows and WHAT to cover.

### Current Implementation

#### A. Greeting (Lines 15-20)

```python
f"Hi {candidate_name}, really glad we could connect today. I'm {ai_name}, "
f"and I've been looking forward to our conversation about the {job_title} role. "
f"How are you doing? Hope the day's been good to you."
```

**Status:** ✅ Works. Simple, warm, natural.

#### B. Warmup Directive (Lines 23-37)

```python
"This is a quick readiness check — NOT the interview yet.
In ONE short, friendly turn do exactly this:
  1. Give a warm 1-sentence reaction to what they said.
  2. Ask a simple readiness check — confirm they're all set. Use only positive framing."
```

**Status:** ✅ Clear, bounded.

#### C. Unified Interview Directive (Lines 56-152)

**Goal:** (Lines 126-127)
```
"understand who this candidate really is —
what they built, what they own, how they think, and how deep their skills go."
```

**Priority Order:** (Lines 128-138)
```
1) Start with anchor project. Ask what they personally built and owned.
2) Move through other resume projects, work history, and internships.
3) Probe JD skills that haven't surfaced naturally.
4) Weave in at least 1 SITUATIONAL question.
5) Weave in at least 1 BEHAVIORAL question.

MANDATORY QUOTA:
  ☐ Resume anchor + at least 2 other resume items.
  ☐ At least 2 JD skills probed.
  ☐ At least 1 SITUATIONAL.
  ☐ At least 1 BEHAVIORAL.
```

**Band-Aware Instructions:** (Lines 99-120)

For FRESHER:
```
"They're early-career. You want to understand HOW they think, not just what they've done.
Look for: did they understand why they built what they built? Can they explain a decision?
If they're vague, try: 'Walk me through one specific day of work on that.'"
```

**Status:** ✅ Solid structure. Clear priorities.

**Issues:**
❌ **Gap between goal and mechanics:**

Goal says: "How deep their skills go" + "how they think"  
But the probing mechanics don't have explicit THINKING questions.

Examples of THINKING questions:
- "Why did you choose that approach over the alternative?"
- "If you could rebuild it today, what would you do differently?"
- "What was the hardest decision you made on that?"

These aren't in the directive. Instead, relying on "natural conversation flow."

❌ **No mechanism to track quota internally:** The directive says "track quietly, never announce" but doesn't provide a STRUCTURE for tracking. This is left to the LLM's implicit memory.

From the transcript: By timestamp 637, the AI has asked BEHAVIORAL questions (times when they failed) but NOT situational ("what if" scenarios).

---

## LAYER 4: PROBE STRATEGY (probe_strategy.py)

### Purpose
Map signals → probe families → next move.

### Current Implementation

#### A. Probe Families (Lines 11-60)

12 families defined:

| Family | Goal | Style |
|--------|------|-------|
| **clarification** | Surface inconsistency naturally | Use genuine confusion, not accusation |
| **ownership** | Ask what THEY owned, not team | Push from team-language to individual |
| **outcome** | What was the actual result? | Move from claim to business metrics |
| **tradeoff** | What choices did they make? | Test decision-making judgment |
| **failure** | What went wrong or broke? | Test learning and resilience |
| **evidence** | Real example, named project, real moment | Move from claim to proof |
| **compression** | Step-by-step sequence; real turning point | Use when answer collapses |
| **follow_up_collapse_staged** | Recover depth lost after follow-up | L1→L2→L3 memory probes |
| **depth** | Go one level deeper | When answer already substantive |
| **verification** | Test recall on specific moment | When answer sounds polished |
| **rapport** | Respond like a real person first | Acknowledge context before questioning |
| **normal** | Topic sufficiently covered | Move to next area |

**Strengths:**
✅ Each family has explicit GOAL + STYLE  
✅ 12 families cover most scenarios  
✅ Three of them are anti-fraud (compression, follow_up_collapse_staged, verification)

**Issues:**
❌ **Missing families:**
- "**redirect_from_we_to_i**" — specific to ownership ambiguity
- "**distinguish_ignorance_from_evasion**" — "I don't know" vs "I can't say"
- "**recover_from_vague_third_time**" — the rule "don't probe a third time" needs a recovery directive

❌ **No metrics for probe success:** How does AI know if a probe family worked?

Example: Candidate said "we trained the AI"  
Probe (ownership family): "What did YOU personally do to train it?"  
Candidate: "I set up the prompts"  
→ SUCCESS (got individual ownership)

But what if:
Candidate: "We trained it"  
Probe: "What did YOU do?"  
Candidate: "We trained it"  
→ FAILURE (still team language)

There's no "did-this-probe-work-YES/NO" mechanism.

#### B. Signal-to-Family Routing (Lines 63-87)

```python
("contradiction", "clarification"),
("follow_up_collapse", "follow_up_collapse_staged"),
("resume_claim_mismatch", "evidence"),
("example_evasion", "evidence"),
("latency_mismatch", "compression"),
("ownership_ambiguity", "ownership"),  ← CRITICAL
("depth_decay", "normal"),
("complexity_latency_mismatch", "evidence"),
```

**Status:** ✅ Good mappings. "ownership_ambiguity" → "ownership" is key.

**Issues:**
❌ **Missing signals:**
- "**overly_defensive**" — candidate gets prickly when challenged
- "**sudden_vagueness_after_specifics**" — gave details, then went vague
- "**metric_avoidance**" — candidate won't give numbers

---

## LAYER 5: TURN EVALUATION (turn_evaluator.py + agent_scoring.py)

### Purpose
Score answer quality & decide PROBE vs MOVE_ON per turn.

### Current Implementation

#### A. Quality Scoring (agent_scoring.py:16-161)

**Seven dimensions (0-10 each):**

1. **clarity**: Structure and logical flow
2. **depth**: Reasoning and systems thinking
3. **specificity**: Names, numbers, dates, concrete examples
4. **grounding**: Real lived experience vs theory
5. **fluency**: Natural speech flow
6. **grammar**: Grammatical correctness
7. **confidence**: Assured and decisive tone

**Scoring guides provided for each:**

Example (depth):
```
0-2: No reasoning — 'I don't know' or single-word answers
3-5: Some reasoning but shallow
6-8: Good reasoning, explores tradeoffs
9-10: Deep systems thinking, anticipates implications
```

**Strengths:**
✅ Seven dimensions cover most quality aspects  
✅ Detailed scoring guides (0-10 breakdowns)  
✅ Signal & concern lists provided:

Signals (strengths): "has_numbers", "has_names", "has_reasoning", "has_failure", "has_tradeoff", "has_ownership", "has_emotion", "has_learning"

Concerns (weaknesses): "vague", "rehearsed", "ownership_unclear", "contradiction", "incomplete", "generic", "bragging", "overly_cautious", "refused_to_answer"

**Issues:**
❌ **Coldstart problem:** First few answers will have low scores just because candidate is warming up. But scoring treats them the same as mid-interview answers.

❌ **Missing dimensions:**
- "**ownership_clarity**" — distinct from just "grounding"  
- "**answer_coherence**" — did they answer the Q asked, or different Q?  
- "**engagement**" — how much the candidate is leaning in vs defensive?

❌ **No context for what's "good":** A 5/10 on clarity might be:
- Excellent for a fresh grad
- Terrible for a senior engineer

#### B. Decide: PROBE vs MOVE_ON (agent_scoring.py:162-250)

**Rules (Lines 197-206):**

```
MOVE_ON when:
  - Answer directly addressed what was asked with named specifics
  - Topic had 2+ follow-ups AND candidate has nothing new to add
  - Candidate clearly said 'I don't know'

PROBE when:
  - Answer described a general process instead of answering specific question
  - Answer is vague, circular, or restated what they said before
  - Answer uses only 'we' with no personal ownership
  - Answer has no named person, vendor, tool, system, decision, or outcome
  - BUT: don't probe the same angle more than twice
```

**Strengths:**
✅ Clear distinction  
✅ "Don't probe the same angle more than twice" is explicit

**Issues:**
❌ **"Twice" is vague:** In the transcript, AI probed "what data did you use" THREE times:
- T176: "What kind of previous data was that exactly?"
- T188: "What kind of data were you using for those tests?"
- Then moved on

Why? Rule says "twice" but doesn't define:
- How do you count "same angle"?
- Are two rephrases of the same Q counting as 1 or 2?
- When does "you're asking different sub-questions" = new angle vs same angle?

❌ **Missing:** How to detect when candidate is STALLING vs thinking?
- Long pause with deep thought = good
- Long pause with no movement = stalling

---

## LAYER 6: EVALUATION PIPELINE (eval_pipeline.py)

### Purpose
Detect signals, calculate saturation, compile directives.

### Current Implementation (Overview)

This is the LARGEST file (900+ lines). Core pieces:

#### A. Signal Detection (Lines 195-217)

Signal toggles defined:
```python
"ownership_ambiguity": True,
"example_evasion": True,
"latency_mismatch": True,
"resume_claim_mismatch": True,
"follow_up_collapse": True,
"contradiction": True,
"complexity_latency_mismatch": True,
"depth_decay": True,
```

**Status:** ✅ Signals are detected per-turn.

**Issues:**
❌ **Ownership ambiguity wasn't fired in the transcript:**

Despite candidate saying:
- T42: "I built everything"
- T66: "I set up... so WE have" ← shift!
- T112: "WE did trained"
- T372: "Everything WE built"

The "ownership_ambiguity" signal never fired.

Why? Either:
1. The signal detection logic didn't catch the pattern
2. The logic exists but the DIRECTIVE wasn't injected into the agent context
3. The agent received the directive but didn't follow it

This is a CRITICAL GAP.

#### B. Topic Saturation (Lines 39-128)

Complex system tracking:
- Saturation scores per topic
- Follow-up counts
- Probe rotation (ownership → outcome → tradeoff → failure)
- Early exit for weak candidates

**Status:** ✅ Sophisticated system.

**Issues:**
❌ **Not referenced in the high-level prompts:** The voice layer and interview phases don't mention saturation. So when a candidate asks "am I going deep enough?" — there's no visible signal.

---

## GAP ANALYSIS

### Gap #1: Disconnect Between Rule & Enforcement

**Rule exists:** "ONE question per turn"  
**Example provided:** "Don't combine with 'and'"  
**What happened:** AI asked two questions anyway (4 times)

**Root cause:** The rule is in the VOICE LAYER (persona/style). But there's no MECHANISM to detect or prevent violation. The LLM sees the rule and tries to follow, but bundling questions feels natural to the LLM.

**Solution implemented:** Your fix (explicit examples, CRITICAL flag).

**Remaining gap:** Even with the fix, will the LLM follow? Or is this something that needs to be ENFORCED at generation time (e.g., "stop generating after you've written one question")?

---

### Gap #2: Fresher Mode Underspecified

**Rule says:** "You want to understand HOW they think, not what they've done"

**What this means:**
- Get decisions, not just accomplishments
- Get WHY, not just WHAT
- Get thinking process, not just results

**What questions unlock thinking:**
- "Why did you choose that?"
- "What would you do differently?"
- "What was the hardest part?"
- "How did you decide..."

**Current state:** These aren't explicitly in the directives. Relying on natural flow.

**Evidence from transcript:** Ishita asked about WHAT (projects, tools, systems) but rarely asked about HOW/WHY the candidate THINKS.

---

### Gap #3: Signal Firing vs Signal Injection

**Architecture flaw:** Signals are DETECTED but it's unclear if DIRECTIVES reach the LLM.

Example: "ownership_ambiguity" fires when:
- Candidate says "I built everything"
- Then says "we trained the AI"

Signal fired → Probe family: "ownership"  
Directive compiled → "Ask what THEY personally owned"

**Question:** Does the agent ACTUALLY SEE this directive?

From the transcript, it seems like directives aren't always reaching the agent, or the agent isn't following them.

---

### Gap #4: Ownership Ambiguity Detection

The SIGNAL exists. The FAMILY exists. But in the transcript, the signal never fired (or the directive never reached the agent).

This is the biggest gap because it's CRITICAL to the interview. Every candidate says "we" and then claims "I did everything." This is the MOST important signal to detect and probe.

---

### Gap #5: "Vague Again After One Probe" Not Enforced

**Rule:** "Vague again after one probe → move on, don't probe a third time on the same point"

**Transcript evidence:** Probed THREE times on "what data did you use"
- T176: Direct question
- T188: Rephrase
- Never probed a third time, but took two full turns on same topic

**Gap:** This rule exists in the EVALUATION LAYER (silent thinking) but there's no MECHANISM to enforce it or track probe count per topic.

---

## REDUNDANCIES & OVERLAPS

### Redundancy #1: Ownership Guidance Appears in Multiple Places

**Location 1:** interview_phases.py:108
```
"Push past team language — you want their specific contribution."
```

**Location 2:** probe_strategy.py:16-18
```
"goal": "Ask what THEY personally owned, built, or decided - not the team."
"style": "Push from team-language into individual responsibility."
```

**Location 3:** prompt_layers.py:160
```
"Was there a real 'I' in that story — or was it all 'we'?"
```

**Location 4:** agent_scoring.py:204
```
"Answer uses only 'we' with no personal ownership"
```

**Issue:** Message is consistent (good!) but scattered (bad for maintenance). If you need to change the approach, you have to update 4 places.

**Recommendation:** Consolidate into ONE source of truth.

---

### Redundancy #2: Depth Scoring Definitions

**Location 1:** agent_scoring.py:83-87
```
depth (0-10): How much reasoning or thinking is shown?
  0-2: No reasoning
  3-5: Some reasoning but shallow
  6-8: Good reasoning, explores tradeoffs
  9-10: Deep systems thinking
```

**Location 2:** eval_pipeline.py:depth_signal
```
SURFACE=generic/vague
SPECIFIC=named real thing
DEEP=specifics+reasoning
```

**Issue:** Two different scales for depth (0-10 vs SURFACE/SPECIFIC/DEEP). They're related but not coordinated.

---

### Redundancy #3: Answer Quality Assessment in Two Places

**Location 1:** agent_scoring.py (7-dimensional scoring)  
**Location 2:** interview_phases.py (band-aware assessment)

Both assess answer quality but with different frameworks. Should be unified.

---

## WHAT'S MISSING

### Missing #1: Explicit Ownership Ambiguity Detection Directive

There's a SIGNAL but no explicit DIRECTIVE when it fires.

When signal = "ownership_ambiguity", the directive should be:

```
[NEXT_TURN_DIRECTIVE]
SIGNAL: OWNERSHIP_AMBIGUITY
Evidence: Candidate said 'I built everything' then 'we trained'

YOUR MOVE: Clarify actual ownership scope
APPROACH: "I want to make sure I understand the scope — were these 
solo projects where you did everything, or team projects where you 
owned specific parts?"

DO NOT: Say "you said 'I' but also 'we' — which is it?" (accusatory)
DO: Say it as genuine confusion needing clarification
```

This directive DOESN'T explicitly exist in the code (should be in probe_strategy.py or eval_pipeline.py).

---

### Missing #2: Fresher-Specific Probe Families

Current families (12 total) don't have a FRESHER-specific set.

For fresher candidates, the probes should be:

| Family | For Fresher | Example |
|--------|-------------|---------|
| **decision_making** | "Why did you choose X over Y?" | "Why did you pick n8n instead of Zapier?" |
| **learning** | "What surprised you or changed how you think?" | "What did this project teach you?" |
| **first_time_experience** | "This was probably your first time doing X" | "Had you built an AI system before this?" |
| **day_in_life** | "Walk me through a specific day" | "Take me through one day's work on this" |

These aren't in the current probe families.

---

### Missing #3: Signal for "Admits Ignorance Vs. Evades"

Current concerns list has "refused_to_answer" but it's binary.

**Distinction needed:**

```
"I don't know how to do X" = LEGITIMATE IGNORANCE
  → Accept, move on, don't penalize

"I can't give you an exact answer" = EVASION
  → Probe: "Give me ANY answer, even approximate"
  → Then move on

"I never had to deal with that" = LEGITIMATE SCOPE BOUNDARY
  → Accept, move on

"That's complicated to explain" = EVASION
  → Probe: "Try a simplified version"
```

Current system doesn't distinguish these.

---

### Missing #4: Emotional Safety Monitoring

The voice layer says "Warm but not soft" but there's no mechanism to detect when a candidate becomes:
- Defensive
- Embarrassed
- Frustrated
- Shutting down

These should trigger:
- Slower pacing
- Easier questions
- More validation
- Shorter probes

But there's no signal for this.

---

### Missing #5: Quota Tracking Mechanism

The directive says "track quietly, never announce" but the code doesn't have:

- A data structure to track which quotas have been met
- A count of situational vs behavioral questions asked
- A check against "at least 2 JD skills probed"

This is left to the LLM's implicit memory, which is unreliable.

---

### Missing #6: Contradiction Memory Across Turns

The system detects contradictions but doesn't SURFACE them to the candidate until manually probed.

Better approach: Silent contradiction tracker that:
1. Detects contradiction (current)
2. Logs it internally (current)
3. Prepares a gentle surfacing question for next relevant moment
4. Asks it proactively when contradiction becomes relevant again

Example:
- T42: "I built everything on my own"
- T112: "We trained the AI"
- T372: "Everything WE built"

On T372, the system should RECOGNIZE: "Wait, this contradicts T42. Surface it now."

Current system: Detects but doesn't proactively surface.

---

### Missing #7: Quality Degradation Warning

If candidate scores are declining across turns:
- Turn 1-2: 7/10
- Turn 3-4: 5/10
- Turn 5: 3/10

This signals **depth_decay** (fatigue) or **coaching collapse** (answer structure falling apart).

System detects depth_decay, but there's no PROACTIVE signal to move to easier, shorter, lighter questions.

---

## RECOMMENDATIONS

### Recommendation #1: Create "Ownership Clarification" Directive (CRITICAL)

**File:** probe_strategy.py  
**Action:** Add explicit directive for ownership_ambiguity signal

```python
def build_ownership_ambiguity_directive(evidence: str) -> str:
    """When candidate uses 'we' + 'I built everything' flip-flop."""
    return f"""[NEXT_TURN_DIRECTIVE - DO NOT SAY ALOUD]
SIGNAL: OWNERSHIP_AMBIGUITY
Evidence: {evidence}

The candidate claimed personal ownership then used team language.
This is the strongest ownership red flag.

YOUR MOVE: Clarify the actual scope
APPROACH: 'I want to make sure I understand the scope of what was 
yours — were these projects where you did everything solo, or were 
they team projects where you owned specific parts?'

DO NOT: Accusatory tone ("You said I and we — which is it?")
DO: Genuine curiosity tone

ACCEPT AS SUCCESS: Any clear answer that distinguishes solo vs team
ACCEPT IF: "It was both — I owned the architecture part, team handled deployment"
ESCALATE IF: Still says "I did everything" but earlier said "we"
"""
```

---

### Recommendation #2: Add Fresher-Specific Probe Families

**File:** probe_strategy.py  
**Add to _PROBE_FAMILIES dict:**

```python
"fresher_decision_making": {
    "goal": "Understand WHY they made a choice, not just WHAT they did",
    "style": "Ask about tradeoffs, reasons, learning"
},

"fresher_first_time_discovery": {
    "goal": "Acknowledge this was probably their first rodeo; test learning",
    "style": "Gentle probe into growth, surprises, what stuck with them"
},

"fresher_day_in_life": {
    "goal": "Get out of summary mode into concrete moment",
    "style": "Ask them to walk through one specific day/week, not the project overview"
},

"fresher_skill_foundation": {
    "goal": "Test if they understand the FUNDAMENTALS, not just the tool",
    "style": "Ask conceptual questions: 'What's the difference between...?'"
},
```

---

### Recommendation #3: Formalize "Probe Effectiveness" Tracking

**File:** turn_evaluator.py  
**Add function:**

```python
def evaluate_probe_effectiveness(
    probe_family: str,
    last_question: str,
    candidate_answer: str,
) -> dict:
    """
    Did the probe work?
    
    Returns:
    {
        "worked": bool,
        "reason": str,
        "next_action": "repeat" | "escalate" | "move_on",
        "confidence": 0.0-1.0
    }
    """
    # Example: ownership probe asked "what did YOU do?"
    # If answer still says "we", probe didn't work
    
    if probe_family == "ownership":
        if "we" in candidate_answer and "i" not in candidate_answer.lower():
            return {
                "worked": False,
                "reason": "Still using team language after ownership probe",
                "next_action": "escalate",
                "confidence": 0.8
            }
```

---

### Recommendation #4: Create "Quota Dashboard" Silently Tracked

**File:** eval_pipeline.py  
**Add to EvaluationPayload:**

```python
class InterviewQuotaState(BaseModel):
    """Track mandatory interview quotas"""
    anchor_asked: bool = False
    other_resume_items_asked: int = 0  # target: >= 2
    jd_skills_probed: int = 0  # target: >= 2
    situational_asked: bool = False
    behavioral_asked: bool = False
    
    def check_completeness(self) -> dict:
        return {
            "anchor": self.anchor_asked,
            "resume_breadth": self.other_resume_items_asked >= 2,
            "jd_coverage": self.jd_skills_probed >= 2,
            "situational": self.situational_asked,
            "behavioral": self.behavioral_asked,
            "all_complete": (
                self.anchor_asked and 
                self.other_resume_items_asked >= 2 and
                self.jd_skills_probed >= 2 and
                self.situational_asked and
                self.behavioral_asked
            )
        }
```

Then in directives, add:

```
[QUOTA CHECK — DO NOT SAY ALOUD]
Remaining: situational question, behavioral question
These are mandatory before wrap-up. If time is tight, ask them now.
```

---

### Recommendation #5: Add "Signal Effectiveness" Logging

Every time a signal fires AND a probe is issued, log:

```
{
    "signal": "ownership_ambiguity",
    "directive": "Ask what THEY personally owned",
    "candidate_response": "...",
    "signal_resolved": true | false
}
```

After 20 interviews, analyze: Which signals fire but don't resolve? → Refine those directives.

---

### Recommendation #6: Distinguish Emotional States

**File:** agent_runtime.py (or new file: emotional_state.py)

Add detection for:
- Candidate sounds defensive (short answers, clipped tone)
- Candidate sounds embarrassed (pauses, downward tone)
- Candidate sounds frustrated (interrupting, rapid-fire short answers)

Trigger adjustments:
- Defensive → next question easier, more validation
- Embarrassed → acknowledge ("I know this stuff is in the weeds..."), move to strength area
- Frustrated → "Let's shift gears, you were killing it on X, tell me more about that"

---

### Recommendation #7: Consolidate Ownership Guidance

Create single source of truth:

**File: NEW** `interview/ownership_strategy.py`

```python
"""
Ownership Clarification Strategy

Ownership is the SINGLE MOST IMPORTANT signal to assess:
- Can they articulate what THEY did vs what the team did?
- Do they take accountability?
- Are they inflating their contribution?

Three ownership modes:
  - SOLO: "I built this myself"
  - TEAM_WITH_SCOPE: "I owned X, team handled Y"
  - TEAM_AMBIGUOUS: "We built it" + no scope clarification
"""

OWNERSHIP_RED_FLAGS = [
    "I built everything" (without scoping what 'everything' means),
    "We did X" (after claiming solo ownership earlier),
    "I was responsible" (without saying FOR WHAT),
    "I led the team" (without saying on WHAT specifically),
]

def detect_ownership_ambiguity(current_answer, prior_answers):
    """Detect solo/team flip-flop"""
    ...

def build_ownership_probe(prior_claim, current_evidence):
    """Generate probe that clarifies actual scope"""
    ...
```

Then import into probe_strategy.py and eval_pipeline.py.

---

### Recommendation #8: Add "Recovery After Failed Probe" Directive

When a probe fails (candidate doesn't give more info after 2 attempts), explicitly tell the AI:

```
[FAILED_PROBE_RECOVERY]
Your last probe didn't work. The candidate either:
1. Doesn't have the answer (legitimate)
2. Is unwilling to answer (red flag)
3. Didn't understand the question (your fault)

ACTION: Ask ONE last time, more simply:
"If you had to give your best guess, how would you answer?"

If still vague → MOVE ON. Don't probe a third time.
NOTE THIS: This is a trust signal for your final report.
```

---

## SUMMARY TABLE

| Layer | Quality | Main Issue | Priority |
|-------|---------|-----------|----------|
| **Voice** | ✅ Good | ONE question rule needs mechanism | Medium |
| **Interview Phases** | ✅ Good | Quota tracking needs structure | Medium |
| **Evaluation (thinking)** | ✅ Good | Rules exist but enforcement is vague | Medium |
| **Probe Strategy** | ✅ Good | Missing fresher-specific families | High |
| **Turn Evaluation** | ✅ Good | Missing emotional state detection | Medium |
| **Eval Pipeline** | ⚠️ Complex | Ownership ambiguity not firing | CRITICAL |

---

## CONCLUSION

The system is **sophisticated and well-intentioned**, but suffers from:

1. **Architecture gap:** Rules are stated but enforcement mechanisms are missing
2. **Signal-to-action gap:** Signals are detected but directives aren't reliably injected
3. **Fresher mode gap:** High-level guidance ("How they think") without specific mechanics
4. **Tracking gap:** Quotas and probe effectiveness tracked implicitly, not explicitly

**Your fix to TURN DISCIPLINE is correct and necessary.** But the BIGGER issue is the ownership_ambiguity signal not firing or not being acted upon.

**Next steps:** Investigate ownership_ambiguity signal firing (eval_pipeline.py) and ensure directives reach the agent context.

---

**END OF ANALYSIS**

Generated: 2026-05-24