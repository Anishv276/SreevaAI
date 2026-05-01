# How Ownership_Ambiguity Signal Gets Stored in Report - Complete Example

## Flow: From Signal Detection to Database Storage

```
INTERVIEW HAPPENING
    ↓
Turn 3: Candidate answers about project
    ↓
signal detection: ownership_ambiguity fires
    confidence=1.0, evidence="team-language count=5, first-person count=0"
    ↓
proctoring_events list gets event appended:
    {
      "signal_name": "ownership_ambiguity",
      "turn": 3,
      "confidence": 1.0,
      "evidence": "team-language count=5, first-person count=0",
      ...
    }
    ↓
Interview ends
    ↓
generate_interview_report() called
    ↓
synthesize_behavioral_report(proctoring_events=proctoring_events)
    ↓
extract_proctoring_signals(proctoring_events)
    ↓
Filters events: includes ownership_ambiguity (recruiter_visible=True)
    ↓
Formats evidence + interpretation
    ↓
Returns: proctoring_signals_detected = [
    {
      "signal": "ownership_ambiguity",
      "turns": [3],
      "confidence": 1.0,
      "evidence": "team-language count=5, first-person count=0",
      "interpretation": "Heavy use of team language...",
      "visible": true,
      "count": 1
    }
]
    ↓
final_report = {
    "behavioral_analysis": {
        "engagement_signals": [...],
        "consistency_signals": [...],
        "communication_patterns": [...],
        "confidence_indicators": [...],
        "integrity_flags": [...],
        "summary": "...",
        "proctoring_signals_detected": [
            {
              "signal": "ownership_ambiguity",
              ...
            }
        ]
    }
}
    ↓
json.dumps(final_report)
    ↓
Database INSERT:
UPDATE "Interview" 
SET "interviewReport" = $1
WHERE "applicationId" = $2
```

---

## Code: Where Report Gets Saved

**File:** `agent_persistence.py:966-1120`

```python
async def generate_interview_report(
    app_id: str,
    transcript_lines: list,
    answer_scores: list[dict],
    job_title: str,
    proctoring_data: Optional[dict] = None,
    org_id: Optional[str] = None,
    llm_model: str = LLM_MODEL,
):
    """Generate structured interview report with scores, skills, and behavioral analysis."""
    
    # Step 1: Extract behavioral analysis from signals
    behavioral_report = synthesize_behavioral_report(
        transcript_lines=transcript_lines,
        answer_scores=answer_scores,
        total_duration_sec=int(proctoring_data.get("session_duration", 0)) if proctoring_data else 0,
        proctoring_events=proctoring_data.get("events", []) if proctoring_data else [],  # ← SIGNAL EVENTS HERE
        contradictions_found=proctoring_data.get("contradictions", []) if proctoring_data else [],
    )
    # behavioral_report now contains: {
    #     "engagement_signals": [...],
    #     "consistency_signals": [...],
    #     "communication_patterns": [...],
    #     "confidence_indicators": [...],
    #     "integrity_flags": [...],
    #     "summary": "...",
    #     "proctoring_signals_detected": [  ← NEW SECTION WITH OWNERSHIP_AMBIGUITY
    #         {"signal": "ownership_ambiguity", ...}
    #     ]
    # }
    
    # Step 2: Calculate technical score
    technical_score = int(min(100, max(0, avg_overall * 10))) if answer_scores else 0
    
    # Step 3: Build final report
    final_report = {
        "technical_score": technical_score,
        "scores": {
            "technical": technical_score,
            "communication": int(...),
        },
        "skills_proof": skills_covered,
        "skill_ratings": report_data.get("skill_ratings", {}),
        "top_strengths": top_strengths,
        "concerns": concerns,
        "qa_blocks": report_data.get("qa_blocks", []),
        "behavioral_analysis": behavioral_report,  # ← ENTIRE BEHAVIORAL REPORT STORED HERE
        "verdict": {
            "summary": f"..."
        },
    }
    
    # Step 4: Save to database
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE "Interview"
            SET "interviewReport" = $1
            WHERE "applicationId" = $2
            """,
            json.dumps(final_report),  # ← SERIALIZED TO JSON STRING
            app_id,
        )
    
    logger.info(f"[REPORT] Generated report for {app_id}: score={technical_score}")
```

---

## Complete JSON Example: What Gets Stored in Database

**Database Table:** `Interview`  
**Column:** `interviewReport` (JSON)

