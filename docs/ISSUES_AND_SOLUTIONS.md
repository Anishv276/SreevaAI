# Interview System Issues & Solutions

## Executive Summary
9 critical issues in interview flow, scoring, report generation, and transcript capture preventing accurate candidate evaluation. Root causes span TTS configuration, scoring pipeline, database schema gaps, and transcript handling.

---

## Issue 1: AI Spelling Words Letter-by-Letter ("qu" → Q-U)
**Severity**: HIGH (affects user experience)

### Root Cause
Cartesia TTS voice is configured for spelling mode (character-level utterance mode). When text contains abbreviated or standalone characters, TTS interprets them as spelling drills instead of natural speech.

### Where It Happens
- `agent_runtime.py`: TTS instantiation with Cartesia
- `agent_providers.py`: `build_cartesia_tts()` configuration
- Voice "Jacqueline" with default streaming settings

### Solution
1. Check Cartesia TTS model config in `build_cartesia_tts()`:
   - Disable character-level/spelling mode
   - Ensure `text_normalization=True` or equivalent
   - Set speaking rate to natural (1.0x)

2. Test with text containing:
   - Abbreviated words: "thru", "qt"
   - Acronyms: "API", "SQL"
   - Contractions: "you're", "I'm"

3. Verify TTS is NOT using:
   - Spelling dictionary
   - Character pronunciation rules
   - Letter-by-letter streaming mode

### Code Location
- `agent_providers.py`: lines ~140-180 (build_cartesia_tts function)
- Check: `streaming_config`, `voice_settings`, `model_params`

---

## Issue 2: Technical Score = 0% Despite 14 Questions Asked
**Severity**: CRITICAL (scoring broken)

### Root Cause
Interview report database schema is **empty**. The `aiReport` column in Application table is never populated after interview completion.

### Why It's Happening
1. Post-interview summary generation (`generate_interview_summary` in agent_persistence.py) only saves to `Interview.aiSummary`, NOT `Application.aiReport`
2. No pipeline exists to convert interview results → technical score
3. Technical score calculation code not found in codebase
4. Frontend tries to read `Application.aiReport` which is NULL → displays 0%

### Data Flow Gap
```
Interview completes
  ↓
generate_interview_summary() runs
  ↓
Saves to Interview.aiSummary (text narrative only)
  ↓
Application.aiReport stays NULL ❌
  ↓
Frontend reads NULL → 0%
```

### Solution
Create post-interview report generation pipeline:

1. **Add function** `generate_interview_report()` in agent_persistence.py:
   - Takes: transcript_lines, answer_scores (from score_answer_quality), job_title
   - Runs: LLM analysis to extract:
     - Technical score (0-100)
     - Skills covered (detected from Q&A)
     - Skill ratings (per skill)
     - Top strengths (3-5 items)
     - Behavioral signals
     - Question-by-question analysis with reasoning

2. **Call it** after `generate_interview_summary()` in agent_runtime.py line ~2453

3. **Save to** `Application.aiReport` (JSON) via update query

4. **Structure** JSON output:
   ```json
   {
     "technical_score": 45,
     "skills_covered": ["Operations", "CRM", "Data Analysis"],
     "skill_ratings": {
       "Operations": 6,
       "CRM": 5,
       "Data Analysis": 4
     },
     "top_strengths": ["detail-oriented", "systems thinking", "follow-up ability"],
     "behavioral_signals": [...],
     "question_analysis": [
       {
         "question_number": 1,
         "question": "...",
         "answer": "...",
         "reasoning": "...",
         "score": 7
       }
     ],
     "communication_score": 65
   }
   ```

### Code Location
- `agent_persistence.py`: Add new function after `generate_interview_summary()`
- `agent_runtime.py`: Line ~2453, call new function before DB update

---

## Issue 3: Skills Covered = 1, Skill Rating Card Showing Mock Data
**Severity**: HIGH (inaccurate metrics)

### Root Cause
1. Skills detection not wired to interview response content
2. Skill rating card reads from non-existent or unpopulated data fields
3. Database schema may lack `skillsCovered` field in Interview or Application

### Solution
1. **Detect skills** during interview based on:
   - JD requirements extraction (from job description)
   - Candidate answer mapping (which questions answered about which skills)
   - Skill evidence tracking (what examples prove skill coverage)

2. **Add to answer scoring** (`score_answer_quality` in agent_scoring.py):
   - When scoring each answer, identify which JD skills it addresses
   - Store skill tags with each score

