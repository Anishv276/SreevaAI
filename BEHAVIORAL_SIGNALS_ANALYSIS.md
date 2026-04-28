# Behavioral & Intelligence Signals Analysis Framework

## Phase 1: Signal Inventory

### A. PROCTORING SIGNALS (Physical/Environmental)
From `proctoringEvents` captured during interview:

**Tab/Window Switching**
- Multiple tab switches during interview
- Indicator: Candidate checking external resources, distraction, dishonesty
- Severity: Medium (breaks concentration), High if during critical questions

**Face Detection Issues**
- Face not detected, multiple detections, sudden loss
- Indicator: Not paying attention, leaving seat, masking identity
- Severity: High (integrity concern)

**Gaze/Eye Movement Issues**
- Looking away from camera for extended periods
- Indicator: Checking notes, reading, not engaged
- Severity: Medium-Low (natural for thinking, but pattern matters)

**Screen Share/Recording Alerts**
- Unauthorized screen sharing detected
- Indicator: Potential cheating, displaying unauthorized content
- Severity: High

**Audio Issues**
- Mic muted unexpectedly, audio dropout
- Indicator: Technical problem or intentional muting
- Severity: Medium

**Environmental Issues**
- High noise detected, multiple people in background
- Indicator: Unprepared, distracted environment
- Severity: Low-Medium

---

### B. INTELLIGENCE SIGNALS (Content/Performance)

**Technical Depth** (from qa_blocks scores)
- Score < 4/10: Weak
- Score 4-6/10: Average  
- Score 7-8/10: Strong
- Score 9-10/10: Excellent

**Communication Quality** (from communication_insights)
- Clarity (0-100): How well ideas expressed
- Grammar (0-100): Sentence structure quality
- Fluency (0-100): Speech smoothness, fillers
- Confidence (0-100): Assertiveness vs. hedging

**Cognitive Performance** (from cognitive_insights)
- Clarity: Articulation of ideas
- Depth of Knowledge: Technical understanding
- Problem Solving: Approach quality
- Logical Thinking: Reasoning structure

**Follow-up Engagement** (from transcript analysis)
- How many times was candidate probed on same topic?
- Did they answer better with follow-up or worse?
- Did they give up or keep trying?

**Resume Alignment** (from answers vs. resume/JD)
- Claims match interview answers? YES/NO
- Exaggeration detected? YES/NO
- Experience level consistent? YES/NO
- Skills proven? YES/NO/PARTIAL

---

## Phase 2: Analysis Pattern

### For each Q&A Block:
1. **What was asked**: Question topic
2. **How they answered**: First response quality
3. **Were they probed?**: Yes/No, how many times
4. **How did they respond to probing?**: 
   - Got better (showed thinking)
   - Got same (stuck on first answer)
   - Got worse (contradicted themselves)
   - Avoided specifics (evasive)
5. **Resume claim involved?**: 
   - YES: Does interview validate claim?
   - NO: Does answer show required skill level?

### Example Analysis:
```
Q: "Tell me about your React experience"
A1: "I've built several React apps"
Probe 1: "Can you describe a specific project?"
A2: "Um... it was a dashboard with components"
Probe 2: "What about state management?"
A3: [Long pause] "We used... Redux, I think"

Signals Detected:
- Lack of depth: Vague first answer
- Weak under pressure: Follow-ups revealed gaps
- Uncertain about fundamentals: "I think" hedge on basic topic
- Resume claim unproven: Claims React expert, but basic Q answered poorly
```

---

## Phase 3: Signal Synthesis Rules

### Rule 1: PATTERN DETECTION
If SAME topic follows pattern X multiple times → Synthesize into one observation

**Bad synthesis**: "Question 1 - weak on React. Question 3 - weak on Node."
**Good synthesis**: "When asked about backend fundamentals, gave vague answers despite claiming 3 years Node experience."

### Rule 2: RESUME-ANSWER VALIDATION
Compare resume claim → interview answer → proctoring signals

**Bad**: "Resume says 5 years React, scored 6/10"
**Good**: "Claims 5 years React, but struggled on basic state management questions. High tab-switching during React questions suggests note-checking."

### Rule 3: BEHAVIOR OVER TIME
Track if performance improved, declined, or stayed flat

**Bad**: "First answer: 5/10. Probed. Second answer: 6/10"
**Good**: "Showed signs of thinking when probed - initial answer was too quick, second response showed actual understanding. Indicates genuine knowledge but needs prompting to articulate fully."

### Rule 4: PROCTORING + CONTENT CORRELATION
Match physical signals with answer quality

**Bad**: "Tab switched 3 times. Score was 5/10"
**Good**: "Switched tabs 3 times during technical questions despite claiming expert level - pattern suggests checking notes rather than recalling knowledge."

### Rule 5: CONFIDENCE INDICATORS
Look for hedging, corrections, backtracking

