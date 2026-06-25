# Scoring Logic — Interview Evaluation System

This document covers the complete design, rationale, research backing, and real examples
for the scoring system in `interview/agent_scoring.py`.

---

## Purpose

The scoring agent evaluates a candidate's answer after every interview question.
It is not a rule-based keyword checker. It is designed to reason like an experienced
human interviewer — understanding what the question was trying to learn, what the
candidate actually demonstrated, and whether that is enough evidence to move forward.

This system is role-agnostic. It works for technical, sales, HR, operations, product,
and any other first-round interview role without modification.

---

## What the Scorer Receives as Input Every Call

| Input | What It Is | Where It Comes From |
|---|---|---|
| `candidate_answer` | Full transcribed answer | Speech-to-text of what the candidate said |
| `last_question` | The exact question asked | The interviewer agent's last message |
| `topic_follow_up_count` | How many follow-ups already asked on this topic | Counter tracked in session state |
| `transcript_lines[-6:]` | Last 6 lines of conversation (last 3 exchanges) | Rolling transcript buffer |
| `candidate_band` | fresher / mid / experienced / senior | Set at session start from resume/JD |
| `active_topic` | Topic being explored (e.g. "Lead Generation") | Topic tracker in session |
| `topic_importance` | HIGH / CRITICAL / LOW | Set per topic in the interview plan |
| `topic_tag` | RESUME_TOPIC / JD_TOPIC / ROLE_TOPIC | Tagged when topics are planned |
| `topic_probe_focus` | Optional list of probe directions for this topic | From the interview plan |
| `job_title` | The role being interviewed for | From session setup |

The LLM sees all of this together — it knows the question, the full answer, the topic,
the band, whether this is something the candidate claimed on their resume, and how many
times they have already been probed on this topic.

---

## Output

```json
{
  "clarity": 0-10,
  "depth": 0-10,
  "specificity": 0-10,
  "grounding": 0-10,
  "action": "PROBE" or "MOVE_ON",
  "signal": "<signal_name>" or null,
  "signal_reason": "<exact quote from their answer>" or null,
  "reason": "one short phrase from their answer that drove the call"
}
```

Overall score formula:
```
overall = clarity × 0.20 + depth × 0.35 + specificity × 0.20 + grounding × 0.25
```

---

## Why These Four Dimensions

Research from structured interview frameworks (AIHR, OPM, STAR method rubrics,
Amazon/Google evaluation practices) converges on three non-negotiable evidence
requirements for scoring any behavioral answer:

1. **What the candidate specifically did** (personal action, not team action)
2. **How they did it** (decisions, reasoning, tradeoffs)
3. **What the measurable outcome was** (result, impact, learning)

The four dimensions map to these requirements while adding a fourth critical check
for whether the answer came from real experience or studied knowledge.

---

## Score Weights

| Dimension | Weight | Rationale |
|---|---|---|
| Depth | 35% | Strongest predictor of actual job performance. Hardest to fake with generic knowledge. |
| Grounding | 25% | Least gameable dimension. Requires details that only exist if you were actually there. |
| Clarity | 20% | Important but not sufficient. Fluent delivery is not the same as a strong answer. |
| Specificity | 20% | Operational detail matters but reduced from 30% — tool name-dropping was inflating scores. |

**Why grounding was increased from 15% to 25%:**
Grounding is the hardest dimension to fake. A well-prepared candidate can fake clarity
(speak fluently), fake depth (use borrowed reasoning from articles), and fake specificity
(name tools from the JD). But grounding requires friction, imperfect recall, contextual
constraints, and outcome nuance that only exist if the person was actually there.
Weighting it at 15% made the overall score gameable. At 25%, the formula now
penalizes prepared-but-inexperienced candidates appropriately.

**Why specificity was reduced from 30% to 20%:**
The old definition rewarded tool names and named comparisons. A candidate who studied the
JD for 30 minutes could name every tool without having touched any of them and score 8/10
on specificity. Specificity is now redefined as operational detail — and its weight reduced
to reflect that it is the most gameable of the four dimensions.

---

## The 4 Scoring Dimensions

---

### SCORE 1 — CLARITY (weight 20%)

**What it measures:** Did the candidate actually answer what was asked, and was it followable?

Clarity has TWO components — relevance and organization. Both must be present for a high score.

**Component A — Relevance (more important):**
Did the answer address what the question was actually trying to learn?
A fluent answer to a different question scores LOW on clarity.
A slightly disorganized answer that directly hits the question scores HIGH.

