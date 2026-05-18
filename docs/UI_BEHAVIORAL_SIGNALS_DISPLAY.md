# How Ownership_Ambiguity Signal Displays in Behavioral Signals Tab

## Current UI Structure

The interview report has tabs for:
1. **Integrity** (proctoring flags, tab switching, face absent, etc.)
2. **Behavioral** (engagement, consistency, communication, confidence)
3. **Cognitive** (clarity, depth, problem-solving, etc.)

Currently the **Behavioral signals** tab shows:
```
├─ Overall Assessment (summary section)
├─ Engagement Signals (bullets)
├─ Consistency & Resume Alignment (bullets)
├─ Communication Patterns (bullets)
├─ Confidence Indicators (bullets)
├─ Integrity Flags & Red Flags (bullets)
├─ Behavioral Strengths (bullets)
└─ Behavioral Concerns (bullets)
```

---

## Where Ownership_Ambiguity Will Appear

**File**: `interview-report-Sreeva AI.tsx:1709-1754`

```typescript
{intel === "behavioral" && (
  <div className="space-y-4">
    {model.behavioralAnalysis && Object.entries(model.behavioralAnalysis).map(([key, value]) => {
      // key = "proctoring_signals_detected" ← NEW SECTION
      // value = [
      //   {
      //     "signal": "ownership_ambiguity",
      //     "turns": [3],
      //     "confidence": 1.0,
      //     "evidence": "team-language count=5, first-person count=0",
      //     "interpretation": "Heavy use of team language..."
      //   }
      // ]
      
      if (Array.isArray(value) && value.length > 0) {
        const labels: Record<string, string> = {
          engagement_signals: "Engagement Signals",
          consistency_signals: "Consistency & Resume Alignment",
          communication_patterns: "Communication Patterns",
          confidence_indicators: "Confidence Indicators",
          integrity_flags: "Integrity Flags & Red Flags",
          strengths_observed: "Behavioral Strengths",
          concerns_noted: "Behavioral Concerns",
          proctoring_signals_detected: "Proctoring Signals Detected"  // ← NEW
        };
        
        return (
          <div key={key}>
            <p className="text-[11px] font-extrabold uppercase tracking-widest">
              {labels[key]}  // ← Will display: "PROCTORING SIGNALS DETECTED"
            </p>
            <ul className="space-y-1.5">
              {value.map((bullet: string, idx: number) => (
                <li key={idx} className="flex gap-2.5">
                  <span className="h-1.5 w-1.5 bg-green" />
                  <span>{bullet}</span>  // ← Currently expects string bullets
                </li>
              ))}
            </ul>
          </div>
        );
      }
    })}
  </div>
)}
```

---

## Problem: Current Code Expects Strings, Not Objects

**Current Implementation** (lines 1741-1746):
```typescript
{value.map((bullet: string, idx: number) => (
  <li key={idx} className="flex gap-2.5 text-[13px] leading-snug">
    <span className="h-1.5 w-1.5 bg-green" />
    <span>{bullet}</span>  // ← Expects string like "Candidate spoke frequently..."
  </li>
))}
```

**What We're Passing** (from behavioral_analysis.py):
```json
{
  "proctoring_signals_detected": [
    {
      "signal": "ownership_ambiguity",
      "turns": [3],
      "confidence": 1.0,
      "evidence": "...",
      "interpretation": "..."
    }
  ]
}
```

**Result**: Currently won't display correctly because it's expecting array of strings, not objects.

---

## How It SHOULD Display (UI Mockup)

