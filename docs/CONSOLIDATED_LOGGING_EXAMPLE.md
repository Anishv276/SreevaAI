# Consolidated Interview Context Logging

## Before (Separate Logs - Cluttered)

```
[BRIEF] ========== FULL RESUME BRIEF ==========
[BRIEF] Anchor: Multi Channel Lead Qualification System (type=project)
[BRIEF] Band: fresher
[BRIEF] Skills (5): ['python', 'n8n', 'datascience', 'powerbi', 'Apollo']
[BRIEF] Project[0]: Multi Channel Lead Qualification System - Created automated lead...
[BRIEF] Project[1]: Sensex Analysis Project - Built a system to collect, clean...
[BRIEF] Project[2]: Campaign Metrics and Slack Reporting System - Built automation...
[BRIEF] Internship[0]: Personal Brand & Marketing Automation Strategist - Social rises
[BRIEF] Internship[1]: Python Developer - Sensex Project - Seneca Global IT Services
[BRIEF] Education[0]: B.Tech - SRM University (2024)
[BRIEF] Education[1]: MPC - Narayana Junior College (2020)
[BRIEF] ==========================================

[STAGE1_DIRECTIVE] ========== FULL STAGE 1 DIRECTIVE ==========
[STAGE1_DIRECTIVE] [DO NOT SAY ALOUD][STAGE 1: RESUME]
[STAGE1_DIRECTIVE] 
[STAGE1_DIRECTIVE] GOAL: Understand what this candidate actually built and owned...
[STAGE1_DIRECTIVE] You have ~10 minutes. Talk through their work naturally...
[STAGE1_DIRECTIVE] PRIORITY ORDER (strict):
[STAGE1_DIRECTIVE]   1) Resume ownership topics first...
... (50+ more lines)
[STAGE1_DIRECTIVE] =============================================

[STAGE2] ========== STAGE 2 SKILL PHASE STARTED ==========
[STAGE2] Budget: 405 seconds (6.8 min)
[STAGE2] Opening skill topic: python
[STAGE2] Topics covered in Stage 1: uber, flipkart
```

**Problem**: 60+ log lines, hard to find what you need, drowns actual eval logs


---

## After (Consolidated Log - Clean)

```
[INTERVIEW_CONTEXT]
CANDIDATE: Vadla Vamsi Krishna | ROLE: GTM Engineer (Fresher) | BAND: fresher | TIME: 20m

RESUME BRIEF:
  Anchor: Multi Channel Lead Qualification System (type: project)
  Skills: python, n8n, datascience, powerbi, Apollo
  Projects: Multi Channel Lead Qualification System | Sensex Analysis Project | Campaign Metrics and Slack Reporting System
  Work History: none
  Internships: Personal Brand & Marketing Automation Strategist | Python Developer - Sensex Project
  Education: B.Tech - SRM University | MPC - Narayana Junior College

STAGE 1 (RESUME - 10 min): Understand what they personally built and owned. Open with: 'Multi Channel Lead Qualification System'. For fresher: probe HOW they think, real decisions, specifics. Must cover: resume ownership topics, at least 1 situational question, at least 1 behavioral question.

STAGE 2 (SKILL - 7 min): Probe depth on skills for GTM Engineer (Fresher) role. Skills to explore: python, n8n, datascience, powerbi, Apollo. For fresher: ask real usage, tradeoffs, ownership. Must ask situational + behavioral naturally. Already covered in Stage 1: go DEEPER.
```

**Result**: 1 single log with all context in readable paragraphs. Easy to scan, easy to understand.


---

## During Interview - Transition Logs

### When Stage 2 Starts:

```
[INTERVIEW_CONTEXT] === STAGE 2 TRANSITION === Time: 6m budget remaining. Opening skill: python. All skills to explore: python, n8n, datascience, powerbi, Apollo, google_sheets. Topics covered in Stage 1: multi_channel_lead_qualification_system, sensex_analysis_project. Goal: probe depth on real usage, tradeoffs, ownership. Still need: at least 1 situational + 1 behavioral question.
```

**What you see**: One line with all the critical info. No noise. Clear on what's been covered, what's left.


---

## Comparison: Log Cleanliness

### Before (Your Current Logs):

```
Line 1: [FLOW] Band=fresher | candidate=Vadla Vamsi Krishna | role=GTM Engineer (Fresher)
Line 2: [BRIEF] ========== FULL RESUME BRIEF ==========
Line 3: [BRIEF] Anchor: Multi Channel Lead Qualification System - Created automated...
Line 4: [BRIEF] Band: fresher
Line 5: [BRIEF] Skills (5): ['python', 'n8n', 'datascience', 'powerbi', 'Apollo']
Line 6: [BRIEF] Project[0]: Multi Channel Lead Qualification System - Created automated...
Line 7: [BRIEF] Project[1]: Sensex Analysis Project - Built a system...
Line 8: [BRIEF] Project[2]: Campaign Metrics and Slack Reporting...
Line 9: [BRIEF] Internship[0]: Personal Brand & Marketing Automation Strategist...
Line 10: [BRIEF] Internship[1]: Python Developer - Sensex Project...
Line 11: [BRIEF] Education[0]: B.Tech - SRM University (2024)
Line 12: [BRIEF] Education[1]: MPC - Narayana Junior College (2020)
Line 13: [BRIEF] ==========================================
Line 14: [STAGE1_DIRECTIVE] ========== FULL STAGE 1 DIRECTIVE ==========
Line 15-60: [STAGE1_DIRECTIVE] [each line separately]
Line 61: [STAGE1_DIRECTIVE] =============================================
Line 62: [STARTUP] Band=fresher | Language=english | TimeBudget=20m | Stage1=3305chars

TOTAL: 62 lines just for context setup
```