3. **Aggregate** post-interview:
   - Count unique skills mentioned with non-zero evidence
   - Calculate skill rating = average score across questions addressing that skill

4. **Database**:
   - Verify `Interview.skillsCovered` field exists
   - Populate `Interview.skillRatings` (JSON map of skill → rating)

### Code Location
- `agent_scoring.py`: Modify `score_answer_quality()` to return `{"...", "skill_tags": ["skill1", "skill2"]}`
- `agent_persistence.py`: Aggregate skills in new report generation function
- Schema: Ensure Interview table has `skillsCovered` INT and `skillRatings` JSONB

---

## Issue 4: Top Strengths = 1 Item (Should Be 3-5)
**Severity**: MEDIUM (incomplete insights)

### Root Cause
Strengths extraction not implemented. Post-interview analysis only generates narrative summary, not structured signals.

### Solution
Add strengths extraction to report generation:

1. **Analyze transcript** for:
   - Specific examples given (shows "has_examples" strength)
   - Numerical data mentioned (shows "quantifies_results" strength)
   - Problem-solving approach described (shows "systems_thinking" strength)
   - Ownership clarity (shows "ownership_clarity" strength)
   - Learning from failure (shows "growth_mindset" strength)

2. **LLM prompt** (as part of report generation):
   - "Extract 3-5 genuine strengths from this transcript with specific evidence"
   - Return: `["strength1", "strength2", "strength3"]`

3. **Store** in `aiReport.top_strengths` array

### Code Location
- Add to new `generate_interview_report()` function
- Use existing `score_answer_quality()` signals as base (it already detects "has_numbers", "has_names", etc.)

---

## Issue 5: No Behavioral Signals Shown
**Severity**: CRITICAL (framework abandoned)

### Root Cause
Behavioral analysis framework exists in memory but is NOT implemented in report generation. Post-interview analysis skips this entirely.

### Why It Matters
HR cannot assess candidate integrity, consistency, communication patterns, or genuine vs. false confidence without behavioral analysis.

### Solution
Implement behavioral analysis module:

1. **Create** `behavioral_analysis_generator.py` (or add to agent_persistence.py):
   - Extract proctoring signals from Interview.proctoringReport
   - Analyze communication patterns from transcript
   - Detect consistency issues from contradiction_state
   - Grade confidence patterns

2. **Generate sections** per framework:
   - Engagement signals (questions asked, fatigue, participation)
   - Consistency signals (resume vs. answers)
   - Communication patterns (hedging, vague→specific progression)
   - Confidence indicators (genuine vs. false)
   - Integrity flags (proctoring correlations)
   - Strengths observed
   - Concerns noted
   - Overall summary

3. **Store** as `aiReport.behavioral_analysis`:
   ```json
   {
     "engagement_signals": ["...", "..."],
     "consistency_signals": ["...", "..."],
     "communication_patterns": ["...", "..."],
     "confidence_indicators": ["...", "..."],
     "integrity_flags": ["...", "..."],
     "strengths_observed": ["...", "..."],
     "concerns_noted": ["...", "..."],
     "overall_summary": "..."
   }
   ```

4. **Connect to** proctoring + scoring:
   - Pull tab_switch events from Interview.proctoringReport.events
   - Correlate with answer quality scores
   - Flag mismatches (e.g., high tab-switching during weak answers)

### Code Location
- Create: `behavioral_analysis.py`
- Call from: `agent_runtime.py` after interview ends, before report finalization
- Reference framework: `behavioral_analysis_framework.md` in memory

---

## Issue 6: Question Analysis Missing Reasoning & Score
**Severity**: HIGH (incomplete evaluation)

### Root Cause
Question-by-question analysis not generated. Transcript shows questions but no LLM reasoning about quality.

### Why It's Happening
1. `score_answer_quality()` runs per turn but results not aggregated per-question
2. No post-interview "question analysis" generation step
3. Frontend expects structured Q&A with scores but gets raw transcript

### Solution
1. **Collect scores** per question:
   - During interview: store each answer_score with question number
   - Track: clarity, depth, specificity, grounding, overall

2. **Generate analysis** post-interview:
   - For each question: LLM explains "why this answer is weak/strong"
   - Returns: question, answer, reasoning (2-3 sentences), score

