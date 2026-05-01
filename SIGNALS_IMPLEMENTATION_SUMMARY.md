# Interview Agent Signals: End-to-End Implementation Summary

## Overview

Fixed 4 critical signals in the interview agent to work end-to-end from detection → directive injection → LLM interpretation → database storage → frontend display.

All signals now:
- ✅ Fire with correct confidence scores
- ✅ Inject mandatory directives into interview behavior
- ✅ Use GPT-4o-mini to generate dynamic one-liner interpretations
- ✅ Store in database as signal objects with full evidence
- ✅ Display in frontend as single-line summaries in Behavioral Signals tab
- ✅ Update trust engine with appropriate score deltas

---

## Signal 1: OWNERSHIP_AMBIGUITY ✅

### What It Detects
Candidate uses team language ("we", "our", "team") without personal ownership language ("I", "my", "I owned").

### Detection
**File:** `turn_decision.py:182-208`
```
Firing Rules:
- we_count >= 2 AND i_count <= 1
- Confidence: min(1.0, 0.45 + 0.15 * max(0, we_count - 1))
- Trust bucket: behavioral_confidence
- Score delta: -0.15
- Recruiter visible: TRUE
```

### Example
```
Q: "Tell me about your biggest achievement"
A: "We built a microservices system. We migrated from monolith. 
   Our team designed it. We deployed it."

Analysis:
- we_count = 5, i_count = 0
- FIRES: confidence 1.0

Result:
- Signal fires with evidence: "team-language count=5, first-person count=0"
- Directive: "Ask what THEY personally owned, built, or decided"
- Ishita probes: "What specifically did YOU do versus the team?"
```

### Interview Routing
- Routes to: **PROBE → ownership probe family**
- Directive: Mandatory instruction to ask personal contribution
- Starters:
  - "What specifically did YOU do versus the rest of the team?"
  - "If I called your manager, what would they say YOUR contribution was?"
  - "Walk me through what YOU personally built or decided"

### LLM Interpretation
**File:** `behavioral_analysis.py:259-310`
```python
if signal_name == "ownership_ambiguity":
    signal_desc = "Candidate used 'we/our/team' without personal ownership claims"
    
# GPT-4o-mini generates:
# "Candidate relies on 'we' language without demonstrating personal 
#  technical ownership or decision-making."
```

### Database Storage
```json
{
  "signal": "ownership_ambiguity",
  "turns": [3],
  "confidence": 1.0,
  "evidence": "team-language count=5, first-person count=0",
  "interpretation": "[LLM OUTPUT]",
  "visible": true,
  "count": 1
}
```

### Frontend Display
```
PROCTORING SIGNALS DETECTED
● Candidate relies on 'we' language without demonstrating personal 
  technical ownership or decision-making.
```

### Trust Impact
- **Bucket:** behavioral_confidence
- **Delta:** -0.15
- **Recoverable:** YES (ownership_clarified recovery signal +0.05)

---

## Signal 2: EXAMPLE_EVASION ✅

### What It Detects
Question asks for example ("tell me about a time", "walk me through") but answer stays theoretical or lacks specifics.

### Detection
**File:** `turn_decision.py:211-241`
```
Firing Rules:
- Question matches example request phrases AND
- Answer is theoretical (e.g., "typically", "you should", "generally") OR
- Answer lacks specifics (no dates/numbers/names)
- Confidence: 0.78 (theoretical) or 0.68 (no specifics)
- Trust bucket: behavioral_confidence
- Score delta: -0.15
- Recruiter visible: FALSE (hidden, visible if count >= 2)
```

### Example
```
Q: "Tell me about a time you debugged a performance issue"
A: "Generally, the approach is to identify the bottleneck. 
   You should profile the code. Usually you check database queries. 
   Then you optimize the indexes."

Analysis:
- Question matches: "tell me about a time" ✓
- Theory phrases: "Generally", "You should", "Usually" ✓
- Specifics: NO ✓
- FIRES: confidence 0.78

Result:
- Directive: "Ask for concrete example, named project, real moment"
- Ishita probes: "Tell me about a specific time this happened. What was the project?"
```

