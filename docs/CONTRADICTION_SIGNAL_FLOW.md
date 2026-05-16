# Contradiction & Contradiction Resolved — End-to-End Flow

---

## 1. TRIGGER — When does it fire?

**Contradiction** requires an LLM claim-extraction call every turn (expensive, opt-in).  
**Contradiction Resolved** fires automatically when the candidate clarifies convincingly.

Both are **disabled by default** on PRO plan, **enabled on SCALE/ENTERPRISE**.

---

## 2. DETECTION FLOW (agent_runtime.py)

```
Per candidate answer:

Step 1 — Claim Extraction (only if contradiction=true in org toggles)
  extract_claims(answer, turn, llm) → list of claims
  e.g. [{ type: "years_experience", value: "5 years", quote: "...", context: "general" }]

Step 2 — Contradiction Check (rule-based, no LLM)
  check_contradiction(new_claim, _claim_index) → contradiction dict or None
  Rules per type:
    team_size         → numeric diff ≥ 3
    years_experience  → numeric diff > 2
    project_ownership → solo vs team keyword clash
    tenure/timeline   → relative diff > 40%
    others            → no shared words between values

Step 3 — State Machine (contradiction_state.py)
  advance_contradiction_state(state, contradiction, turn, action, quality_avg)
  
  States:
    none → surfaced          (new contradiction found)
    surfaced → repeated      (same type fires again, not clarified)
    surfaced → candidate_clarified  (candidate explains, action=MOVE_ON, quality≥5.5)
    surfaced → unresolved    (candidate probed but didn't clarify well)

Step 4 — Routing (turn_evaluator.py via probe_strategy.py)
  contradiction=True in signal_flags → action=VERIFY
  Directive injected into system prompt:
    "Earlier: '{old_value}' | Now: '{new_value}' — surface with genuine confusion"
```

---

## 3. STORAGE FLOW — How it reaches the DB

### 3a. proctoring_events list (agent_runtime.py:1617–1648)

Every contradiction state transition appends to `proctoring_events`:

```python
{
  "signal_name": "contradiction",           # or "contradiction_resolved" if status=candidate_clarified
  "signal_layer": "hard_integrity",
  "event": "contradiction_state",
  "source": "surface" | "clarified" | "unresolved",
  "status": "surfaced" | "repeated" | "candidate_clarified" | "unresolved",
  "turn": int,
  "surfaced_turn": int,
  "repeat_count": int,
  "confidence": 0.95 (surfaced) | 0.90 (repeated) | 0.80 (clarified),
  "recruiter_visible": True,
  "evidence": "earlier=5 years | now=1 year",
  "contradiction_type": "years_experience",
  "trust_delta": -0.10 (first) | -0.14 (repeated) | +0.06 (clarified),
  "score_delta": same as trust_delta,
}
```

### 3b. synthesize_behavioral_report() (agent_persistence.py:986)

Called at interview end with `proctoring_data["events"]` = full proctoring_events list.

`extract_proctoring_signals()` in behavioral_analysis.py:
- Groups events by `signal_name`
- "contradiction" events → grouped together
- "contradiction_resolved" events → grouped separately
- Both have `recruiter_visible=True` → always included
- Calls `_interpret_hidden_signal()` for LLM one-liner

### 3c. DB write (agent_persistence.py:1108)

```sql
UPDATE "Interview"
SET "interviewReport" = $1
WHERE "applicationId" = $2
```

Final JSON structure:
```json
{
  "behavioral_analysis": {
    "proctoring_signals_detected": [
      {
        "signal": "contradiction",
        "turns": [6, 9],
        "confidence": 0.95,
        "evidence": "earlier=5 years | now=1 year",
        "interpretation": "<LLM one-liner or static fallback>",
        "visible": true,
        "count": 2
      },
      {
        "signal": "contradiction_resolved",
        "turns": [10],
        "confidence": 0.80,
        "evidence": "candidate clarified the conflicting claim",
        "interpretation": "<LLM one-liner or static fallback>",
        "visible": true,
        "count": 1
      }
    ]
  }
}
```

---

## 4. LLM SUMMARY GENERATION (behavioral_analysis.py)

`_interpret_hidden_signal()` is called for both signals:

**Contradiction — LLM prompt:**
```
Signal: "Candidate contradicted a prior claim about years experience:
         earlier said '5 years', then said '1 year'"
Evidence: "earlier=5 years | now=1 year"
→ Output: "Candidate gave conflicting experience claims — verify in follow-up."
```

**Contradiction Resolved — LLM prompt:**
```
Signal: "Candidate clarified and resolved a contradiction about years experience
         convincingly after being probed"
Evidence: "candidate clarified the conflicting claim"
→ Output: "Contradiction resolved — candidate explained the discrepancy credibly."
```