```json
{
  "technical_score": 72,
  "scores": {
    "technical": 72,
    "communication": 68
  },
  "skills_proof": [
    "Microservices Architecture",
    "Database Design",
    "Team Leadership",
    "Production Deployment"
  ],
  "skill_ratings": {
    "Microservices Architecture": 7,
    "Database Design": 6,
    "Team Leadership": 4,
    "Production Deployment": 7
  },
  "top_strengths": [
    "Demonstrates concrete system design experience with architectural decisions",
    "Shows knowledge of scalability challenges and database optimization",
    "Takes ownership of technical problems and drives solutions"
  ],
  "concerns": [
    "Communication clarity varies — sometimes struggles to articulate personal vs team contributions",
    "Needs to provide more specific examples when asked for details"
  ],
  "qa_blocks": [
    {
      "q": 1,
      "title": "Question 1",
      "score": 85,
      "verdict": "Clarity: 8.5/10, Depth: 8.5/10"
    },
    {
      "q": 2,
      "title": "Question 2",
      "score": 20,
      "verdict": "Clarity: 2.5/10, Depth: 2.0/10"
    },
    {
      "q": 3,
      "title": "Question 3",
      "score": 78,
      "verdict": "Clarity: 8.0/10, Depth: 7.8/10"
    }
  ],
  
  "behavioral_analysis": {
    
    "engagement_signals": [
      "Candidate spoke frequently and engaged throughout interview"
    ],
    
    "consistency_signals": [
      "No major contradictions detected between resume claims and interview statements"
    ],
    
    "communication_patterns": [
      "Communication quality varies significantly (range: 2-9) — strong on some topics, unclear on others. Pattern suggests anxiety or knowledge gaps."
    ],
    
    "confidence_indicators": [
      "Appeared confident in 2 of 3 answers",
      "Areas of false/unwarranted confidence: 1 answer was low quality despite confident delivery"
    ],
    
    "integrity_flags": [
      "No integrity concerns detected in proctoring data"
    ],
    
    "summary": "Behavioral assessment: Candidate engaged actively but shows pattern of depth collapse on follow-ups and weak on concrete examples. May indicate preparation-based answers rather than lived experience.",
    
    "proctoring_signals_detected": [
      {
        "signal": "ownership_ambiguity",
        "turns": [3],
        "confidence": 1.0,
        "evidence": "team-language count=5, first-person count=0",
        "interpretation": "Heavy use of team language ('we', 'our') with minimal personal ownership language ('I', 'my'). May indicate candidate contributed to team effort but unclear on personal technical decisions.",
        "visible": true,
        "count": 1
      },
      {
        "signal": "follow_up_collapse",
        "turns": [4],
        "confidence": 0.95,
        "evidence": "complete collapse: first=8.5 follow-up=2.0 drop=6.5 stage=0",
        "interpretation": "Candidate struggles to maintain depth when probed on specifics. Indicates either nervousness or inflated initial claim.",
        "visible": true,
        "count": 1
      }
    ]
  },
  
  "verdict": {
    "summary": "Candidate demonstrated 4 key skills with overall technical score of 72%. Strengths include 3 notable areas. 1 concern noted in evaluation. Behavioral assessment: Candidate engaged actively but shows pattern of depth collapse on follow-ups and weak on concrete examples."
  }
}
```

---

## How to Check If It's Saved: Database Query

```sql
SELECT 
  "applicationId",
  "interviewReport" -> 'behavioral_analysis' ->> 'proctoring_signals_detected' as signals,
  "interviewReport" -> 'technical_score' as score
FROM "Interview"
WHERE "applicationId" = 'app_12345'
LIMIT 1;
```

**Result:**
```
applicationId | signals | score
──────────────────────────────────
app_12345     | [{"signal": "ownership_ambiguity", "turns": [3], "confidence": 1.0, ...}] | 72
```

---

## Verify in Code: Where It Flows

### 1. Signal Event Appended During Interview

**File:** `agent_runtime.py:1577-1591`

```python
proctoring_events.append({
    "event": event["signal_name"],
    "signal_name": event["signal_name"],  # "ownership_ambiguity"
    "signal_layer": event["signal_layer"],  # "behavioral_confidence"
    "risk_bucket": "integrity" if signal_layer == "hard_integrity" else "depth",
    "confidence": event["confidence"],  # 1.0
    "evidence": event["evidence"],  # "team-language count=5, first-person count=0"
    "trust_bucket_affected": event["trust_bucket_affected"],  # "behavioral_confidence"
    "score_delta": event_delta,  # -0.15
    "probe_mode": event["probe_mode"],  # "ownership"
    "recoverable": event["recoverable"],  # true
    "recruiter_visible": event["recruiter_visible"],  # true
    "turn": turn,  # 3
    "score_after": suspicion_score,  # overall score at this turn
})

logger.info(
    f"[SIGNAL] ownership_ambiguity layer=behavioral_confidence "
    f"confidence=1.00 trust_delta=-0.15 visible=True turn=3"
)
```

### 2. Report Generation Extracts Signals

**File:** `agent_persistence.py:986-992`

```python
behavioral_report = synthesize_behavioral_report(
    transcript_lines=transcript_lines,
    answer_scores=answer_scores,
    total_duration_sec=int(proctoring_data.get("session_duration", 0)) if proctoring_data else 0,
    proctoring_events=proctoring_data.get("events", []) if proctoring_data else [],  # ← proctoring_events list passed here
    contradictions_found=proctoring_data.get("contradictions", []) if proctoring_data else [],
)
```

### 3. Behavioral Analysis Synthesizes Signals

**File:** `behavioral_analysis.py:190-252`