### Interview Routing
- Routes to: **PROBE → evidence probe family**
- Directive: Ask for concrete examples
- Starters:
  - "Give me a specific example of when that actually happened"
  - "That sounds practiced — give me a real moment where this played out"

### LLM Interpretation
**File:** `behavioral_analysis.py:259-310`
```python
if signal_name == "example_evasion":
    signal_desc = "Candidate was asked for an example but gave a theoretical answer"
    
# GPT-4o-mini generates:
# "Candidate stayed theoretical with generic approach when asked 
#  for specific example of their work."
```

### Database Storage
```json
{
  "signal": "example_evasion",
  "turns": [5],
  "confidence": 0.78,
  "evidence": "example requested but answer stayed theoretical or lacked specifics",
  "interpretation": "[LLM OUTPUT]",
  "visible": false,
  "count": 1
}
```

### Frontend Display
```
PROCTORING SIGNALS DETECTED
● Candidate stayed theoretical with generic approach when asked 
  for specific example of their work.
```

### Trust Impact
- **Bucket:** behavioral_confidence
- **Delta:** -0.15
- **Recoverable:** YES (example_given recovery signal +0.04)

---

## Signal 3: RESUME_CLAIM_MISMATCH ✅

### What It Detects
Answer sounds like resume copy ("I have worked with", "I used", "I'm familiar with") AND lacks concrete specifics/grounding OR depth < 5.5.

### Detection
**File:** `turn_decision.py:244-276`
```
Firing Rules:
- Question asks for example OR walkthrough AND
- Answer contains resume-like phrases AND
- Either: no specifics OR: depth < 5.5
- Confidence: 0.72 (no specifics) or 0.62 (weak depth)
- Trust bucket: behavioral_confidence
- Score delta: -0.12
- Recruiter visible: TRUE
```

### Example
```
Q: "Walk me through a project where you used React in production"
A: "I have worked with React. I've used it in multiple projects. 
   I am familiar with React hooks. I used Redux for state management."

Analysis:
- Question asks for walkthrough ✓
- Resume phrases: "I have worked with", "I've used", "I am familiar" ✓
- Specifics: NO (no project names, dates, numbers) ✓
- Depth: 3.5 < 5.5 ✓
- FIRES: confidence 0.72

Result:
- Directive: "Ask for concrete example, named project"
- Ishita probes: "Name a specific project. What did you build?"
```

### Interview Routing
- Routes to: **PROBE → evidence probe family**
- Directive: Move from claim to proof, ask for exact instance
- Starters:
  - "Give me a specific example of when that actually happened"
  - "That sounds practiced — give me a real moment"

### LLM Interpretation
**File:** `behavioral_analysis.py:259-310`
```python
if signal_name == "resume_claim_mismatch":
    signal_desc = "Candidate listed resume-like claims without concrete 
                   project details or hands-on evidence"
    
# GPT-4o-mini generates:
# "Candidate claims experience but can't articulate concrete 
#  project details or technical decisions."
```

### Database Storage
```json
{
  "signal": "resume_claim_mismatch",
  "turns": [4],
  "confidence": 0.72,
  "evidence": "resume-like claim with weak grounding or missing concrete evidence",
  "interpretation": "[LLM OUTPUT]",
  "visible": true,
  "count": 1
}
```

### Frontend Display
```
PROCTORING SIGNALS DETECTED
● Candidate claims experience but can't articulate concrete 
  project details or technical decisions.
```

### Trust Impact
- **Bucket:** behavioral_confidence
- **Delta:** -0.12
- **Recoverable:** YES

---

## Signal 4: FOLLOW_UP_COLLAPSE ✅

### What It Detects
Candidate gave strong first answer (depth ≥ 6.0) but follow-up dropped sharply (depth ≤ 3.0 or ≤ 5.0 with drop ≥ 2.0).

