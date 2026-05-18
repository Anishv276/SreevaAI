# Signal Flow Architecture - End-to-End

## 1. DETECTION LAYER (turn_decision.py)
**Where signals fire per turn**

### 1a. Signal Detection Functions
- `detect_signal_events()` — main orchestrator
- 11 detector functions:
  - `_detect_ownership_ambiguity_event()` — 2+ "we", <2 "I"
  - `_detect_example_evasion_event()` — example requested, answer theoretical
  - `_detect_resume_claim_mismatch_event()` — resume phrases without specifics
  - `_detect_follow_up_collapse_event()` — sharp depth drop (6.0 → ≤3.0)
  - `_detect_latency_mismatch_event()` — follow-up compressed to <42 words
  - `_detect_contradiction_event()` — fact conflicts detected
  - `_detect_depth_decay_event()` — cross-topic quality decline
  - `_detect_complexity_latency_mismatch_event()` — complex Q fast or simple Q slow
  - `_detect_ownership_clarified_event()` — **RECOVERY**: personal "I" + ownership terms
  - `_detect_example_given_event()` — **RECOVERY**: concrete details (dates/numbers)

### 1b. Output: SignalEvent
```python
{
  "signal_name": str,              # e.g., "ownership_ambiguity"
  "signal_layer": str,             # behavioral_confidence, hard_integrity, etc.
  "confidence": float,             # 0.0–1.0
  "evidence": str,                 # "team-language count=3, first-person count=1"
  "trust_bucket_affected": str,    # trust dimension impacted
  "score_delta": float,            # -0.40 to +0.05 (negative = risky)
  "probe_mode": str,               # ownership, evidence, compression, etc.
  "recruiter_visible": bool,       # default False for hidden signals
  "count": int,                    # fires 2+ times = auto-visible
}
```

---

## 2. FILTERING LAYER (turn_evaluator.py)
**Respects admin toggle settings**

### 2a. Signal Toggle Check
```python
def _is_signal_enabled(signal_toggles: dict, signal_name: str) -> bool:
    # Reads superadmin config via signal_toggles parameter
    # Returns True if signal NOT explicitly disabled
    # Default: True (all signals fire unless disabled)
```

### 2b. Admin Control
- Called in `run_turn_evaluation()` at line 117-121
- Filters signal_events BEFORE building signal_flags
- **Key path**: signal_toggles → _is_signal_enabled() → filtered list

### 2c. Special handling
- Contradiction always checked: `contradiction_enabled = _is_signal_enabled(signal_toggles, "contradiction")`
- Affects decision routing if disabled

---

## 3. SYNTHESIS LAYER (behavioral_analysis.py)
**Builds narrative for recruiter**

### 3a. extract_proctoring_signals()
- Groups signal events by name
- Applies visibility rules:
  - Always include: recruiter_visible=True
  - Hidden signals: include if count ≥ 2 OR confidence ≥ 0.85
- Calls `_interpret_hidden_signal()` for LLM summary

### 3b. _interpret_hidden_signal()
**Signals requiring LLM interpretation:**
- ownership_ambiguity
- example_evasion
- resume_claim_mismatch
- follow_up_collapse
- latency_mismatch
- ownership_clarified
- example_given

**LLM prompt** (gpt-4o-mini):
```
System: "You are an HR interviewer analyzing candidate behavior. Generate a single concise line 
         (under 15 words) summarizing what this signal means for hiring."
User:   "Signal: {signal_desc}\nEvidence: {evidence_text}"
Output: One-liner interpretation (fallback to static text if LLM fails)
```

### 3c. Output: report["proctoring_signals_detected"]
```python
[
  {
    "signal": str,          # ownership_ambiguity, latency_mismatch, etc.
    "turns": [int],         # turn numbers where signal fired
    "confidence": float,    # 0.0–1.0
    "evidence": str,        # combined evidence from firings
    "interpretation": str,  # LLM-generated one-liner (recruiter-friendly)
    "visible": bool,        # recruiter_visible flag
    "count": int,          # number of times signal fired
  }
]
```

---

## 4. PERSISTENCE LAYER (DB)
**Where signals get stored for frontend**

### 4a. Schema (inferred from code)
- `interview_reports.behavioral_analysis` — JSON blob
  - `.proctoring_signals_detected[]` — array of signal objects
  - `.engagement_signals[]` — prose, not structured
  - `.consistency_signals[]` — prose
  - `.communication_patterns[]` — prose
  - `.confidence_indicators[]` — prose
  - `.integrity_flags[]` — prose