**Component B — Organization:**
Could you follow their train of thought?
Did it have a beginning, middle, end — even loosely?

**Anchors:**

| Score | Meaning |
|---|---|
| 0–2 | Did not address the question. Went on a tangent or answered something unrelated. |
| 3–4 | Partially addressed the question but drifted. Hard to follow the logic. |
| 5–6 | Addressed the question but loosely organized or missing a key part of the intent. |
| 7–8 | Directly answered what was asked. Followable structure. Minor gaps in organization. |
| 9–10 | Precisely answered the question intent. Clear structure. Nothing irrelevant included. |

**Band adjustments:**
- FRESHER: Do not penalize rambling or nervousness. Score relevance only.
- MID: Expect the answer to address the question. Some organization expected.
- EXPERIENCED/SENIOR: Expect precision. Tangents lower the score.

**Do NOT penalize:** non-native speakers, disfluent speech, filler words, informal language.
**DO penalize:** answering a different question, abandoning an answer mid-way for something else.

---

### SCORE 2 — DEPTH (weight 35%)

**What it measures:** Did they explain HOW they did it and WHY they made the choices they made?

WHAT alone is never enough. Depth requires reasoning, decisions, and tradeoffs — not just outcomes.

**The critical test:** Could someone who only READ ABOUT this topic give the same answer?
- YES → depth is low. They are describing knowledge, not experience.
- NO → depth is real. The reasoning is specific to their situation, their constraints, their decisions.

**Anchors:**

| Score | Meaning | Example |
|---|---|---|
| 0–2 | Stated only WHAT happened. No HOW, no WHY. Pure description. | "I handled the onboarding process and it went well." |
| 3–4 | Gave some reasoning but it is generic. Could apply to any project in this domain. | "I usually start by understanding requirements and then work through it step by step." |
| 5–6 | Gave a real reason or decision but thin — one layer only, no constraint or tradeoff. | "I chose to automate that step because it was taking too long manually." |
| 7–8 | Explained a real decision AND the constraint or tradeoff behind it. Shows actual judgment. | "I chose phone outreach over email because our prospect list was cold and email open rates were below 10% — I knew we needed a higher-touch approach for this segment." |
| 9–10 | Cause-effect chain: reasoning behind the reasoning. Decisions made under real constraints. Would not have been obvious without having been in that situation. | "The original plan was X but we hit Y, so I had to rethink — I considered A and B, chose B because of C, and it worked but had the drawback of D." |

**Band adjustments:**
- FRESHER: Accept simple 1-level reasoning. "I did X because Y" with a genuine reason = 5. Do NOT expect tradeoffs.
- MID: Expect at least one real decision with a specific constraint behind it. Generic reasoning = 4 max.
- EXPERIENCED: Expect tradeoffs and competing approaches. Single-reason answers = 5 max.
- SENIOR: Expect strategic reasoning — why this approach vs alternatives, second-order consequences. Answers without tradeoffs = 6 max.

**Borrowed Reasoning Warning:**
If the candidate's HOW/WHY sounds like it came from an article or course — not their real situation —
cap depth at 5. Real depth is situation-specific. Generic "best practices" language is not depth.

---

### SCORE 3 — SPECIFICITY (weight 20%)

**What it measures:** Did the candidate provide OPERATIONAL DETAIL that could only come from
actually doing this work — not from reading about it, studying it, or hearing about it?

**THIS IS NOT ABOUT TOOL NAMES OR SOFTWARE NAMES.**
A tool name alone proves nothing. Naming "Salesforce" or "n8n" or "Excel" without context = no specificity.
A candidate who studied the JD can name every tool in it without having touched any of them.

**What counts as real specificity (works for any role — technical, sales, HR, ops, any domain):**
- A real number: quota, headcount, deal size, error rate, percentage, time saved, volume
- A real constraint they hit: deadline, resource limit, budget cap, team size, stakeholder resistance
- A real failure or problem: what broke, what didn't work, what they had to fix
- A real decision point: two paths they had, why they chose one over the other
- A real outcome: what actually happened as a result — not what "usually" happens
- A real organizational detail: a specific client type, a specific team structure, a specific process step

**What does NOT count:**
- Tool names without describing what they did with it
- Generic comparisons ("X is better than Y for Z") — this is knowledge, not experience
- Describing a type of work ("I usually handle X kind of client") — this is a pattern, not an instance
- Vague outcomes ("it worked well", "the client was happy", "it improved performance")

**Anchors:**

