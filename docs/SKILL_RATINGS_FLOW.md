# SKILL RATINGS - COMPLETE FLOW

## Overview

After each interview completes, skill ratings are calculated and saved to the `interviewReport.skillRatings` section of the database. Each skill/topic covered gets:
- **Score** (0-10): Average quality across all answers on that topic
- **Percentage** (0-100%): Normalized score (score/10 * 100)
- **Coverage**: How many questions asked on this topic
- **Saturation**: How saturated the topic became before moving on

---

## Data Flow

### 1. Quality Records Created (eval_pipeline.py)

Each turn, a quality_record is created with topic information:

```python
quality_record = {
    "turn": 2,
    "question": "Tell me about a project you're really proud of?",
    "answer": "I built a microservices platform...",
    "clarity": 7.0,
    "depth": 6.5,
    "specificity": 7.5,
    "grounding": 7.0,
    "overall": 7.0,
    "fluency": 6.5,
    "confidence": 7.2,
    "signals": ["ownership_clarified"],
    "concerns": [],
    "topic": "Cloud Infrastructure",  ← NEW: Topic info
    "topic_saturation_score": 7.3,
    "topic_saturation_threshold": 6.5,
}
```

### 2. Scores Persisted (agent_runtime.py)

After each eval turn, quality_record is:
- Appended to `answer_scores` list in memory
- Persisted to DB via `persist_answer_scores()` (already working)

### 3. Skill Ratings Calculated (agent_runtime.py, at interview end)

When interview ends, `_persist_skill_ratings_async()` runs:

```python
# Group answer_scores by topic
skill_ratings_by_topic = {
    "Cloud Infrastructure": [<score1>, <score2>],
    "Team Leadership": [<score3>],
    "Database Design": [<score4>, <score5>],
    "API Development": [<score6>, <score7>],
}

# Calculate aggregate metrics for each topic
skill_ratings = {
    "Cloud Infrastructure": {
        "score": 6.9,        # avg overall
        "percentage": 69,    # (6.9/10 * 100)
        "clarity": 7.0,      # avg clarity
        "depth": 6.8,        # avg depth
        "answer_count": 2,   # 2 questions asked
        "saturation_score": 14.3,  # final saturation
        "saturation_threshold": 6.5,
        "saturation_percentage": 220,  # (14.3/6.5 * 100)
        "quality_records": [
            {"turn": 2, "question": "...", "overall": 7.0, "signals": [...]},
            {"turn": 3, "question": "...", "overall": 6.8, "signals": [...]},
        ]
    },
    ...
}
```

### 4. Skill Ratings Persisted (agent_persistence.py)

Async function `persist_skill_ratings()`:
- Reads current `interviewReport` from DB
- Merges `skillRatings` section
- Updates Interview.interviewReport with the new data
- Logs summary

```sql
UPDATE "Interview"
SET "interviewReport" = {
    ...existing report data...,
    "skillRatings": {
        "Cloud Infrastructure": {...},
        "Team Leadership": {...},
        ...
    }
}
WHERE "applicationId" = $1
```

---

## Database Schema

### Interview.interviewReport (JSON)

```json
{
  "skillRatings": {
    "Cloud Infrastructure": {
      "score": 6.9,
      "percentage": 69,
      "clarity": 7.0,
      "depth": 6.8,
      "max_score": 10.0,
      "max_percentage": 100,
      "answered": true,
      "answer_count": 2,
      "saturation_score": 14.3,
      "saturation_threshold": 6.5,
      "saturation_percentage": 220,
      "quality_records": [
        {
          "turn": 2,
          "question": "Tell me about a project you're proud of?",
          "overall": 7.0,
          "clarity": 7.0,
          "depth": 6.5,
          "signals": ["ownership_clarified"]
        },
        {
          "turn": 3,
          "question": "What specific challenges did you face?",
          "overall": 6.8,
          "clarity": 7.0,
          "depth": 7.0,
          "signals": []
        }
      ]
    },
    "Team Leadership": {
      "score": 7.5,
      "percentage": 75,
      ...
    },
    ...
  },
  "otherSections": {...}
}
```

---

## Example: Complete Interview Report Section