**Bad**: "Used 'um' 15 times"
**Good**: "Started confidently ('Here's how I would...'), but when pressed on implementation details, became uncertain ('maybe', 'I think'). Indicates pattern of surface-level confidence masking knowledge gaps."

---

## Phase 4: Bullet Point Generation

### Template for Each Observation:

```
[What] + [When] + [Why It Matters]

Examples:

1. "When asked about their claimed AWS expertise, gave surface-level answers. When probed on specific services, hesitated and changed answers. Suggests resume claim may be overstated."

2. "Gave polished first response on system design, but failed to defend design choices when challenged. Pattern suggests memorized answer rather than genuine understanding."

3. "Switched to other browser tabs 7 times during technical questions, despite claiming senior-level experience. Indicates likely checking notes rather than recalling knowledge."

4. "Consistently gave vague answers (e.g., 'I used Redux', 'We did it with API calls'), but when asked for specific examples, had difficulty providing them. Raises questions about hands-on experience."

5. "Made contradictory statements: First said 'I led the backend architecture', later said 'Our architect made those decisions'. Inconsistency suggests exaggerated role."

6. "Asked clarifying questions on basic concepts that match their claimed 5+ years experience. Either resume is inflated or knowledge base has gaps."

7. "Showed genuine engagement and thinking on debugging questions, provided specific examples with reasoning. This area appears to be genuine strength."

8. "Demonstrated deeper knowledge when probed - initial answer was too quick but follow-up showed systematic thinking. Indicates capability to think through problems once prompted."

9. "Avoided giving specific examples 4 times when asked directly. Evasion pattern particularly pronounced on topics listed as specialties on resume."

10. "Communication quality dropped significantly in final 20 minutes - went from clear explanations to one-word answers. Fatigue or disengagement?"
```

---

## Phase 5: HR-Ready Output Format

### DO NOT SEND TO HR:
- "Score: 6/10"
- "Tab switch: 5"
- "Communication: Average"

### DO SEND TO HR:
```
ENGAGEMENT SIGNALS:
• Candidate remained focused throughout first 45 minutes, then showed signs of fatigue in final phase
• Actively asked 3 clarifying questions - indicates genuine interest in understanding role requirements
• One bathroom break (30s) at minute 22 - no red flags

CONSISTENCY SIGNALS:
• Resume claims "5+ years React" but struggled to explain hooks pattern without guidance
• Claims to have "led backend architecture" but later attributed key decisions to team architect
• Technical depth improved significantly when given concrete scenario vs. abstract questions

COMMUNICATION PATTERNS:
• First answers were often vague ("I've done this before"), became specific only after probing
• Heavy use of hedging language ("maybe", "I think", "probably") on topics claimed as specialties
• Clear, confident explanations when discussing debugging and real-world problems

CONFIDENCE INDICATORS:
• Started strong but became uncertain when asked to defend design choices
• Hesitated on fundamental concepts (state management libraries) despite senior-level claim
• Showed genuine confidence and step-by-step thinking on practical debugging scenarios

INTEGRITY FLAGS:
• Tab-switching pattern during technical questions - checked notes 7 times
• No other red flags detected during interview - environment was clean, face detection consistent

BEHAVIORAL STRENGTHS:
• Demonstrated genuine problem-solving thinking when given debugging scenarios
• Acknowledged gaps ("I don't remember that specific syntax") rather than guessing
• Recovery pattern: After initial weak answer, second response showed better articulation

BEHAVIORAL CONCERNS:
• Tendency to overstate experience level relative to demonstrated knowledge
• Avoids providing specific examples despite multiple direct requests
• Possible note-checking during technical assessment - undermines claimed expertise level
```

---

## Implementation in AI Report

The GPT-4o analysis should produce:
1. **Engagement Signals**: What they did/didn't do during interview
2. **Consistency Signals**: Resume claims vs. interview answers (specific mismatches)
3. **Communication Patterns**: How they spoke (structure, clarity, hedging)
4. **Confidence Indicators**: What showed real confidence vs. surface confidence
5. **Integrity Flags**: Proctoring signals + behavioral red flags
6. **Strengths Observed**: Areas of genuine capability
7. **Concerns Noted**: Areas of concern

Each point must:
- Be specific with examples
- Explain what happened (not just what was detected)
- Connect behavior to hiring relevance
- Avoid jargon ("tab-switch" → "checked notes" or "distracted by external resources")

---

## Critical Success Factors

✅ **Use interview evidence**: "When asked X, answered Y, when probed with Z..."
✅ **Compare against resume**: "Claims X, but interview showed..."
✅ **Pattern detection**: "Repeated pattern of..."
✅ **HR context**: "This matters for hiring because..."
✅ **Specific, not generic**: Not "communication ok" but "clear articulation of problems, vague on solutions"

❌ **AVOID**: Generic observations, jargon, isolated incidents treated as patterns
❌ **AVOID**: Scoring language ("6/10") in narrative
❌ **AVOID**: Assumptions without evidence ("probably didn't study")