| Score | Meaning | Example |
|---|---|---|
| 0–2 | Completely generic. Any person who read one article could say this. | "I worked on lead generation and helped the sales team hit their targets." |
| 3–4 | Named something (a tool, a concept, a domain) but zero operational context. | "I used Salesforce for tracking and we focused on enterprise accounts." |
| 5–6 | Named one real operational detail — a number, a constraint, or a specific outcome. | "Our pipeline was about 200 accounts, mostly mid-market, and I was responsible for the first 3 touchpoints before handing off to the AE." |
| 7–8 | Named 2+ real operational details that together make the work traceable to a real situation. | "I managed a team of 4 sourcers, we had a 90-day fill target for 12 roles, and our biggest constraint was that 3 of the roles were very niche — less than 200 qualified candidates in the market." |
| 9–10 | Rich operational picture. Multiple real details describing a specific event, not a type of event. Someone could ask a follow-up question and it would have an answer. | |

**Band adjustments:**
- FRESHER: May have limited numbers or scale. Credit any real operational detail even if small. An internship detail ("I handled 15 candidates in 2 weeks") = 6+.
- MID: Expect at least one real number or real constraint. Vague operational language = 4 max.
- EXPERIENCED/SENIOR: Expect multiple operational details with real scale. Generic descriptions = 3 max.

---

### SCORE 4 — GROUNDING (weight 25%)

**What it measures:** Does this answer sound like real lived work — or like a description of
what this kind of work is supposed to look like?

Grounding is the hardest score to fake and the most important signal of authentic experience.
A well-prepared candidate can fake clarity, can fake depth with borrowed reasoning, and can fake
specificity by naming tools. But grounding requires details that only exist if you were actually there.

**What makes an answer grounded — look for ANY of these:**

| Signal | Description |
|---|---|
| FRICTION | Something that didn't go as planned. A problem they hit. A thing they had to redo. |
| IMPERFECT RECALL | "I don't remember the exact number but it was around X." Real experiences are remembered imperfectly. Perfect recall of convenient facts is suspicious. |
| CONTEXT DEPENDENCY | Details specific to their situation, not generic to the domain. "This client specifically had X constraint" not "clients usually have X constraint." |
| RESULT WITH NUANCE | Not just "it worked" but what actually happened — including if it partially failed, took longer, or had an unexpected outcome. |
| REFLECTION | "Looking back I would have done X differently" or "I learned that Y was wrong." Only real experience produces reflection. |
| ORGANIZATIONAL TEXTURE | Specific stakeholders, real constraints from a real team or client, a real pressure point outside the candidate's control. |

**What makes an answer ungrounded — red flags:**
- Describes what this type of work "usually" involves — not what happened
- Perfect linear narrative: problem → action → success. Real work is messier.
- No mention of anything going wrong, any constraint, any imperfection
- Outcome is vague or generic ("improved efficiency", "the team was happy")
- Sounds like a case study or textbook example of how this work should be done
- No result at all — describes actions but never says what happened

**Anchors:**

| Score | Meaning |
|---|---|
| 0–2 | Pure theory or textbook description. Nothing could not have been said by someone who read one article. No result, no friction, no real detail. |
| 3–4 | Plausible but hollow. Sounds like someone who has seen this work but didn't own it. No friction, no imperfection, vague outcome. |
| 5–6 | Sounds like real experience. At least one grounding signal present. **IMPORTANT: An answer with NO stated result or outcome CANNOT score above 5.** |
| 7–8 | Clearly from real lived work. 2+ grounding signals present. The answer has texture — something was hard, or imperfect, or specific to their situation. |
| 9–10 | Rich, imperfect, highly contextual. Multiple grounding signals. The answer could not have been constructed without actually doing this work. Includes reflection or real friction or a result that was not guaranteed. |

**Band adjustments:**
- FRESHER: Limited work history means limited texture. Credit any real outcome, even from academics, side projects, or internships. A real failure from a student project = 6. Do NOT expect stakeholder complexity or organizational friction.
- MID: Expect at least one friction detail or specific outcome. Clean perfect narratives = 4 max.
- EXPERIENCED: Expect organizational texture, real constraints, real outcomes with nuance. Smooth polished narratives with no friction = 4 max regardless of other scores.
- SENIOR: Expect reflection, judgment under uncertainty, outcomes that weren't guaranteed. A senior candidate with a perfect linear story and no tradeoff or friction = 3 max.

---

## Routing: PROBE vs MOVE_ON

Routing is decided by reading the EVIDENCE in the answer — not by hitting score thresholds.
The question is: has this candidate given enough evidence for the interviewer to form a real judgment?