```json
{
  "skillRatings": {
    "Cloud Infrastructure": {
      "score": 6.9,
      "percentage": 69,
      "clarity": 7.0,
      "depth": 6.8,
      "max_score": 10.0,
      "max_percentage": 100,
      "answered": true,
      "answer_count": 2,
      "saturation_score": 14.3,
      "saturation_threshold": 6.5,
      "saturation_percentage": 220,
      "quality_records": [
        {
          "turn": 2,
          "question": "Tell me about a project you're proud of?",
          "overall": 7.0,
          "clarity": 7.0,
          "depth": 6.5,
          "signals": ["ownership_clarified"]
        },
        {
          "turn": 3,
          "question": "What specific challenges did you face?",
          "overall": 6.8,
          "clarity": 7.0,
          "depth": 7.0,
          "signals": []
        }
      ]
    },
    "Team Leadership": {
      "score": 7.5,
      "percentage": 75,
      "clarity": 7.5,
      "depth": 7.0,
      "max_score": 10.0,
      "max_percentage": 100,
      "answered": true,
      "answer_count": 1,
      "saturation_score": 7.5,
      "saturation_threshold": 6.5,
      "saturation_percentage": 115,
      "quality_records": [
        {
          "turn": 4,
          "question": "Tell me about a time you led a team through a technical challenge?",
          "overall": 7.5,
          "clarity": 7.5,
          "depth": 7.0,
          "signals": ["ownership_clarified"]
        }
      ]
    },
    "Database Design": {
      "score": 7.1,
      "percentage": 71,
      "clarity": 7.5,
      "depth": 7.0,
      "max_score": 10.0,
      "max_percentage": 100,
      "answered": true,
      "answer_count": 1,
      "saturation_score": 8.0,
      "saturation_threshold": 5.0,
      "saturation_percentage": 160,
      "quality_records": [
        {
          "turn": 5,
          "question": "What's the most complex data modeling challenge you've tackled?",
          "overall": 7.1,
          "clarity": 7.5,
          "depth": 7.0,
          "signals": []
        }
      ]
    },
    "API Development": {
      "score": 4.5,
      "percentage": 45,
      "clarity": 5.0,
      "depth": 4.0,
      "max_score": 10.0,
      "max_percentage": 100,
      "answered": true,
      "answer_count": 2,
      "saturation_score": 9.4,
      "saturation_threshold": 5.0,
      "saturation_percentage": 188,
      "quality_records": [
        {
          "turn": 6,
          "question": "What's your approach to API versioning?",
          "overall": 2.5,
          "clarity": 3.5,
          "depth": 2.0,
          "signals": ["ownership_ambiguity"]
        },
        {
          "turn": 7,
          "question": "Can you walk me through a specific API you designed?",
          "overall": 6.5,
          "clarity": 6.5,
          "depth": 6.0,
          "signals": []
        }
      ]
    }
  }
}
```

---

## Logs at Interview End

```
[SKILL_RATINGS] Persisted ratings for 4 skills (avg_score=6.5, avg_pct=65%)

[SKILL_RATINGS] Cloud Infrastructure: score=6.9 (69%), 2 answers, saturation=220%
[SKILL_RATINGS] Team Leadership: score=7.5 (75%), 1 answer, saturation=115%
[SKILL_RATINGS] Database Design: score=7.1 (71%), 1 answer, saturation=160%
[SKILL_RATINGS] API Development: score=4.5 (45%), 2 answers, saturation=188% (weak area)
```

---

## Frontend Integration

The report section `interviewReport.skillRatings` can now be displayed as:

### Skill Analysis Report

| Skill | Score | % | Coverage | Saturation | Status |
|-------|-------|---|----------|------------|--------|
| Cloud Infrastructure | 6.9/10 | 69% | 2 Qs | 220% | ✅ Strong |
| Team Leadership | 7.5/10 | 75% | 1 Q | 115% | ✅ Strong |
| Database Design | 7.1/10 | 71% | 1 Q | 160% | ✅ Adequate |
| API Development | 4.5/10 | 45% | 2 Qs | 188% | ⚠️ Weak |

**Overall Score:** 6.5/10 (65%)

### Skill Details (Expandable)

**API Development (Weak Area)**
- Question 1 (Turn 6): "What's your approach to API versioning?"
  - Score: 2.5/10 (25%) - Very Weak
  - Signals: ownership_ambiguity
- Question 2 (Turn 7): "Can you walk me through a specific API you designed?"
  - Score: 6.5/10 (65%) - Good (after clarification)
  - Signals: None (improved)

---

## Async Execution

The skill ratings calculation is **fully async**:

```python
spawn_background_task(_persist_skill_ratings_async(), "final_skill_ratings")
# Returns immediately, does NOT block interview finalization
```

**Timeline:**
```
Interview ends
  ↓
Persist transcript (async) ← finishes ~1-2s later
  ↓
Persist answer_scores (async) ← finishes ~1-2s later
  ↓
Calculate + persist skill_ratings (async) ← finishes ~2-3s later
  ↓
(All in parallel, no blocking)
```

---

## Data Quality

### What's Included
- ✅ All topics covered (saturated)
- ✅ Score by topic (overall, clarity, depth)
- ✅ Coverage (# of questions per topic)
- ✅ Saturation metrics (score, threshold, percentage)
- ✅ Individual quality records with signals
- ✅ Turn number tracking

### What's Excluded (Noise Removed)
- ❌ Clarification turns (REPHRASE action, no eval)
- ❌ Connection check turns (flagged separately)
- ❌ Greeting turns (not evaluated)
- ❌ Warmup turns (before interview starts)

---

## Testing Checklist

- [ ] Run complete interview (10 min, 4+ topics)
- [ ] Check agent logs for `[SKILL_RATINGS]` messages
- [ ] Query DB: `SELECT "interviewReport" FROM "Interview" WHERE "applicationId" = $1`
- [ ] Verify `skillRatings` section exists with all topics
- [ ] Verify scores are between 0-10
- [ ] Verify percentages are between 0-100
- [ ] Verify saturation_percentage can exceed 100 (showing over-saturation)
- [ ] Verify quality_records contain all turns on that topic
- [ ] Verify async completion didn't block finalization

---

## Summary

✅ **Skill ratings now automatically calculated and saved**
✅ **Per-topic breakdown with score and percentage**
✅ **Saturation metrics included**
✅ **Quality records with turn tracking**
✅ **Fully async, non-blocking**
✅ **Ready for frontend display**