### Detection
**File:** `turn_decision.py:279-343`
```
Firing Rules:
- topic_follow_up_count >= 1 (must be follow-up, not first answer)
- first_answer_depth >= 6.0 (first answer was strong)
- current_depth <= 3.0 (complete collapse)
  OR (current_depth <= 5.0 AND drop >= 2.0) (partial collapse)

Two severity tiers:
- Stage 0 (first detection): 
  * Confidence: min(0.95, 0.65 + drop*0.05)
  * Score delta: -0.20 (complete) or -0.12 (partial)
  * Recoverable: TRUE
  
- Stage 1+ (repeat collapse):
  * Confidence: min(0.97, 0.80 + drop*0.04)
  * Score delta: -0.38
  * Recoverable: FALSE

- Trust bucket: behavioral_confidence
- Layer: hard_integrity (strongest signal)
- Recruiter visible: TRUE
```

### Example
```
Turn 3 - First Answer (Strong):
Q: "Tell me about your biggest technical achievement"
A: "I led the redesign of our payment system. Migrated from monolith 
   to microservices. I owned the database schema redesign, handled all 
   API integrations, trained the team. 6 months, 60% latency cut, 
   saved $200k in infrastructure."
   
Evaluation: depth = 8.5 (specific, numbers, ownership)

---

Turn 4 - Follow-up (Collapse):
Q: "Walk me through the database schema migration approach"
A: "Uh, we... we did the migration. We used Postgres. It was complex. 
   That's basically it."
   
Evaluation: depth = 2.0 (vague, no details, deflecting)

Analysis:
- topic_follow_up_count = 1 (follow-up) ✓
- first_answer_depth = 8.5 >= 6.0 ✓
- current_depth = 2.0 <= 3.0 ✓ (COMPLETE)
- drop = 6.5
- collapse_stage = 0
- FIRES: confidence 0.95, type="complete"

Result:
- Evidence: "complete collapse: first=8.5 follow-up=2.0 drop=6.5 stage=0"
- Stage 0 directive: L1 (natural probe)
- Ishita probes: "Can you walk me through that in more detail?"
- If still vague → collapse_stage=1 → L2 (ownership focus)
- If still vague → collapse_stage=2 → L3 (memory reconstruction)
```

### Interview Routing - Staged Probes

**Stage 0 (L1 - Natural Probe):**
```
Directive: "Can you walk me through that in a bit more detail?"
Goal: Surface the problem naturally, low pressure
If candidate recovers: collapse resolved, move on
If candidate stays vague: advance to stage 1
```

**Stage 1 (L2 - Ownership Focus):**
```
Directive: "What was your specific role in that — what did you personally own or build?"
Goal: Escalate ownership probe
If candidate recovers: collapse resolved
If still deflects: stage 2, strong authenticity flag
```

**Stage 2 (L3 - Memory Reconstruction):**
```
Directive: "Forget the overview — tell me about one specific day or meeting where that happened"
Goal: Test actual recall vs coached answer
If cannot reconstruct: strong integrity flag, continue but weight heavily
```

### LLM Interpretation
**File:** `behavioral_analysis.py:259-310`
```python
if signal_name == "follow_up_collapse":
    signal_desc = "Candidate gave detailed first answer but follow-up 
                   answer lost depth and specifics sharply"
    
# GPT-4o-mini generates:
# "First answer detailed but follow-up completely vague — 
#  suggests panic, inflated initial claim, or guessing."
```

### Database Storage
```json
{
  "signal": "follow_up_collapse",
  "turns": [4],
  "confidence": 0.95,
  "evidence": "complete collapse: first=8.5 follow-up=2.0 drop=6.5 stage=0",
  "interpretation": "[LLM OUTPUT]",
  "visible": true,
  "count": 1
}
```

### Frontend Display
```
PROCTORING SIGNALS DETECTED
● First answer detailed but follow-up completely vague — suggests panic, 
  inflated initial claim, or guessing.
```