### After (Consolidated):

```
Line 1: [INTERVIEW_CONTEXT]
         CANDIDATE: Vadla Vamsi Krishna | ROLE: GTM Engineer (Fresher) | BAND: fresher | TIME: 20m
         
         RESUME BRIEF:
         Anchor: Multi Channel Lead Qualification System (type: project)
         Skills: python, n8n, datascience, powerbi, Apollo
         Projects: Multi Channel Lead Qualification System | Sensex Analysis Project | Campaign Metrics...
         Work History: none
         Internships: Personal Brand & Marketing Automation Strategist | Python Developer...
         Education: B.Tech - SRM University | MPC - Narayana Junior College
         
         STAGE 1 (RESUME - 10 min): Understand what they personally built and owned...
         STAGE 2 (SKILL - 7 min): Probe depth on skills for GTM Engineer (Fresher)...

TOTAL: 1 log entry, readable in 5 seconds
```

**Space saved**: 61 log lines → 1 log entry with all data visible

---

## Log Readability: Sample Output

```
16:19:23.471 INFO [INTERVIEW_CONTEXT]
CANDIDATE: Vadla Vamsi Krishna | ROLE: GTM Engineer (Fresher) | BAND: fresher | TIME: 20m

RESUME BRIEF:
  Anchor: Multi Channel Lead Qualification System (type: project)
  Skills: python, n8n, datascience, powerbi, Apollo
  Projects: Multi Channel Lead Qualification System | Sensex Analysis Project | Campaign Metrics and Slack Reporting System
  Work History: none
  Internships: Personal Brand & Marketing Automation Strategist | Python Developer - Sensex Project
  Education: B.Tech - SRM University | MPC - Narayana Junior College

STAGE 1 (RESUME - 10 min): Understand what they personally built and owned. Open with: 'Multi Channel Lead Qualification System'. For fresher: probe HOW they think, real decisions, specifics. Must cover: resume ownership topics, at least 1 situational question, at least 1 behavioral question.

STAGE 2 (SKILL - 7 min): Probe depth on skills for GTM Engineer (Fresher) role. Skills to explore: python, n8n, datascience, powerbi, Apollo. For fresher: ask real usage, tradeoffs, ownership. Must ask situational + behavioral naturally. Already covered in Stage 1: go DEEPER.

16:19:47.451 [EVAL] Stage=1(RESUME) action=PROBE quality=7.78 follow_ups=1/2 depth=[7.1]
16:19:54.898 [INTERVIEW_CONTEXT] === STAGE 2 TRANSITION === Time: 6m budget remaining. Opening skill: python. All skills to explore: python, n8n, datascience, powerbi, Apollo. Topics covered in Stage 1: multi_channel. Goal: probe depth on real usage, tradeoffs, ownership. Still need: at least 1 situational + 1 behavioral question.
```

---

## What's in the Consolidated Log

### 1. **Candidate Info**
- Name, role, seniority band, interview duration
- Single line, easy to identify who's being interviewed

### 2. **Resume Brief**
- Anchor project/work (starting point)
- All skills (up to 6)
- Projects, work history, internships, education (summarized)
- Everything visible, no need to hunt through separate logs

### 3. **Stage 1 Context**
- Goal statement
- Opening move (which project to start with)
- Band-specific instinct (how to probe for fresher vs mid vs senior)
- What must be covered (situational + behavioral requirements)
- All in 3-4 sentences

### 4. **Stage 2 Context**
- Same structure as Stage 1
- Skills to explore
- Band-specific approach
- What's been covered vs what's fresh

### 5. **Stage Transitions**
- One-line context when moving between stages
- Time remaining, current topic, coverage status
- No bloat, all actionable

---

## Benefits

| Before | After |
|--------|-------|
| 60+ log lines for setup | 1 log entry |
| Hard to find candidate info | Visible in first 2 lines |
| Skills scattered across lines | All skills in one list |
| Stage context hard to parse | Clear paragraph format |
| Lost in clutter | Easy to scan |
| Takes 30s to understand setup | Takes 5s to understand setup |

---

## How to Use in Debugging

**Find all info about an interview:**
```
grep "[INTERVIEW_CONTEXT]" app.log
# Returns: 1 entry at startup, 1 at stage 2 transition
# Everything you need to understand the session
```

**Compare candidate bands:**
```
grep -o "BAND: [a-z]*" app.log
# Quickly see which candidates are fresher, mid, senior
```

**Track stage transitions:**
```
grep "STAGE.*TRANSITION" app.log
# See exactly when each candidate moved to Stage 2
```

---

## Summary

- **Old way**: Separate logs for BRIEF, STAGE1_DIRECTIVE, STAGE2_DIRECTIVE = 60+ lines of context
- **New way**: Single `[INTERVIEW_CONTEXT]` log = all data in paragraphs = 1 entry
- **Result**: Logs are readable, eval logs aren't drowned out, debugging is 10x faster