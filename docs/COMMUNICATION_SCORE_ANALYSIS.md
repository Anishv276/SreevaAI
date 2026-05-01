# Communication Score Card - Analysis & Fix Plan

## Current Status: ⚠️ PARTIALLY CORRECT BUT NEEDS LIVE INTERVIEW ANALYSIS

The card displays, but the scoring is:
- ❌ Partially from AI report (not live transcript)
- ❌ Uses word count as proxy (not actual analysis)
- ❌ Falls back to generic estimates when no report data

---

## Current Data Sources

### Where Communication Data Comes From

```
candidate.interview.interviewReport
    ↓
interviewReportData.communication = {
  pronunciation: (number or undefined),
  clarity: (number or undefined),
  grammar: (number or undefined),
  vocabulary: (number or undefined),
  depth: (number or undefined),
  filler: (number or undefined),
  fluency: (number or undefined)
}
    ↓
interviewReportCommunication passed to model builder
```

### Current Calculation (Lines 432-439)

```javascript
const comm = {
  pronunciation: toPct(
    com.pronunciation ?? com.clarity,                    // AI report data OR
    55 + Math.min(30, i.wordCount / 40)                 // FALLBACK: word count estimate
  ),
  grammar: toPct(
    com.grammar,                                         // AI report data OR
    50 + Math.min(40, i.wordCount / 35)                 // FALLBACK: word count estimate
  ),
  vocabulary: toPct(
    com.vocabulary ?? com.depth,                         // AI report data OR
    52 + Math.min(30, i.wordCount / 45)                 // FALLBACK: word count estimate
  ),
  minimalFiller: toPct(
    com.filler ?? com.minimal_filler,                    // AI report data OR
    60                                                   // FALLBACK: fixed 60%
  ),
  fluency: toPct(
    com.fluency,                                         // AI report data OR
    48 + Math.min(35, i.wordCount / 30)                 // FALLBACK: word count estimate
  ),
  tag: String(scores.cefr_label || i.communicationStatus) // AI tag
};
```

### Problems

1. **Relies on AI Report**: If `interviewReport.communication` is missing or empty, falls back to **word count estimates**
2. **Word Count ≠ Communication Quality**: More words doesn't mean better grammar or clarity
3. **No Transcript Analysis**: Doesn't actually read the interview transcript
4. **Generic Fallbacks**: Uses fixed percentages or word-count math instead of actual evaluation

---

## What Should Happen (Correct Approach)

### Step 1: Extract Live Interview Data
```javascript
const interviewTranscript = candidate.interview.interviewTranscript
const interviewTurns = candidate.interview.interviewTurns
```

### Step 2: Analyze Candidate's Speech (From Transcript)
For each candidate answer in `interviewTurns`:
- Extract the actual text they spoke
- Analyze:
  - **Grammar**: Sentences well-formed? Subject-verb agreement? Tense consistency?
  - **Fluency**: Smooth flow? Hesitations? Filler words (um, uh, like) as percentage?
  - **Clarity**: Ideas clearly expressed? Easy to understand?
  - **Vocabulary**: Appropriate word choices? Can they explain concepts?
  - **Confidence**: Assertive tone? Or uncertain/vague?

### Step 3: Calculate from Actual Speech
```python
def analyze_communication_from_transcript(turns):
    """
    Analyze candidate's actual spoken words.
    Not from AI report assumptions.
    """
    candidate_responses = [turn.answer for turn in turns if turn.answer]
    
    # Analyze each metric from actual text
    grammar_score = evaluate_grammar(candidate_responses)      # 0-100
    fluency_score = evaluate_fluency(candidate_responses)      # 0-100
    clarity_score = evaluate_clarity(candidate_responses)      # 0-100
    vocabulary_score = evaluate_vocabulary(candidate_responses) # 0-100
    confidence_score = evaluate_confidence(candidate_responses) # 0-100
    
    # Average or weighted score
    overall_score = average([grammar, fluency, clarity, vocabulary, confidence])
    
    return {
        'grammar': grammar_score,
        'fluency': fluency_score,
        'clarity': clarity_score,
        'vocabulary': vocabulary_score,
        'confidence': confidence_score,
        'overall': overall_score
    }
```

### Step 4: Be Fair to Human Speech
Remember:
- ❌ Don't penalize: "um", "like", natural pauses, repeated words (thinking)
- ✅ Do evaluate: Clear meaning, understandable sentences, idea expression
- ✅ Score as: "Good enough for role" vs. "Needs work"

---

## Where to Implement

### Option A: Backend (During Report Generation)
**File**: `agent_runtime.py` or `agent_scoring.py`  
**When**: After interview ends, during report generation  
**Advantage**: Analyzes transcript once, stores result

```python
# In agent_scoring.py or new function
def score_communication(interview_transcript: str, interview_turns: list) -> dict:
    """Score communication from actual interview transcript."""
    # Implementation using NLP or rule-based analysis
    return {
        'pronunciation': ...,
        'grammar': ...,
        'fluency': ...,
        'clarity': ...,
        'vocabulary': ...,
        'confidence': ...,
        'overall': ...
    }

# Store in Interview record as interviewReport.communication
```