### Trust Impact
- **Bucket:** behavioral_confidence
- **Delta (Stage 0):** -0.20 (recoverable)
- **Delta (Stage 1+):** -0.38 (non-recoverable)
- **Recovery Signal:** strong_under_pressure (+0.05 if candidate recovers)

---

## Implementation Details

### Files Modified

| File | Changes | Details |
|------|---------|---------|
| `turn_decision.py` | None needed | All signal detection already correct |
| `probe_strategy.py` | Lines 92-102 | depth_decay, complexity_latency_mismatch added to _SIGNAL_TO_FAMILY (for future use) |
| | Lines 319-329 | ownership_ambiguity directive added (mandatory probe text) |
| `behavioral_analysis.py` | Lines 1-8 | Added AsyncOpenAI import |
| | Lines 188-256 | Made extract_proctoring_signals() async |
| | Lines 259-310 | Updated _interpret_hidden_signal() to call LLM for ownership_ambiguity, example_evasion, resume_claim_mismatch, follow_up_collapse |
| | Lines 333-362 | Made synthesize_behavioral_report() async, await extract_proctoring_signals() |
| `agent_persistence.py` | Lines 986-992 | Changed synthesize_behavioral_report() call to await (async) |
| `interview-report-hyring.tsx` | Lines 475-491 | Added _formatSignalSummary() helper function with fallbacks |
| | Lines 1749-1757 | Added "proctoring_signals_detected" to labels dict |
| | Lines 1760-1790 | Added isSignalObjects check and conditional rendering for signal objects vs string bullets |

### LLM Integration

**Model:** GPT-4o-mini  
**When:** Only when signal actually fires (detection = true)  
**Input:** Signal name + evidence + signal description  
**Output:** Single-line summary (under 15 words)  
**Temperature:** 0.7  
**Max tokens:** 50

```python
response = await client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {
            "role": "system",
            "content": "You are an HR interviewer analyzing candidate behavior. 
                        Generate a single concise line (under 15 words) summarizing 
                        what this signal means for hiring."
        },
        {
            "role": "user",
            "content": f"Signal: {signal_desc}\nEvidence: {evidence}\n\nGenerate one short line."
        }
    ],
    temperature=0.7,
    max_tokens=50
)
```

### Database Storage

**Location:** `Interview.interviewReport` (JSON column)  
**Path:** `behavioral_analysis.proctoring_signals_detected` array

**Structure:**
```json
{
  "signal": "signal_name",
  "turns": [3, 4, 5],  // turns where signal fired
  "confidence": 0.95,
  "evidence": "detailed evidence from detection",
  "interpretation": "[LLM-generated one-liner]",
  "visible": true,  // recruiter_visible flag
  "count": 3  // how many times signal fired
}
```

### Frontend Display

**Location:** Behavioral Signals Tab (interview-report-hyring.tsx:1730-1790)  
**Rendering:**
```typescript
const isSignalObjects = value.length > 0 && 
                        typeof value[0] === 'object' && 
                        'signal' in value[0];

if (isSignalObjects) {
  // Render signal objects as single-line items with amber dots
  <ul className="space-y-1.5">
    {value.map((signal) => (
      <li className="flex gap-2.5">
        <span className="h-1.5 w-1.5 bg-amber-400" />
        <span>{_formatSignalSummary(signal)}</span>
      </li>
    ))}
  </ul>
}
```

**Format:**
```
PROCTORING SIGNALS DETECTED
● [First sentence of LLM interpretation]
● [First sentence of LLM interpretation]
```

---

## Verification Checklist

### ownership_ambiguity
- ✅ Detection: Fires when we_count >= 2 AND i_count <= 1
- ✅ Confidence: min(1.0, 0.45 + 0.15 * (we_count - 1))
- ✅ Routing: Maps to "ownership" probe family
- ✅ Directive: Mandatory instruction with specific probe text
- ✅ LLM Interpretation: GPT-4o-mini generates dynamic summary
- ✅ Database: Stored in proctoring_signals_detected array
- ✅ Frontend: Displays as single-line summary with amber dot
- ✅ Trust: -0.15 to behavioral_confidence bucket
- ✅ Recruiter Visible: TRUE
- ✅ Recovery: ownership_clarified signal (+0.05)

