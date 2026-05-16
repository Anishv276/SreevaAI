# Technical Score Card - Complete Analysis & Fix Required

## Current Status: ⚠️ INCOMPLETE

The Technical Score card displays, but the data sources are **insufficient** for what HR needs.

---

## Current Implementation

### What It Shows
```
Technical score: 0%
Tag: WEAK
Questions: 2
Top skill: Role fit (JD)
Footer: "Weighted from answered items"
```

### Current Data Sources
```javascript
technicalPct = toPct(
  scores.technical_score ?? 
  scores.interview_technical_pct ?? 
  (i.interviewScore * 10),
  fallback: Math.round((i.interviewScore / 10) * 100)
)
```

**Problem**: `scores.technical_score` comes from **AI report**, not from **actual interview Q&A analysis**.

---

## What's Missing (What HR Needs)

HR wants to understand:
1. ✅ Overall technical score (0-100%) → EXISTS but unreliable
2. ❌ **Technical skills covered** (list of skills evaluated)
3. ❌ **Number of technical questions** (separate count)
4. ❌ **Skill-wise scores** (each skill: X/10)
5. ❌ **Why this score** (explanation of reasoning)
6. ❌ **Did they prove required skills?** (YES/NO for each JD requirement)
7. ❌ **Answer quality breakdown** (strong/average/weak answers count)

---

## Data Available in Live Interview

### Interview Q&A Data
```javascript
interviewSessionRows = [
  {
    q: 1,
    question: "Explain how you'd design a REST API",
    answer: "I would start with...",
    score: "8/10",
    reasoning: "Clear architecture, good HTTP knowledge"
  },
  {
    q: 2,
    question: "What's your experience with databases?",
    answer: "I've worked with...",
    score: "6/10",
    reasoning: "Basic SQL knowledge but limited NoSQL"
  },
  ...
]
```

### Skills from AI Analysis
```javascript
skills_proof = [
  {
    skill: "REST API Design",
    status: "PROVED",
    score: "8/10",
    evidence: "Answered Q1 clearly with constraints and tradeoffs"
  },
  {
    skill: "Database Design",
    status: "PARTIAL",
    score: "6/10",
    evidence: "Basic SQL, limited NoSQL experience"
  },
  ...
]
```

### JD Requirements (Available)
From `drive.skills` or JD extraction:
```
Required skills:
- REST API design (CRITICAL)
- SQL databases (CRITICAL)
- NoSQL databases (NICE-TO-HAVE)
- System design (NICE-TO-HAVE)
```

---

## Required Fix

### Step 1: Identify Technical Questions
Filter questions that are technical (not behavioral/cultural):
```javascript
const technicalQuestions = interviewSessionRows.filter(row => {
  const q = row.question.toLowerCase();
  // Technical keywords: design, api, database, architecture, code, etc.
  const isTechnical = /design|api|database|architecture|code|implement|algorithm|debug|performance|scale/.test(q);
  return isTechnical;
});
```

### Step 2: Calculate Technical Score from Answers
Don't rely on AI report score — calculate from actual answers:
```javascript
const technicalScores = technicalQuestions.map(q => {
  const scoreStr = q.score; // "8/10" or "7/10"
  const score = parseInt(scoreStr) || 0; // Extract number
  return score;
});

const technicalPct = technicalScores.length > 0
  ? Math.round(technicalScores.reduce((a, b) => a + b, 0) / technicalScores.length)
  : 0;
```

### Step 3: Extract Technical Skills Covered
From `skills_proof` array, filter only technical skills:
```javascript
const technicalSkills = skills_proof.filter(s => {
  // Exclude soft skills, not skills
  const nonTechnical = ['communication', 'leadership', 'teamwork', 'presentation'];
  return !nonTechnical.includes(s.skill.toLowerCase());
});
```

### Step 4: Map to JD Requirements
Check which required skills were proven:
```javascript
const requiredSkills = extractRequiredSkills(jdText);

const skillProof = requiredSkills.map(reqSkill => {
  const covered = technicalSkills.find(s => 
    s.skill.toLowerCase().includes(reqSkill.toLowerCase())
  );
  return {
    skill: reqSkill,
    proved: covered?.status === "PROVED",
    score: covered?.score || "NOT TESTED",
    evidence: covered?.evidence
  };
});
```