3. **Aggregate** into report:
   ```json
   "question_analysis": [
     {
       "question_number": 1,
       "question": "How are you doing today?",
       "answer": "Right. Okay. Basically, we are doing the operation training...",
       "clarity_score": 3,
       "depth_score": 2,
       "specificity_score": 1,
       "grounding_score": 2,
       "overall_score": 2,
       "reasoning": "Answer was vague and mixed together multiple topics without focusing on the actual question asked. Candidate didn't provide a clear, direct response."
     }
   ]
   ```

### Code Location
- `agent_scoring.py`: Modify `score_answer_quality()` to persist scores to DB
- `agent_persistence.py`: Add function to generate per-question analysis and reasoning
- Database: Ensure answer scores are stored (not just logged)

---

## Issue 7: Poor Communication Rated 91% (Should Be Low)
**Severity**: CRITICAL (score completely inverted)

### Root Cause
Scoring logic is fundamentally broken or not wired to communication quality.

**Observations from transcript**:
- Candidate's speech is fragmented: "Right. Okay. Basically, we are doing..."
- Uses run-on sentences: "Because of a for example, today, got lot of complaints..."
- Grammar issues: "we allowed 10 to 12 complaints"
- No clear structure, hard to follow

Yet system reported 91%.

### Why It's Wrong
Either:
1. **Wrong metric being scored**: System scored "did they answer?" (yes=high) instead of "how well did they communicate?" (poorly)
2. **Scoring function not called**: Communication/clarity score not calculated
3. **Wrong data stored**: Final score pulled from wrong field

### Solution
1. **Verify communication scoring**:
   - Ensure `score_answer_quality()` is called for EVERY candidate response
   - Verify "clarity" score is calculated (0-10 scale)
   - Check that clarity score is NOT inflated for merely participating

2. **Recalculate communication score**:
   - Average clarity across all answers (not just count of answers)
   - Apply grammar/fluency penalties in LLM prompt

3. **Debug scoring logic**:
   - Add logging: "Scored answer Q{n}: clarity={c}, depth={d}, overall={o}"
   - Verify scores are stored to DB
   - Verify final 91% is NOT just "14 questions asked / 14 expected"

4. **Update prompt** in `score_answer_quality()`:
   - Explicitly penalize fragmented speech
   - Penalize lack of structure
   - Reward clarity, coherence, proper grammar

### Code Location
- `agent_scoring.py`: `score_answer_quality()` lines 40-60 (prompt)
- `agent_runtime.py`: Verify `score_answer_quality()` called after each candidate turn
- `agent_persistence.py`: Verify scores persisted to DB table (not just log)

---

## Issue 8: AI Asked Too Many Follow-Ups, Didn't Cover Skills/Resume
**Severity**: CRITICAL (interview strategy broken)

### Root Cause
Interview lacks:
1. **Coverage tracking**: No mapping of "which mandatory areas addressed?"
2. **Follow-up depth limit enforcement**: AI stuck on one topic instead of breadth
3. **Resume/skill-aware routing**: AI asked generic follow-ups instead of resume-specific questions

### Why It Happened
- System prompt has follow-up limit logic (`follow_up_depth`) but enforcement may be broken
- No agenda-based question selection (AI asks "what's next?" instead of "have we covered X?")
- Lack of mid-interview state injection to warn about stuck detection

### Solution
1. **Implement coverage tracking**:
   - Before interview: Extract mandatory topics from JD
   - During interview: After each answer, mark topic as [COVERED], [THIN], or [UNTOUCHED]
   - Every 3 assistant turns: Inject state summary showing coverage status

2. **Enforce follow-up limits**:
   - After 2 follow-ups on same topic: Force topic change
   - System prompt already has this; ensure it's wired correctly
   - Add logging: "[FOLLOW_UP_CHECK] Topic={T}, follow_ups={N}, action={MOVE_ON|PROBE}"

3. **Add resume routing**:
   - Before interview: Build personalized question agenda from resume + JD
   - Store mandatory topics as: [Operations], [CRM Systems], [Data Analysis], [Prioritization], etc.
   - Route questions to these topics explicitly, not generic follow-ups

4. **State injection timing**:
   - After every 3 assistant turns: Send coverage status to LLM via `generate_interview_state_summary()`
   - Include: "TOPIC STATUS: [Operations] COVERED, [CRM] THIN, [Data Analysis] UNTOUCHED"
   - AI uses this to decide next question