### example_evasion
- ✅ Detection: Fires when example requested + theoretical/no specifics
- ✅ Confidence: 0.78 (theoretical) or 0.68 (no specifics)
- ✅ Routing: Maps to "evidence" probe family
- ✅ Directive: Ask for concrete example with starters
- ✅ LLM Interpretation: GPT-4o-mini generates dynamic summary
- ✅ Database: Stored in proctoring_signals_detected array
- ✅ Frontend: Displays as single-line summary with amber dot
- ✅ Trust: -0.15 to behavioral_confidence bucket
- ✅ Recruiter Visible: FALSE (hidden, visible if count >= 2 or confidence >= 0.85)
- ✅ Recovery: example_given signal (+0.04)

### resume_claim_mismatch
- ✅ Detection: Fires when resume phrases + (no specifics OR weak depth)
- ✅ Confidence: 0.72 (no specifics) or 0.62 (weak depth)
- ✅ Routing: Maps to "evidence" probe family
- ✅ Directive: Ask for concrete example, named project
- ✅ LLM Interpretation: GPT-4o-mini generates dynamic summary
- ✅ Database: Stored in proctoring_signals_detected array
- ✅ Frontend: Displays as single-line summary with amber dot
- ✅ Trust: -0.12 to behavioral_confidence bucket
- ✅ Recruiter Visible: TRUE
- ✅ Recovery: Supports recovery when candidate provides specifics

### follow_up_collapse
- ✅ Detection: Fires when first>=6.0 AND current<=3.0 OR (<=5.0 with drop>=2.0)
- ✅ Confidence: 0.95 (stage 0) or 0.97 (stage 1+)
- ✅ Staging: L1 (natural) → L2 (ownership) → L3 (memory)
- ✅ Routing: Maps to "follow_up_collapse_staged" probe family
- ✅ Directive: Staged probes with escalating intensity
- ✅ LLM Interpretation: GPT-4o-mini generates dynamic summary
- ✅ Database: Stored with drop metrics and stage info
- ✅ Frontend: Displays as single-line summary with amber dot
- ✅ Trust: -0.20 (stage 0, recoverable) or -0.38 (stage 1+, non-recoverable)
- ✅ Recruiter Visible: TRUE
- ✅ Recovery: strong_under_pressure signal (+0.05)
- ✅ Layer: hard_integrity (strongest signal)

---

## Database Query Examples

### Check if signals are saved
```sql
SELECT 
  "applicationId",
  jsonb_array_length("interviewReport" -> 'behavioral_analysis' -> 'proctoring_signals_detected') as signal_count,
  jsonb_agg(elem->>'signal') as signal_names
FROM "Interview",
  jsonb_array_elements("interviewReport" -> 'behavioral_analysis' -> 'proctoring_signals_detected') as elem
WHERE "interviewReport" -> 'behavioral_analysis' ->> 'proctoring_signals_detected' IS NOT NULL
GROUP BY "applicationId"
ORDER BY "applicationId" DESC
LIMIT 10;
```

### Check specific signal
```sql
SELECT 
  "applicationId",
  jsonb_pretty(elem)
FROM "Interview",
  jsonb_array_elements("interviewReport" -> 'behavioral_analysis' -> 'proctoring_signals_detected') as elem
WHERE elem->>'signal' = 'ownership_ambiguity'
LIMIT 5;
```

### Check signal with interpretation
```sql
SELECT 
  "applicationId",
  elem->>'signal' as signal_name,
  elem->'turns' as turns,
  elem->>'confidence' as confidence,
  elem->>'evidence' as evidence,
  elem->>'interpretation' as interpretation
FROM "Interview",
  jsonb_array_elements("interviewReport" -> 'behavioral_analysis' -> 'proctoring_signals_detected') as elem
WHERE elem->>'signal' IN ('ownership_ambiguity', 'example_evasion', 'resume_claim_mismatch', 'follow_up_collapse')
ORDER BY "applicationId" DESC
LIMIT 20;
```

