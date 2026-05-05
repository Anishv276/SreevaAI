# Runtime Phase 2: Role-Based Core Interview

## Overview
Runtime Phase 2 is the first real interview phase after warmup finishes. This is where Ishita begins the substantive interview using the candidate's resume, JD, screening report, and custom questions.
This is the live session phase, not the internal question-bank "Phase 2" label, which is reserved/empty.

There are two related layers here:
- **Runtime Phase 2**: the live opening and first real question in the interview flow
- **Question Bank Phase 2**: an internal reserved section in the generated bank, not a live session phase

## What gets built before Runtime Phase 2
The runtime builds a compact interview context from:
- `candidate_band` from the parsed resume experience data
- `candidate_summary_block` from the resume
- `jd_summary_block` from the JD
- `screening_summary_block` from the AI screening report
- `coverage_items` from the band
- `questions_list` from coverage items + custom questions
- `candidate_brief_block` from the LLM output
- `smart_opening_question` extracted from the brief
- `question_bank` parsed from the LLM output

## What the LLM brief now contains
The brief is no longer a giant essay. It is a compact combined artifact with two parts:

### Artifact 1: Brief
A short style card with exactly 5 fields:
- Band
- Tone
- Depth
- Probe pressure
- Opener style

### Artifact 2: Question Bank
An ordered set of questions, grouped into:
- `PHASE 1` internal questions
- `PHASE 2` reserved, no questions generated
- `PHASE 3` skills / validation questions

The runtime parses this text into `session_context.question_bank`.

## Runtime Phase 2 flow
### 1. Warmup ends
When the second candidate response is received in runtime Phase 1:
- the warmup directive is removed
- the Phase 2 opening context is injected
- the interview transitions into the real interview flow

### 2. The first real question is resume-anchored
The runtime uses raw resume fields to pick the first anchor:
- fresher -> project, internship, or education
- mid -> latest role or project
- experienced -> latest role or ownership-heavy work
- senior -> flagship role, strategic work, or major initiative

The runtime then uses the smart opening question if the brief provides one.

### 3. JD shapes what must be covered
The JD summary is used to:
- identify must-prove skills
- prioritize responsibilities
- decide what areas need deeper verification

Phase 2 does not read the JD out loud as a checklist. It uses the JD to guide what Ishita asks next.

### 4. Screening report shapes watch-outs
The screening summary is used to:
- spot broad or thin claims
- verify suspicious or weak areas
- push for concrete examples
- avoid shallow polished answers

### 5. Custom questions are folded into coverage
Custom questions are merged into `questions_list` and treated as mandatory coverage items.

They do not replace the resume anchor.
They do influence what must be covered before the interview ends.

### 6. The evaluator controls follow-ups
After every candidate answer, the evaluator decides whether Ishita should:
- move on
- ask a follow-up
- verify a claim
- probe for evidence

Rule:
- max 2 follow-ups per topic
- if the answer is good enough, move on
- if the candidate is vague, ask for specifics

## How the question bank is structured
The generated question bank is band-based and phase-based internally.
These labels are for the artifact only and do not replace the live runtime phases above.

### Brief section
This tells Ishita how to interview:
- tone
- depth
- probe pressure
- opener style

### Question bank section
This gives the actual question path:
- `PHASE 1` internal questions
- `PHASE 2` reserved for future use
- `PHASE 3` skills, strengths, weaknesses, watch-outs, custom coverage

The runtime stores the parsed result in:
- `session_context.question_bank`

## Phase 2 question style by band
### Fresher
Focus on:
- what they built
- how they learned
- fundamentals
- internships
- college projects

### Mid
Focus on:
- ownership
- implementation detail
- decisions
- measurable impact
- collaboration

### Experienced
Focus on:
- scale
- tradeoffs
- production judgment
- end-to-end ownership
- cross-functional impact

### Senior
Focus on:
- strategy
- architecture
- influence
- mentoring
- ambiguity and judgment

## Example flow
### Candidate
- Band: experienced
- Resume: Backend Engineer at Acme
- JD: reliability, scaling, backend ownership
- Report: strong communication, weak on concrete scale examples
- Custom questions: project ownership, scaling, collaboration

### Runtime behavior
1. Ishita opens on the Acme role.
2. She asks what the candidate personally owned.
3. If the answer is vague, she follows up.
4. She moves to reliability or scaling.
5. She uses the JD and report to decide whether to probe deeper or move on.
6. She keeps topics moving so the interview does not get stuck on one thing.

## What Phase 2 is not
- It is not warmup.
- It is not the greeting.
- It is not a static checklist read aloud.
- It is not a long essay from the brief.
- It is not unlimited follow-up drilling.

## Code locations
- [`agent_runtime.py`](C:/Users/vamsi/OneDrive/Desktop/HR-updates/agent_runtime.py) - brief generation, question bank attachment, and Phase 2 runtime injection
- [`interview_phases.py`](C:/Users/vamsi/OneDrive/Desktop/HR-updates/interview_phases.py) - Phase 2 opening context and resume anchor selection
- [`agent_profile_context.py`](C:/Users/vamsi/OneDrive/Desktop/HR-updates/agent_profile_context.py) - band inference, resume parsing, JD/report context, and question bank parsing
