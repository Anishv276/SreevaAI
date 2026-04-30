# 9 Interview System Issues - Quick Reference

## Issue 1: Letter-by-Letter Speech ("qu" → Q-U)
**Problem**: Cartesia TTS speaks letters individually instead of naturally.
**File**: `agent_providers.py` - `build_cartesia_tts()`
**Fix**: Disable spelling mode, enable text normalization
**Priority**: Low (UX only)

---

## Issue 2: Technical Score = 0%
**Problem**: `Application.aiReport` is NULL after interview completes.
**Root**: No post-interview report generation pipeline exists.
**Files**: 
- `agent_persistence.py` - Add `generate_interview_report()` function
- `agent_runtime.py` line 2453 - Call it after summary generation
**Fix**: Create report generation function that analyzes transcript & scores, saves to DB
**Priority**: CRITICAL (main evaluation metric)

---

## Issue 3: Skills Covered = 1 (Should Be 3-5)
**Problem**: Only 1 skill detected; rest are mock data.
**Root**: No skill detection wired to Q&A responses.
**Files**:
- `agent_scoring.py` - Add skill tags to answer scoring
- `agent_persistence.py` - Aggregate skills in report generation
- Database schema - Verify `Interview.skillsCovered` exists
**Fix**: During scoring, identify which JD skills each answer addresses
**Priority**: High (metrics accuracy)

---

## Issue 4: Top Strengths = 1 Item (Should Be 3-5)
**Problem**: Only one strength extracted.
**Root**: Strengths extraction not implemented.
**Files**: `agent_persistence.py` - Add to report generation
**Fix**: LLM analysis to extract specific strengths from transcript (examples, ownership, etc.)
**Priority**: Medium (incomplete insights)

---

## Issue 5: No Behavioral Signals
**Problem**: Framework exists but not implemented in report generation.
**Root**: `generate_interview_summary()` only makes narrative, skips behavioral analysis.
**Files**: 
- Create: `behavioral_analysis.py`
- Call from: `agent_runtime.py` line ~2453
- Reference: `behavioral_analysis_framework.md` (in memory)
**Fix**: Implement full behavioral analysis module (engagement, consistency, communication, confidence, integrity)
**Priority**: CRITICAL (HR can't assess integrity/authenticity without this)

---

## Issue 6: Question Analysis Missing Reasoning & Score
**Problem**: Questions shown but no score or explanation of why answer is weak/strong.
**Root**: Per-question analysis not generated post-interview.
**Files**: 
- `agent_scoring.py` - Persist answer scores to DB
- `agent_persistence.py` - Generate per-question analysis with LLM reasoning
**Fix**: For each Q&A pair, add reasoning (2-3 sentences) + score
**Priority**: High (evaluation clarity)

---

## Issue 7: Communication Score = 91% (Should Be Low)
**Problem**: Candidate had poor grammar/structure, got 91%.
**Root**: Scoring metric wrong - maybe counting "14 Q answered" as 100% instead of clarity quality.
**Files**:
- `agent_scoring.py` - `score_answer_quality()` prompt (lines 40-60)
- `agent_runtime.py` - Verify scoring called for every turn
- `agent_persistence.py` - Verify scores persisted to DB
**Fix**: 
1. Penalize fragmented speech, run-ons, poor grammar in LLM prompt
2. Average clarity across answers, don't just count participation
3. Add debug logging to trace score calculation
**Priority**: CRITICAL (scores completely inverted)

---

## Issue 8: Too Many Follow-Ups, Didn't Cover Skills
**Problem**: AI got stuck drilling one topic, didn't ask about resume/skills broadly.
**Root**: 
- Coverage tracking not enforced
- No mandatory topic agenda
- Follow-up limits not working
**Files**:
- `agent_runtime.py` - Add coverage tracking in turn loop
- `agent_persistence.py` - `generate_interview_state_summary()` - ensure state injection is working
- System prompt - Verify follow-up depth limits enforced
**Fix**:
1. Track which mandatory topics are covered
2. Inject state summary every 3 turns showing coverage status
3. Force topic switch after 2 follow-ups on same topic
**Priority**: CRITICAL (interview quality)

---

## Issue 9: Transcript Missing Candidate Answers
**Problem**: Transcript mostly shows AI responses, candidate answers marked "PENDING".
**Root**: STT results not captured/stored or transcript deduplication removing candidate lines.
**Files**:
- `agent_runtime.py` - Turn handling loop (lines ~1200-1600)
  - Check: Candidate message event handling
  - Check: STT result extraction
- `agent_runtime_helpers.py` - `append_transcript_line()` - verify both speakers accepted
- Database - Interview.interviewTranscript - verify both speakers stored
**Fix**:
1. Ensure STT results are returned (not timing out)
2. Verify both "AI" and "Candidate" speakers appended to transcript_lines
3. Add debug logging: "[STT_RESULT] text='{text}' speaker=Candidate"
4. Verify DB stores complete conversation with both speakers
**Priority**: CRITICAL (evaluation impossible without full transcript)

---

## Implementation Order

1. **Fix Transcript (Issue 9)** → Can't evaluate without it
2. **Generate Report (Issue 2)** → All scores depend on this
3. **Add Behavioral Signals (Issue 5)** → HR decision-making depends on this
4. **Fix Communication Scoring (Issue 7)** → Scores completely wrong
5. **Add Q&A Reasoning (Issue 6)** → Clarify why scores
6. **Fix Skill Detection (Issue 3)** → Metrics accuracy
7. **Enforce Coverage (Issue 8)** → Interview quality
8. **Add Strengths (Issue 4)** → Complete insights
9. **Fix TTS (Issue 1)** → UX polish

---

## Key Database Queries to Check

```sql
-- Verify Application.aiReport is NULL after interview
SELECT id, fullName, aiReport, aiScore FROM "Application" 
WHERE id = '{candidate_id}' LIMIT 1;

-- Check Interview.aiSummary was saved
SELECT id, applicationId, aiSummary, interviewTranscript 
FROM "Interview" 
WHERE applicationId = '{candidate_id}' LIMIT 1;

-- Check answer scores stored (if table exists)
SELECT question_number, score, clarity, depth, specificity
FROM interview_answer_scores 
WHERE application_id = '{candidate_id}';
```

---

## Caveman Summary

**Issue 1**: TTS spelling. Fix: disable spelling mode.
**Issue 2**: Report NULL. Fix: build report generation pipeline → save to aiReport.
**Issue 3**: Skills=1. Fix: detect skills from answers during scoring.
**Issue 4**: Strengths=1. Fix: LLM extract 3-5 from transcript.
**Issue 5**: No behaviors. Fix: implement behavior analysis module.
**Issue 6**: No reasoning. Fix: generate per-Q analysis post-interview.
**Issue 7**: Score 91% wrong. Fix: score clarity, not participation; penalize bad grammar.
**Issue 8**: Stuck follow-ups. Fix: track coverage, inject state summary, enforce limits.
**Issue 9**: Transcript broken. Fix: ensure STT captured, both speakers appended, DB saves full conversation.

All rooted in: **missing post-interview analysis pipeline** (Issue 2) + **incomplete transcript capture** (Issue 9) + **broken scoring/enforcement logic** (Issues 7-8).