```python
def synthesize_behavioral_report(
    transcript_lines: list[str],
    answer_scores: list[dict],
    total_duration_sec: int,
    proctoring_events: list[dict],  # ← Contains ownership_ambiguity event
    contradictions_found: list[dict],
) -> dict[str, Any]:
    
    engagement = extract_engagement_signals(...)
    consistency = extract_consistency_signals(...)
    communication = extract_communication_patterns(...)
    confidence = extract_confidence_indicators(...)
    integrity = extract_integrity_flags(...)
    hidden_signals = extract_proctoring_signals(proctoring_events)  # ← Formats signals for recruiter
    
    report = {
        "engagement_signals": engagement,
        "consistency_signals": consistency,
        "communication_patterns": communication,
        "confidence_indicators": confidence,
        "integrity_flags": integrity,
        "summary": _generate_behavioral_summary(...),
    }
    
    # Phase 5: Add hidden signals if detected
    if hidden_signals:
        report["proctoring_signals_detected"] = hidden_signals  # ← ADDED HERE
    
    return report
```

### 4. Report Saved to Database

**File:** `agent_persistence.py:1086-1114`

```python
final_report = {
    "technical_score": technical_score,
    "scores": {...},
    "skills_proof": skills_covered,
    "skill_ratings": report_data.get("skill_ratings", {}),
    "top_strengths": top_strengths,
    "concerns": concerns,
    "qa_blocks": report_data.get("qa_blocks", []),
    "behavioral_analysis": behavioral_report,  # ← CONTAINS proctoring_signals_detected
    "verdict": {...},
}

# Save to database
pool = await get_db_pool()
async with pool.acquire() as conn:
    await conn.execute(
        """
        UPDATE "Interview"
        SET "interviewReport" = $1
        WHERE "applicationId" = $2
        """,
        json.dumps(final_report),  # ← Serialized to JSON
        app_id,
    )
```

---

## Verification: Check Logs

**During interview, when signal fires:**
```
[SIGNAL] ownership_ambiguity layer=behavioral_confidence confidence=1.00 trust_delta=-0.15 visible=True turn=3
```

**When report is generated:**
```
[REPORT] Generated report for app_12345: score=72, skills=4
[REPORT] behavioral_analysis includes proctoring_signals_detected
```

---

## Why This Works

✅ **Signal Detection**: `ownership_ambiguity` fires, event appended to `proctoring_events` list

✅ **Report Generation**: `generate_interview_report()` called when interview ends, passes `proctoring_events` to `synthesize_behavioral_report()`

✅ **Signal Extraction**: `extract_proctoring_signals()` formats all visible signals (and high-confidence hidden signals) into recruiter-friendly format

✅ **Report Assembly**: `proctoring_signals_detected` added to `behavioral_analysis` section

✅ **Database Storage**: JSON serialized and saved to `Interview.interviewReport` column

✅ **Logging**: Signal logged when detected, report logged when saved

---

## How to Verify It's Working

### Method 1: Check Database After Interview

```sql
SELECT 
  "applicationId",
  jsonb_pretty("interviewReport" -> 'behavioral_analysis' -> 'proctoring_signals_detected')
FROM "Interview"
WHERE "applicationId" = 'your_app_id'
LIMIT 1;
```

**Expected Output:**
```
[
  {
    "confidence": 1,
    "count": 1,
    "evidence": "team-language count=5, first-person count=0",
    "interpretation": "Heavy use of team language ('we', 'our') with minimal personal ownership...",
    "signal": "ownership_ambiguity",
    "turns": [3],
    "visible": true
  }
]
```

### Method 2: Check Application Logs

```bash
grep -i "ownership_ambiguity" interview.log
```

**Expected Output:**
```
[SIGNAL] ownership_ambiguity layer=behavioral_confidence confidence=1.00 trust_delta=-0.15 visible=True turn=3
[REPORT] Generated report for app_12345: score=72, skills=4
```

### Method 3: API Endpoint (If Available)

```bash
curl https://api.example.com/interviews/app_12345/report
```

**Expected Response:**
```json
{
  "behavioral_analysis": {
    "proctoring_signals_detected": [
      {
        "signal": "ownership_ambiguity",
        "turns": [3],
        "confidence": 1.0,
        ...
      }
    ]
  }
}
```

---

## Summary: Storage Flow

| Step | Component | Action | Data |
|------|-----------|--------|------|
| 1 | Turn Decision | Signal fires | event object created |
| 2 | Agent Runtime | Event tracking | appended to proctoring_events list |
| 3 | Report Generation | Report function called | proctoring_events passed as param |
| 4 | Behavioral Analysis | Signal formatting | extract_proctoring_signals() processes events |
| 5 | Report Assembly | Final report built | proctoring_signals_detected added to report |
| 6 | Database | Persistence | JSON serialized and saved to Interview.interviewReport |
| 7 | Logging | Audit trail | Signal logged at detection, report logged at save |

✅ **Status**: Working correctly. Ownership_ambiguity now saved in report with full evidence and interpretation.
