# Interview Flow Explained

## Phase Map

- Greeting: scripted opening before the turn counter starts
- Runtime Phase 1: 4-turn warmup only, no resume/JD probing
- Runtime Phase 2: first real role-based interview after warmup
- Question bank phases: internal labels inside the generated artifact only

## What Happens Live

### 1. Greeting
- Ishita speaks the canonical greeting from `build_phase_1_greeting_text()`
- The candidate cannot interrupt this scripted opener
- Once delivered, `greeting_delivered_at` is recorded

### 2. Runtime Phase 1
- The warmup directive is injected
- The goal is rapport only
- The runtime expects 4 conversational turns total:
  - Turn 1: scripted greeting
  - Turn 2: candidate reply
  - Turn 3: Ishita's short human reply
  - Turn 4: candidate reply again
- No resume, JD, or skill probing yet

### 3. Runtime Phase 2
- Starts after warmup completes
- The first real question is anchored on the candidate's resume
- Band controls the tone and depth:
  - fresher: projects, internships, fundamentals
  - mid: ownership, implementation, impact
  - experienced: scale, tradeoffs, production judgment
  - senior: strategy, architecture, influence
- JD, report, and custom questions shape what must be covered
- The evaluator allows up to 2 follow-ups per topic

## What The Question Bank Is

The generated artifact contains two parts:

1. BRIEF
- Short style card
- Tells Ishita how to ask, how hard to probe, and what opener style to use

2. QUESTION BANK
- Internal labels only
- `PHASE 1` = background and resume-led questions
- `PHASE 2` = reserved, empty
- `PHASE 3` = skills, strengths, weaknesses, watch-outs, custom coverage

These internal labels are for the artifact only and do not replace the live runtime phases.

## Data That Feeds The Flow

- `candidate_band` from parsed resume experience data
- `candidate_summary_block` from resume
- `jd_summary_block` from the JD
- `screening_summary_block` from the report
- `questions_list` from coverage items plus custom questions
- `smart_opening_question` from the brief
- `question_bank` parsed into a structured object

## Simple Example

For an experienced backend candidate:

- Runtime Phase 1: greeting and warmup
- Runtime Phase 2: open on the latest role or project
- JD: push reliability and scaling
- Report: push for concrete evidence if answers are vague
- Custom questions: cover any extra required topics
- Question bank Phase 3: ask deeper skill and watch-out questions later

## Short Rule Of Thumb

- Live runtime phases control when the interview moves
- Question bank phases control what kind of questions get asked
- The two should not be confused