### Code Location
- `agent_runtime.py`: Lines ~1800-2000 (coverage tracking during turn loop)
- `agent_persistence.py`: `generate_interview_state_summary()` lines 966-1054 (state injection)
- `agent_profile_context.py`: `build_coverage_checklist()` - verify it's being called and used
- System prompt: Verify follow-up depth limits are enforced

---

## Issue 9: Transcript Showing Mostly AI Responses (Candidate Answers Missing)
**Severity**: CRITICAL (evaluation impossible)

### Root Cause
Transcript capture is broken or incomplete. Two possibilities:
1. **STT not capturing candidate audio** properly
2. **Transcript not distinguishing speaker** (both stored as "AI")

### Why It's Happening
Reviewing provided transcript:
```
AI: 00:00 "Hey Vamsi, welcome!..."
Candidate: PENDING 00:23 "Right. Okay. Basically, we are..."
AI: 00:46 "Sounds like you're juggling quite a bit..."
```

The "PENDING" status suggests STT result not captured or deferred. Only AI responses are in final transcript.

### Solution
1. **Verify STT pipeline**:
   - LiveKit STT (Deepgram) is receiving candidate audio
   - STT results are being returned (not timing out)
   - Results are being deduplicated and finalized

2. **Check transcript append logic**:
   - `append_transcript_line()` in agent_runtime_helpers.py should append BOTH speakers
   - Verify: AI turns AND candidate turns are added to `transcript_lines[]`
   - Logging: "[TRANSCRIPT] Added speaker={SPEAKER}, text={TEXT}"

3. **Database storage**:
   - Interview.interviewTranscript should contain full conversation
   - Not just AI turns, but [Speaker]: [Text] for both parties

4. **Debug checklist**:
   - [ ] STT completion event fired for candidate speech
   - [ ] Message content extracted from STT result (not empty)
   - [ ] Speaker label correctly set to "Candidate" (not "AI")
   - [ ] Transcript saved to DB with both speakers
   - [ ] No deduplication logic removing candidate lines

### Code Location
- `agent_runtime.py`: Turn handling loop (lines ~1200-1600)
  - Candidate message event: Verify STT result captured
  - AI response: Verify appended correctly
- `agent_runtime_helpers.py`: `append_transcript_line()` function
  - Verify both speakers accepted
- Database: Interview.interviewTranscript
  - Should show: "Candidate: ...", "AI: ..." alternating

### Debugging Steps
```python
# Add logging in agent_runtime.py when candidate speaks:
logger.info(f"[STT_RESULT] text='{text}' speaker=Candidate")

# Verify append:
append_transcript_line("Candidate", text)
logger.info(f"[TRANSCRIPT] Current length={len(transcript_lines)}")

# Before save:
logger.info(f"[SAVE] Full transcript:\n{json.dumps(transcript_lines, indent=2)}")
```

---

## Summary Table

| Issue | Root Cause | Severity | Fix Complexity | Impact |
|-------|-----------|----------|----------------|---------
| 1. Letter-by-letter speech | TTS spelling mode enabled | HIGH | Easy | UX broken |
| 2. Technical score = 0% | No report generation pipeline | CRITICAL | Medium | Scoring broken |
| 3. Skills = 1 item | No skill detection logic | HIGH | Medium | Metrics wrong |
| 4. Strengths = 1 item | No strengths extraction | MEDIUM | Easy | Insights incomplete |
| 5. No behavioral signals | Framework not implemented | CRITICAL | Hard | HR can't assess integrity |
| 6. No Q&A reasoning | Per-question analysis not generated | HIGH | Medium | Unclear why scores |
| 7. Communication = 91% | Scoring logic inverted/broken | CRITICAL | Hard | Grades completely wrong |
| 8. Too many follow-ups | Coverage tracking not enforced | CRITICAL | Hard | Interview quality poor |
| 9. Transcript incomplete | STT results not captured/stored | CRITICAL | Hard | Evaluation impossible |

---

## Implementation Priority

**Phase 1 (Critical - blocks evaluation)**:
- Issue 2: Technical score calculation
- Issue 5: Behavioral signals
- Issue 9: Transcript capture fix

**Phase 2 (High - fixes metrics)**:
- Issue 3: Skills detection
- Issue 6: Q&A reasoning
- Issue 7: Communication scoring

**Phase 3 (Medium - improves quality)**:
- Issue 1: TTS spelling mode
- Issue 4: Strengths extraction
- Issue 8: Follow-up enforcement