---

## Trust Engine Integration

All signals integrate with trust engine via `behavioral_confidence` bucket (30% weight):

```python
# trust_engine.py: apply_turn_decision()

signal_deltas = {
    "ownership_ambiguity": -0.15,           # recoverable
    "example_evasion": -0.15,               # recoverable
    "resume_claim_mismatch": -0.12,         # recoverable
    "follow_up_collapse_stage0": -0.20,     # recoverable
    "follow_up_collapse_stage1+": -0.38,    # non-recoverable
}

for event in signal_events:
    bucket = event["trust_bucket_affected"]
    delta = event["score_delta"]
    state["buckets"][bucket] = clamp(state["buckets"][bucket] + delta)

# Recovery signals add trust back
recovery_deltas = {
    "ownership_clarified": +0.05,
    "example_given": +0.04,
    "strong_under_pressure": +0.05,
}
```

---

## Frontend Output Example

```
┌─ BEHAVIORAL SIGNALS TAB ──────────────────────────────────────┐
│                                                               │
│ OVERALL ASSESSMENT                                            │
│ [Blue box] Behavioral assessment: Candidate engaged actively │
│            but shows pattern of team-language usage...        │
│                                                               │
│ ENGAGEMENT SIGNALS                                            │
│ ● Candidate spoke frequently and engaged throughout          │
│                                                               │
│ CONSISTENCY & RESUME ALIGNMENT                               │
│ ● No major contradictions detected                           │
│                                                               │
│ COMMUNICATION PATTERNS                                        │
│ ● Communication quality varies significantly                │
│                                                               │
│ CONFIDENCE INDICATORS                                         │
│ ● Areas of false/unwarranted confidence detected            │
│                                                               │
│ INTEGRITY FLAGS & RED FLAGS                                  │
│ ● No integrity concerns detected                             │
│                                                               │
│ PROCTORING SIGNALS DETECTED  ← NEW SECTION                  │
│ ● Candidate relies on 'we' language without demonstrating   │
│   personal technical ownership or decision-making.           │
│ ● Candidate gave theoretical answer when asked for concrete │
│   example of their work.                                     │
│ ● Candidate claims experience but can't articulate concrete │
│   project details or technical decisions.                    │
│ ● First answer detailed but follow-up completely vague —    │
│   suggests panic, inflated initial claim, or guessing.       │
│                                                               │
│ BEHAVIORAL STRENGTHS                                          │
│ ● Demonstrates concrete system design experience            │
│                                                               │
│ BEHAVIORAL CONCERNS                                           │
│ ● Communication clarity varies when discussing personal role│
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Summary

✅ **All 4 signals fully integrated end-to-end:**

1. **Detection** (turn_decision.py): Fires with correct confidence scores
2. **Routing** (probe_strategy.py): Maps to appropriate probe families
3. **Directive Injection**: Mandatory instructions injected into interview
4. **LLM Interpretation** (behavioral_analysis.py): GPT-4o-mini generates dynamic one-liners
5. **Database Storage** (agent_persistence.py): Saves signal objects with evidence
6. **Frontend Display** (interview-report-hyring.tsx): Shows single-line summaries in Behavioral Signals tab
7. **Trust Integration** (trust_engine.py): Updates behavioral_confidence bucket
8. **Recovery Mechanics**: Supports recovery signals when candidates clarify

All signals:
- Only use LLM when signal actually fires (no wasted calls)
- Generate concise, recruiter-friendly one-liners
- Store full context in database for compliance/audit
- Display cleanly in HR report without overwhelming detail
- Integrate with trust engine for scoring impact

**Status: PRODUCTION READY** ✅

No errors. All verification checks passed.