**PROBE when ANY of these are true:**
- The answer describes WHAT was done but not HOW or WHY
- A claim was made ("I owned this", "I handled X", "I'm strong at Y") with no evidence behind it
- The answer sounds plausible but has no real operational detail — no number, no constraint, no outcome
- The answer was grounded but incomplete — a real story with a missing piece worth pulling
- The topic is RESUME_TOPIC and the answer felt rehearsed or borrowed rather than lived
- The candidate touched on something new or unexpected that deserves one follow-up

**MOVE_ON when ALL of these are true:**
- The question intent was genuinely answered — not a related question, the actual one
- Real ownership was demonstrated — the candidate's specific role was clear
- At least one real decision, constraint, or outcome was described with enough detail to be credible
- Probing further would not reveal new information — the picture is complete enough
- OR: The candidate genuinely has no experience here — further probing would only confirm the gap

**Topic tag adjustments:**
- RESUME_TOPIC: Hold a higher bar. A plausible answer is not enough — require real evidence. If anything feels rehearsed or borrowed, PROBE.
- JD_TOPIC: Credit partial exposure. One real example or honest acknowledgment is enough to MOVE_ON.
- ROLE_TOPIC: Conceptual check only. One grounded answer that shows understanding = MOVE_ON.

**Why thresholds were removed:**
The old routing used hard score thresholds: `MOVE_ON when depth >= 7 AND specificity >= 7 AND grounding >= 6`.
This was wrong because:
1. A single question answer cannot be reliably judged by a fixed number — the bar depends on the topic, the band, and what was asked.
2. Specificity at 7 under the old definition could be reached by naming 2 tools. That is not enough to MOVE_ON.
3. Evidence-based routing gives the LLM the ability to make judgment calls the same way a human interviewer would — based on what was actually said, not whether a number crossed a line.

---

## Before vs After: Real Sentence Examples

### Example 1 — Sales Candidate, Mid-level, RESUME_TOPIC
**Question:** "Tell me about a time you managed a high-volume outreach campaign."
**Answer:** "Yeah so I've done a lot of outreach work. I usually start by building the list, then I segment it based on the ICP, and then I run the sequences. I use tools like Apollo and Instantly. It generally works well and we hit our targets."

| Dimension | OLD Score | OLD Reason | NEW Score | NEW Reason |
|---|---|---|---|---|
| Clarity | 7 | Fluent, followable | 5 | Answered "how you do outreach" not "tell me about a time" — missed the specific-instance request |
| Depth | 5 | Gave a process | 4 | Process is generic "I usually" — could apply to anyone, no constraint or decision |
| Specificity | 7 | Named Apollo and Instantly | 3 | Tool names with zero operational context — no volume, no segment size, no outcome number |
| Grounding | 5 | Sounds plausible | 3 | "usually", "generally" — describes a type of work, not a real event. No result stated. |
| **Overall** | **5.9 → PROBE** | | **3.7 → PROBE** | |

Both route to PROBE but for very different reasons. The old system barely caught it on a depth threshold.
The new system catches exactly what's wrong: the candidate described a habit, not a moment.

---

### Example 2 — HR Candidate, Experienced, RESUME_TOPIC
**Question:** "Walk me through how you handled a difficult hiring campaign."
**Answer:** "We were hiring for 8 engineering roles in 60 days, which was aggressive. Three of them required niche ML experience and there were maybe 150 qualified people in the country. I decided to go direct-to-candidate on LinkedIn instead of waiting for applications — I personally sent about 300 messages in two weeks. We filled 6 of the 8 roles in time. The last two dragged because the hiring manager kept changing the spec, which I should have locked down earlier — that was my mistake."

| Dimension | OLD Score | OLD Reason | NEW Score | NEW Reason |
|---|---|---|---|---|
| Clarity | 8 | Well structured | 9 | Directly answered, clear arc, nothing irrelevant |
| Depth | 7 | Gave a decision (direct outreach vs waiting) | 8 | Decision had a real constraint (150 candidates in market), explains the WHY behind the choice |
| Specificity | 5 | No software tools named | 8 | 8 roles, 60 days, 150 candidates, 300 messages, 2 weeks, 6/8 filled — all operational detail |
| Grounding | 6 | Sounds like real experience | 9 | Imperfect result (6/8), friction (spec kept changing), reflection (should have locked it down) |
| **Overall** | **6.3 → PROBE** | specificity dragged it down (no tools) | **8.7 → MOVE_ON** | |

**This is the most important fix.** The old system wrongly PROBE'd a strong experienced HR answer because
no tool names were mentioned. The new system correctly MOVE_ON's it because the answer is full of real
operational evidence.