### Step 5: Build Technical Card Data
```javascript
model.technical = {
  percent: technicalPct,
  questions: technicalQuestions.length,
  tag: technicalPct >= 70 ? "GOOD" : technicalPct >= 45 ? "AVERAGE" : "WEAK",
  skillsCovered: technicalSkills.length,
  topSkill: technicalSkills[0],
  skillsByScore: technicalSkills.sort((a, b) => 
    parseInt(b.score) - parseInt(a.score)
  ),
  requiredSkillsProved: skillProof.filter(s => s.proved).length,
  totalRequiredSkills: skillProof.length,
  explanation: buildTechnicalExplanation({
    percent: technicalPct,
    skillCount: technicalSkills.length,
    provedCount: skillProof.filter(s => s.proved).length,
    totalRequired: skillProof.length,
    topSkill: technicalSkills[0]
  })
};
```

---

## Implementation Approach

### Option A: Backend (Agent Post-Interview)
**When**: After interview completes, during report generation
**Where**: `agent_scoring.py` or `agent_runtime.py`

```python
def analyze_technical_competency(interview_data):
    """
    Analyze technical skills from actual interview Q&A.
    Not from AI report assumptions.
    """
    technical_questions = filter_technical_questions(interview_data.turns)
    technical_skills = extract_skills_from_answers(technical_questions)
    required_skills = parse_jd_requirements(interview_data.jd)
    
    skill_proof = []
    for req_skill in required_skills:
        matched = find_matching_skill(req_skill, technical_skills)
        skill_proof.append({
            'skill': req_skill,
            'proved': matched is not None,
            'score': matched['score'] if matched else 'NOT_TESTED',
            'evidence': matched['evidence'] if matched else None
        })
    
    return {
        'total_technical_questions': len(technical_questions),
        'skills_covered': technical_skills,
        'required_skills_proof': skill_proof,
        'technical_score': calculate_score(technical_questions),
        'explanation': build_explanation(skill_proof)
    }
```

### Option B: Frontend (Report Building)
**When**: When building the view model
**Where**: `buildSreeva AIInterviewViewModel()` in `interview-report-Sreeva AI.tsx`

```javascript
function extractTechnicalAnalysis(i) {
  const technicalQ = i.interviewSessionRows.filter(q => 
    /design|api|database|architecture|code|implement/.test(q.question.toLowerCase())
  );
  
  const scores = technicalQ.map(q => parseInt(q.score) || 0);
  const technicalPct = scores.length > 0 
    ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length)
    : 0;
  
  const skillsCovered = i.interviewReportSkills.filter(s => 
    !['communication', 'leadership', 'teamwork'].includes(s.skill.toLowerCase())
  );
  
  return {
    percent: technicalPct,
    questions: technicalQ.length,
    skillsCovered: skillsCovered,
    explanation: `...explanation based on actual answers...`
  };
}
```

---

## What the Card Should Display

### Current Layout
```
Technical score    [WEAK]
┌─────────────────────────┐
│        0%               │
│ 2 QUESTIONS             │
│ Top skill: Role fit     │
└─────────────────────────┘
Session score: 0%
Weighted from answered items
```

### Enhanced Layout (Recommended)
```
Technical score    [WEAK]
┌─────────────────────────────────────────┐
│ 45%  (AVG)                              │
│ 5 Technical Questions Evaluated         │
│                                         │
│ Skills Covered: 3/5 required            │
│ • REST API (8/10) ✅ PROVED            │
│ • Database (6/10) ⚠️ PARTIAL           │
│ • System Design (4/10) ❌ WEAK         │
│                                         │
│ Why: Candidate showed solid REST        │
│ understanding but limited database      │
│ and system design depth.                │
└─────────────────────────────────────────┘
Confidence: Medium | Based on 5 answered items
```

---

## Critical Requirements for Implementation

1. **Source from interview answers, not AI assumptions**
   - Use `interviewSessionRows` (actual Q&A)
   - Don't rely solely on `interviewReportData.scores`

2. **Separate technical questions from behavioral**
   - Filter by keywords: design, API, database, architecture, etc.
   - Count technical questions separately

3. **Map to JD requirements**
   - Extract required skills from JD
   - Show which ones were proven

4. **Calculate from answer scores**
   - Each Q has a score (8/10, 6/10, etc.)
   - Average those scores for technical %
   - Show breakdown by skill

5. **Provide reasoning**
   - "Candidate showed X strength in API design"
   - "Limited experience in Y database systems"
   - "Needs improvement in Z"

---

## Priority

**HIGH** — This is critical for HR to make hiring decisions.
- Current 0% score is clearly wrong
- HR needs skill-by-skill breakdown
- HR needs to know which JD requirements were met

---

## Suggested Implementation Order

1. **Fix data source** (use actual interview Q&A scores, not AI report)
2. **Add technical question filtering** (identify which Qs are technical)
3. **Build skill-to-JD mapping** (which required skills were evaluated)
4. **Generate explanation** (why this score?)
5. **Update card display** (show breakdown on hover/expand)

Currently the card exists but **doesn't reflect what actually happened in the interview**.