### 4b. Storage path
1. `synthesize_behavioral_report()` builds entire report in Python
2. Report JSON persisted to DB (likely via API or ORM)
3. Frontend fetches via `/api/interviews/{id}` or similar

---

## 5. FRONTEND RENDERING LAYER (interview-report-Sreeva AI.tsx)
**How recruiters see signals**

### 5a. Data Flow
```
buildSreeva AIInterviewViewModel(i: {
  interviewReportBehavioralAnalysis,  // ← from DB
  ...
}) → Sreeva AIInterviewViewModel {
  integritySignals,    // ← mapped from proctoring rows (NOT proctoring_signals_detected)
  behavioralAnalysis,  // ← raw behavioral_analysis object
  ...
}
```

### 5b. Rendering
**CRITICAL GAP**: The code shows:
- Line 645: `integritySignals = buildIntegritySignals(proctoringRows)`
- `proctoringRows` is built from `groupedProctoringSignals` (proctoring telemetry counts)
- NOT from `proctoring_signals_detected` (behavioral signals with LLM interpretation)

**Result**: Frontend shows old-style proctoring rows (tab switching, attention drifts, etc.)
But NOT the new behavioral signals (ownership ambiguity, latency mismatch, etc.)

### 5c. Signal Summary Formatting
```typescript
function _formatSignalSummary(signal: any): string {
  const isRecovery = signal.signal === "ownership_clarified" || "example_given";
  const prefix = isRecovery ? "✓ " : "● ";
  
  // Use LLM interpretation if available
  if (signal.interpretation) {
    return prefix + signal.interpretation.split('.')[0] + '.';
  }
  // Fallback static text
}
```

---

## 6. ADMIN OVERRIDE LAYER (superadmin settings)
**Where recruiters control signal visibility**

### 6a. Access Point
- Superadmin → Settings or Signal Management
- Config stored in `signal_toggles` dict/table
- Structure (inferred):
```python
{
  "ownership_ambiguity": True/False,
  "example_evasion": True/False,
  "latency_mismatch": True/False,
  "follow_up_collapse": True/False,
  ... (all 11 signals)
}
```

### 6b. Effect
- Pass `signal_toggles` to `run_turn_evaluation()`
- Filters at line 117-121: only enabled signals contribute to decision
- Disabled signals:
  - DO NOT affect next question routing (action/mode/goal)
  - DO NOT contribute to trust delta
  - DO NOT appear in interview report

---

## Testing Checklist per Signal

For each signal (e.g., **latency_mismatch**):

### ✅ Step 1: Detection Works
- Run interview with follow-up answers < 42 words after detail-seeking question
- Check logs: `[TURN_EVAL] ... signals=[..., 'latency_mismatch']`
- Verify TurnDecision.signal_events contains latency_mismatch event

### ✅ Step 2: Persists in DB
- Query interview_reports.behavioral_analysis
- Look for `proctoring_signals_detected[]` array
- Should contain object with `"signal": "latency_mismatch"`

### ✅ Step 3: LLM Summary Generated
- Check `interpretation` field in DB object
- Should be < 15 words, recruiter-friendly
- e.g., "Follow-up answer unnaturally compressed — suggests evasion or guessing"

### ✅ Step 4: Frontend Renders + LLM Summary
- Navigate to interview report
- Tab to "Behavioral signals" (if wired in)
- Confirm signal card shows badge + interpretation one-liner
- Dropdown expands to show evidence + details

### ✅ Step 5: Admin Toggle Blocks It
- Superadmin: disable latency_mismatch
- Re-run interview
- Signal fires but NOT included in report
- Verify TurnDecision.signals.latency_mismatch = False
- Next question routing unaffected by latency_mismatch

---

## Known Gaps (to fix)

1. **Frontend Missing Behavioral Signals**
   - integritySignals built from proctoringRows (old telemetry)
   - Should pull from behavioral_analysis.proctoring_signals_detected
   - Need new section or tab for behavioral signals

2. **Admin Toggle Wiring**
   - signal_toggles parameter passed to turn_evaluator
   - But where does superadmin config load signal_toggles?
   - Need trace: superadmin DB → signal_toggles dict → run_turn_evaluation()

3. **Recovery Signals in Report**
   - ownership_clarified and example_given fire correctly
   - But are they marked recoverable=False (don't repeat)?
   - Confirm they appear with ✓ prefix in frontend

4. **Hidden Signal Visibility Rule**
   - Hidden signals auto-show if count ≥ 2
   - Test: let ownership_ambiguity fire twice → should appear
   - Verify confidence threshold (≥0.85) trigger works