---

### Example 3 — Technical Candidate, Fresher, JD_TOPIC
**Question:** "Have you worked with any automation tools?"
**Answer:** "I haven't used them professionally but I built a small project where I used n8n to automate my college assignment submission reminders. It would check a Google Sheet I maintained and send me a WhatsApp message three days before the due date. I hit an issue with the Google Sheets node authentication — took me a day to figure out it needed OAuth not just an API key."

| Dimension | OLD Score | OLD Reason | NEW Score | NEW Reason |
|---|---|---|---|---|
| Clarity | 7 | Clear, followable | 8 | Directly answered, honest about context (not professional), clear story |
| Depth | 5 | Described what it did | 6 | Explained the specific flow, real technical decision (OAuth vs API key) |
| Specificity | 6 | Named n8n, Google Sheets, WhatsApp | 7 | Specific trigger condition, specific node, specific auth problem — operational, not just names |
| Grounding | 4 | Named a tool with context | 7 | Real friction (auth issue, took a day), specific imperfect outcome, honest scope |
| **Overall** | **5.2 → PROBE** | grounding too low at 15% weight | **7.0 → MOVE_ON** | |

The old system under-scored a genuine fresher answer because grounding was weighted at 15% and the
anchors were too vague. New system correctly MOVE_ON's because the fresher showed real hands-on
evidence with honest scope and real friction.

---

### Example 4 — Senior Candidate, RESUME_TOPIC (The Prepared Faker)
**Question:** "Tell me about a system you designed end to end."
**Answer:** "I designed a lead qualification pipeline using n8n. I chose n8n over Zapier because it's self-hostable and more cost-effective at scale. The pipeline would ingest leads, enrich them using Clearbit, score them based on ICP criteria, and route the qualified ones to the CRM. It improved lead quality significantly and the sales team was very happy with the output."

| Dimension | OLD Score | OLD Reason | NEW Score | NEW Reason |
|---|---|---|---|---|
| Clarity | 8 | Well structured | 7 | Answered reasonably but "end to end design" deserved more on the design decisions |
| Depth | 7 | Named a decision (n8n over Zapier) with a reason | 5 | The reason sounds borrowed (self-hostable, cost at scale) — not situation-specific. Borrowed reasoning capped at 5. |
| Specificity | 8 | Named n8n, Zapier, Clearbit, CRM, ICP | 3 | All tool names, zero operational detail. No volume, no ICP definition, no scoring criteria, no timeline. |
| Grounding | 5 | Plausible, named tools | 3 | Perfect linear story: designed → built → worked → happy. No friction. Senior band: 3 max for clean narrative. |
| **Overall** | **7.0 → MOVE_ON** | thresholds met | **4.1 → PROBE** | |

**This is the highest-stakes fix.** The old system incorrectly MOVE_ON'd a senior candidate who likely
fabricated or heavily rehearsed the answer. The new system catches it across all three dimensions:
depth (borrowed reasoning), specificity (names only), grounding (perfect story, senior band).

---

## Research Sources

This scoring design is grounded in professional interview evaluation research:

- [Behavioral Interview Scoring Matrix — Polymer](https://www.polymer.co/blog/behavioral-interview-scoring-matrix)
- [Interview Rubric: How To Build Yours — AIHR](https://www.aihr.com/blog/interview-rubric/)
- [Interview Rubrics — Metaview](https://www.metaview.ai/resources/blog/interview-rubrics)
- [Structured Interviews Guide — Pin](https://www.pin.com/blog/structured-interviews-guide/)
- [Interview Evaluation Criteria — Insight7](https://insight7.io/interview-evaluation-criteria/)
- [Interview Response Accuracy 2026 — Parakeet AI](https://blog.parakeet-ai.com/what-is-interview-response-accuracy-2026-guide/)
- [AI Interview Scoring — HireMore](https://www.hiremore.ai/blog/ai-interview-scoring-candidates-are-evaluated)
- [Case Interview Rubric — Hiration](https://www.hiration.com/blog/case-interview-rubric-career-centers-higher-ed/)
- [Structured Interviews — OPM](https://www.opm.gov/policy-data-oversight/assessment-and-selection/other-assessment-methods/structured-interviews/)

---

## Implementation File

All scoring logic lives in: `interview/agent_scoring.py`

The system prompt is built inside `evaluate_answer()` starting at the `-- THE 4 SCORES --` section.
Band-specific notes are in `_band_note`. Signal definitions are in `SIGNAL_DEFINITIONS`.