### Option B: Frontend (Simple Rule-Based)
**File**: `buildHyringInterviewViewModel()` in `interview-report-hyring.tsx`  
**When**: When building view model  
**Advantage**: No backend changes needed

```javascript
function analyzeCommnicationFromTranscript(interviewTurns, interviewTranscript) {
  const candidateText = interviewTurns
    .map(t => t.answer)
    .filter(Boolean)
    .join(' ');
  
  // Count metrics from text
  const sentences = candidateText.split(/[.!?]+/).filter(Boolean);
  const words = candidateText.split(/\s+/).length;
  const fillerWords = (candidateText.match(/\b(um|uh|like|you know|basically|actually)\b/gi) || []).length;
  
  // Scoring (0-100)
  const clarity = sentences.length > 0 ? Math.min(100, (words / sentences) * 10) : 50;
  const fillerRatio = words > 0 ? (fillerWords / words) * 100 : 0;
  const fluency = Math.max(0, 100 - fillerRatio * 2); // Penalize 2% per filler %
  
  // ... more analysis
  
  return {
    pronunciation: 75, // Based on STT confidence or manual check
    grammar: 72,       // Based on sentence structure
    fluency: 68,       // Based on pauses/fillers
    clarity: 80,       // Based on vocabulary complexity
    vocabulary: 65     // Based on word diversity
  };
}
```

---

## Current Card Display

The card currently shows:
```
Communication score     [LIMITED/AVERAGE/STRONG]
        52%
        
Clarity:     56
Grammar:     53
Fluency:     52
Vocabulary:  47 (labeled "Depth")

Average 52/100
Strongest: Clarity · Needs work: Depth
```

### What's Good
✅ Visual layout (donut chart)  
✅ Multiple dimensions (5 metrics)  
✅ Summary (strongest/needs work)  

### What Needs Fixing
❌ Data sources (should be from live transcript, not AI report)  
❌ Fallback math (word count estimates are inaccurate)  
❌ No actual speech analysis (doesn't read what candidate actually said)  

---

## Metrics to Score

### 1. **Clarity**
- Are ideas expressed clearly?
- Can listener easily understand?
- ✅ Good: "I would design the API with REST principles, using HTTP methods for CRUD operations"
- ❌ Weak: "It's like, you know, kind of a thing where you do stuff with the API"

### 2. **Grammar**
- Proper sentence structure?
- Subject-verb agreement?
- Consistent tense?
- ✅ Good: "I implemented caching using Redis" (complete, tense consistent)
- ❌ Weak: "I was implementing and done caching" (mixed tense, awkward)

### 3. **Fluency**
- Smooth speech flow?
- How many pauses/filler words?
- ✅ Good: Clear, few hesitations, natural pacing
- ❌ Weak: Lots of "um", "like", long pauses between words

### 4. **Vocabulary**
- Appropriate word choices?
- Can they use technical terms correctly?
- ✅ Good: "I optimized query performance by adding indexes on frequently-filtered columns"
- ❌ Weak: "I made the database thingy faster by doing stuff"

### 5. **Confidence**
- Speaks with certainty?
- Or qualifying everything? ("I think maybe possibly...")
- ✅ Good: "I solved it by...", "The approach was..."
- ❌ Weak: "Um, maybe I, like, kind of could have...?"

---

## Fair Scoring Rules

🟢 **DO Count as Good**:
- Natural pauses while thinking
- "Um" and "uh" (< 10% of speech)
- Contractions ("I'm", "don't")
- Natural filler ("you know", "basically") if not excessive
- Self-correction ("I mean, actually...")
- Hesitation that shows thinking

🔴 **DO Penalize**:
- Grammatically broken sentences
- Unclear meaning (listener confused)
- Excessive fillers (20%+ of speech)
- Cannot explain concepts
- Mumbling/incoherent speech
- Inability to answer because "communication issue"

⚪ **NEUTRAL**:
- Accent (as long as understandable)
- Speaking speed (fast or slow, if clear)
- Formal vs. casual (depends on role)
- Non-native English (evaluate clarity, not accent)

---

## Implementation Priority

**MEDIUM** — Currently working with AI report data (if available)  
**FIX NEEDED** — Should analyze actual transcript if report data missing  

If `interviewReport.communication` exists and has values → Use them (they're from live interview)  
If missing → Analyze transcript instead of using word-count estimates  

---

## Success Criteria

✅ Communication score reflects **actual spoken words**, not assumptions  
✅ Doesn't penalize natural human speech patterns  
✅ Scores practical clarity for role, not perfection  
✅ Metrics (grammar, fluency, clarity, vocabulary, confidence) derived from **transcript analysis**  
✅ Card shows: Score %, breakdown by metric, summary  

---

## Status: NEEDS INVESTIGATION

The system **should already have** communication scores in `interviewReport.communication` if the AI report was generated properly.

**Question**: Is `candidate.interview.interviewReport.communication` being populated during interview analysis?

If YES → Card is correct, just needs to ensure data is from transcript analysis  
If NO → Need to implement transcript analysis in agent_scoring or backend