```
┌─────────────────────────────────────────────────────────────────┐
│ BEHAVIORAL SIGNALS                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  OVERALL ASSESSMENT                                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Behavioral assessment: Candidate engaged actively but    │  │
│  │ shows pattern of team-language usage without clear      │  │
│  │ personal ownership of technical decisions.              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ENGAGEMENT SIGNALS                                             │
│  • Candidate spoke frequently and engaged throughout           │
│                                                                 │
│  CONSISTENCY & RESUME ALIGNMENT                                │
│  • No major contradictions detected                            │
│                                                                 │
│  COMMUNICATION PATTERNS                                        │
│  • Communication quality varies significantly                  │
│                                                                 │
│  CONFIDENCE INDICATORS                                         │
│  • Areas of false/unwarranted confidence detected             │
│                                                                 │
│  PROCTORING SIGNALS DETECTED  ← NEW SECTION                   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Signal: OWNERSHIP_AMBIGUITY                            │   │
│  │ Turn: 3                                                │   │
│  │ Confidence: 100%                                       │   │
│  │                                                        │   │
│  │ Evidence: team-language count=5, first-person count=0 │   │
│  │                                                        │   │
│  │ What this means:                                       │   │
│  │ Heavy use of team language ('we', 'our') with minimal │   │
│  │ personal ownership language ('I', 'my'). May indicate │   │
│  │ candidate contributed to team effort but unclear on   │   │
│  │ personal technical decisions.                         │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  BEHAVIORAL STRENGTHS                                          │
│  • Demonstrates concrete system design experience              │
│                                                                 │
│  BEHAVIORAL CONCERNS                                           │
│  • Communication clarity varies when discussing personal role  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fix Required: Update React Component

**File**: `interview-report-Sreeva AI.tsx:1727-1750`

```typescript
// BEFORE (expects strings only)
if (Array.isArray(value) && value.length > 0) {
  const labels: Record<string, string> = {
    engagement_signals: "Engagement Signals",
    consistency_signals: "Consistency & Resume Alignment",
    communication_patterns: "Communication Patterns",
    confidence_indicators: "Confidence Indicators",
    integrity_flags: "Integrity Flags & Red Flags",
    strengths_observed: "Behavioral Strengths",
    concerns_noted: "Behavioral Concerns"
  };
  return (
    <div key={key}>
      <p className="text-[11px] font-extrabold uppercase tracking-widest">{labels[key]}</p>
      <ul className="space-y-1.5">
        {value.map((bullet: string, idx: number) => (
          <li key={idx} className="flex gap-2.5 text-[13px] leading-snug">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E9D55]" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// AFTER (handles both strings AND signal objects)
if (Array.isArray(value) && value.length > 0) {
  const labels: Record<string, string> = {
    engagement_signals: "Engagement Signals",
    consistency_signals: "Consistency & Resume Alignment",
    communication_patterns: "Communication Patterns",
    confidence_indicators: "Confidence Indicators",
    integrity_flags: "Integrity Flags & Red Flags",
    strengths_observed: "Behavioral Strengths",
    concerns_noted: "Behavioral Concerns",
    proctoring_signals_detected: "Proctoring Signals Detected"  // ← ADD THIS
  };
  
  const isSignalObjects = value.length > 0 && typeof value[0] === 'object' && 'signal' in value[0];
  
  return (
    <div key={key}>
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#6B7079] mb-2">
        {labels[key]}
      </p>
      
      {isSignalObjects ? (
        // NEW: Render proctoring signals as cards
        <div className="space-y-2">
          {value.map((signal: any, idx: number) => (
            <div 
              key={idx} 
              className="border border-amber-200 bg-amber-50 rounded p-3"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-[12px] font-bold text-amber-900 uppercase">
                  {signal.signal}
                </p>
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                  {Math.round(signal.confidence * 100)}%
                </span>
              </div>
              
              <p className="text-[11px] text-amber-800 mb-2">
                <span className="font-semibold">Turn {signal.turns?.join(", ")}:</span> {signal.evidence}
              </p>
              
              <div className="bg-white rounded p-2 border-l-2 border-amber-300">
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  {signal.interpretation}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // EXISTING: Render as bullet points
        <ul className="space-y-1.5">
          {value.map((bullet: string, idx: number) => (
            <li key={idx} className="flex gap-2.5 text-[13px] leading-snug text-[#1A1D22]">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1E9D55]" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

---

## What Gets Rendered After Fix

```jsx
<div className="space-y-2">
  <div className="border border-amber-200 bg-amber-50 rounded p-3">
    
    {/* Header with signal name and confidence */}
    <div className="flex items-start justify-between mb-2">
      <p className="text-[12px] font-bold text-amber-900 uppercase">
        ownership_ambiguity
      </p>
      <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
        100%
      </span>
    </div>
    
    {/* Evidence line */}
    <p className="text-[11px] text-amber-800 mb-2">
      <span className="font-semibold">Turn 3:</span> team-language count=5, first-person count=0
    </p>
    
    {/* Interpretation box */}
    <div className="bg-white rounded p-2 border-l-2 border-amber-300">
      <p className="text-[11px] text-amber-900 leading-relaxed">
        Heavy use of team language ('we', 'our') with minimal personal ownership 
        language ('I', 'my'). May indicate candidate contributed to team effort 
        but unclear on personal technical decisions.
      </p>
    </div>
    
  </div>
</div>
```

---

## Visual Layout (HTML)

```html
<div class="border border-amber-200 bg-amber-50 rounded p-3">
  
  <div class="flex items-start justify-between mb-2">
    <p class="text-[12px] font-bold text-amber-900 uppercase">
      ownership_ambiguity
    </p>
    <span class="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
      100%
    </span>
  </div>
  
  <p class="text-[11px] text-amber-800 mb-2">
    <span class="font-semibold">Turn 3:</span> 
    team-language count=5, first-person count=0
  </p>
  
  <div class="bg-white rounded p-2 border-l-2 border-amber-300">
    <p class="text-[11px] text-amber-900 leading-relaxed">
      Heavy use of team language ('we', 'our') with minimal personal ownership 
      language ('I', 'my'). May indicate candidate contributed to team effort 
      but unclear on personal technical decisions.
    </p>
  </div>
  
</div>
```

---

## Color Scheme

| Element | Color |
|---------|-------|
| Card background | amber-50 (#fffbeb) |
| Card border | amber-200 (#fcd34d) |
| Header text | amber-900 (#78350f) |
| Badge background | amber-100 (#fef3c7) |
| Evidence text | amber-800 (#b45309) |
| Interpretation box | white with amber-300 left border |

---

## Data Flow: From Backend to UI

```
1. Backend (turn_decision.py)
   ownership_ambiguity signal fires
   ↓
   
2. Agent Runtime (agent_runtime.py)
   Appended to proctoring_events list
   ↓
   
3. Report Generation (agent_persistence.py)
   generate_interview_report() called
   proctoring_events passed to synthesize_behavioral_report()
   ↓
   
4. Behavioral Analysis (behavioral_analysis.py)
   extract_proctoring_signals(proctoring_events)
   Returns: {
     "signal": "ownership_ambiguity",
     "turns": [3],
     "confidence": 1.0,
     "evidence": "team-language count=5, first-person count=0",
     "interpretation": "Heavy use of team language..."
   }
   ↓
   
5. Final Report Structure
   {
     "behavioral_analysis": {
       "engagement_signals": [...],
       ...
       "proctoring_signals_detected": [
         {
           "signal": "ownership_ambiguity",
           ...
         }
       ]
     }
   }
   ↓
   
6. Database Storage
   JSON saved to Interview.interviewReport column
   ↓
   
7. Frontend Rendering (interview-report-Sreeva AI.tsx)
   model.behavioralAnalysis.proctoring_signals_detected
   ↓
   
8. UI Display
   Signal card appears in "Behavioral Signals" tab
   ┌─────────────────────────────┐
   │ ownership_ambiguity    100% │
   │ Turn 3: team-language...    │
   │ Heavy use of team language..│
   └─────────────────────────────┘
```

---

## Summary

✅ **Backend**: Ownership_ambiguity signal fires and is captured
✅ **Report**: Signal formatted with evidence + interpretation
✅ **Database**: Stored in interview report JSON
❌ **Frontend**: Currently expects strings, not objects - **NEEDS FIX**

**To Fix**: Update `interview-report-Sreeva AI.tsx:1727-1750` to handle both string bullets AND signal objects, rendering signals as amber cards with confidence badge.

Once fixed, ownership_ambiguity (and all other proctoring signals) will display beautifully in the Behavioral Signals tab.