**Static fallback (if LLM fails):**
- contradiction: "Candidate made conflicting statements about a verifiable fact — needs recruiter review."
- contradiction_resolved: "Candidate clarified and resolved a contradiction convincingly when probed."

---

## 5. FRONTEND RENDERING (interview-report-Sreeva AI.tsx)

**Tab:** Behavioral Signals → `proctoring_signals_detected` section

```
● Candidate gave conflicting experience claims — verify in follow-up.
   (amber dot, problem signal)

✓ Contradiction resolved — candidate explained the discrepancy credibly.
   (check prefix, recovery signal)
```

**`_formatSignalSummary()` logic:**
1. `signal.signal === "contradiction_resolved"` → prefix `"✓ "`
2. `signal.signal === "contradiction"` → prefix `"● "`
3. If `signal.interpretation` exists → use first sentence (LLM result)
4. Else → use static fallback from `fallbacks` dict

---

## 6. ADMIN TOGGLE — Does disabling in superadmin work?

**Yes, fully respected.** Here is the exact chain:

```
Superadmin UI
  └─ toggles contradiction=false / contradiction_resolved=false
  └─ saved to Organization.proctoringSignals (DB column, JSON)

Interview token request (app/api/interview/token/route.ts:224)
  └─ reads org.proctoringSignals
  └─ normalizeProctoringSignals() → typed ProctoringSignalToggles
  └─ passed as metadata to LiveKit room → agent receives via context

Agent startup (agent_runtime.py:538)
  └─ _extract_evaluation_signal_toggles(context.get("proctoringSignals"))
  └─ builds evaluation_signal_toggles dict

Per turn (agent_runtime.py:1434)
  └─ _contradiction_enabled = evaluation_signal_toggles.get("contradiction", False)
  └─ if False → extract_claims() SKIPPED entirely (no LLM cost)
  └─ contradiction_alert = None always
  └─ advance_contradiction_state() SKIPPED (guarded by contradiction_enabled at line 1609)
  └─ No contradiction events written to proctoring_events
  └─ No contradiction appears in DB or frontend
```

**Disable contradiction only:**
- Claim extraction skipped → no LLM cost
- No state events → nothing in proctoring_events
- behavioral_analysis.proctoring_signals_detected has no contradiction entry
- Frontend shows nothing for contradiction

**Disable contradiction_resolved only:**
- Contradiction still fires and stores
- `apply_contradiction_resolved()` (trust engine) NOT called (line 1639)
- State machine still transitions to candidate_clarified
- BUT: the resolved event is still written to proctoring_events with signal_name="contradiction_resolved"
- ⚠️ NOTE: the resolved event write is NOT separately gated by contradiction_resolved toggle
  — it fires whenever contradiction=true and state transitions to clarified
  — contradiction_resolved toggle only controls the trust engine call, not the event storage

**Plan-level defaults:**
- PRO: both OFF (no claim extraction, no cost)
- SCALE/ENTERPRISE: both ON

---

## 7. BUGS FIXED IN THIS SESSION

| # | File | Bug | Fix |
|---|------|-----|-----|
| 1 | agent_runtime.py:1618 | Contradiction proctoring events had no `signal_name` key → grouped as "unknown" in extract_proctoring_signals() | Added `signal_name` ("contradiction" or "contradiction_resolved" based on status), `confidence`, `recruiter_visible`, `signal_layer` |
| 2 | behavioral_analysis.py:263 | "contradiction" and "contradiction_resolved" missing from LLM interpretation list | Added both to LLM signal list with rich prompts using old_value/new_value/contradiction_type from event data |
| 3 | behavioral_analysis.py:313 | No static fallback for contradiction signals | Added static fallbacks for both |
| 4 | turn_decision.py:20 | SignalFlags TypedDict missing `contradiction_resolved` (and had duplicate ownership_clarified/example_given entries) | Cleaned up duplicates, added contradiction_resolved |
| 5 | turn_decision.py:742 | build_signal_flags() missing contradiction_resolved | Added |
| 6 | interview-report-Sreeva AI.tsx:477 | _formatSignalSummary() had no fallback for contradiction/contradiction_resolved, and only ownership_clarified/example_given had recovery prefix | Added both to fallbacks dict, added contradiction_resolved to isRecovery check |

---

## 8. FULL SIGNAL STATUS TABLE

| Signal | Fires | Toggle respected | DB storage | LLM summary | Frontend | Recovery prefix |
|--------|-------|-----------------|------------|-------------|----------|----------------|
| contradiction | ✅ claim extraction + state machine | ✅ fully gated | ✅ signal_name="contradiction" | ✅ LLM + static fallback | ✅ ● prefix | — |
| contradiction_resolved | ✅ state=candidate_clarified transition | ⚠️ trust engine gated, event write always fires if contradiction=ON | ✅ signal_name="contradiction_resolved" | ✅ LLM + static fallback | ✅ ✓ prefix | ✅ |
