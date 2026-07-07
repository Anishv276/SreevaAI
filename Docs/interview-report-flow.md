# Interview Report Generation — Full Flow

Reflects `interview/report_pipeline.py` as of the LLM-call/input rework (resume feeds eval,
skills is topic_records-only with per-turn scores, integrity gets a whole-session narrator,
summary/verdict see everything + full transcript).

---

## What triggers report generation

After the interview ends, `agent_runtime.py` runs two calls as a background task, sequentially
(summary needs the report's output):

```python
scores_context = await generate_interview_report(
    app_id, transcript_lines, answer_scores, job_title,
    llmInterviewReport=llm_model,
    proctoring_data=proctoring_data,
    org_id=org_id,
    jd_json=jd_json,
    resume_json=structured_resume,
    topic_records=topic_records,
    candidate_name=candidate_name,
    answer_integrity_enabled=org_toggle,
)
await generate_interview_summary(
    app_id, transcript_lines, job_title,
    llmInterviewReport=llm_model, org_id=org_id,
    scores_context=scores_context,
)
```

`generate_interview_report` runs a 3-node LangGraph pipeline (`signals` → `llm_calls` → `assemble`)
and returns a `scores_context` dict. `generate_interview_summary` takes that dict plus the raw
transcript and makes 2 more LLM calls (summary bullets + verdict).

---

## Table 1 — All LLM calls: count, why, where

| # | `call_type` | Batch | Triggers when | Purpose |
|---|---|---|---|---|
| 1 | `report_eval` | Parallel batch 1 (`_node_llm_calls`) | Always | Scores 5 dimensions — JD Knowledge, Problem Solving, `experience_credibility` (shown in UI as **"Resume Credibility"**), Communication, Ownership — plus strengths/concerns |
| 2 | `report_skills` | Parallel batch 1 | Always | Groups topics into 3-5 domain-category skills, 1-10 score + evidence each |
| 3 | `behavioral_analysis` | Parallel batch 1 (`BehavioralAnalyzer`) | Always | 4-5 paragraph HOW-they-communicated analysis (composure, style, engagement, handling "I don't know", consistency) |
| 4 | `report_answer_integrity` | Parallel batch 1 (`AnswerIntegrityAnalyzer`) | Only if org's `answer_integrity` toggle is enabled | Detects AI-read/generated phrasing and cross-turn contradictions in the transcript |
| 5 | `report_integrity_narrative` | Parallel batch 1 (`IntegrityNarrator`) | Only if ≥1 proctoring event fired (browser-side tab_switch, face_absence, etc.) | Groups all fired events by signal type, writes exactly 3 sharp points per type: what fired, why, what it means for hiring |
| 6 | `report_summary` | Parallel batch 2, in `generate_interview_summary` (depends on batch-1 output) | Always | 3-bullet executive summary for the hiring team |
| 7 | `report_verdict` | Parallel batch 2 | Always | Final Hire / Hold / Reject decision + 0-100 score + justification paragraph |

**Total: up to 7 LLM calls per report** — 5 in the first parallel wave (`asyncio.gather` inside
`_node_llm_calls`), 2 in a second wave that consumes the first wave's results. Calls 4 and 5 are
conditionally skipped (disabled org toggle / clean session respectively), so the cheapest real
session runs 5 calls.

All calls go through `ReportLLMClient` (singleton `AsyncOpenAI`, streaming, 3 retries on
429/500/502/503/504 with 1s/3s/7s backoff) and log billing via `_persist_billing`.

### What "Resume Credibility" actually is

There is no separate `resume_credibility` field or LLM call. It is the `experience_credibility`
dimension from `report_eval` (`interview/report_pipeline.py:76`), weighted 20% of the overall
score. The eval system prompt names it **"DIMENSION 3 — ec (Resume Credibility, weight 20%)"**
and instructs the LLM to check whether the candidate's live answers hold up against what they
claimed on their resume or in their intro — NOT raw technical knowledge, but whether the
experience/projects/skills on the resume are genuinely theirs.

- **Backend write**: `_node_assemble` writes it into `scoreBreakdown.dimensions` as
  `{"name": "Experience Credibility", "score": ec, "evidence": ...}`.
- **Frontend read**: `EvaluationScoresCard` in `interview-report-sreevaai.tsx` looks it up via
  `DIM_KEYWORDS["experience_credibility"] = "experience"`, matching any dimension whose `name`
  contains `"experience"` — which is why `"Experience Credibility"` from the backend resolves
  correctly even though `DIMENSION_CONFIG` labels it **"Resume Credibility"** for display
  (`components/admin/candidate-profile/interview-report-sreevaai.tsx:796`).
- **What changed**: until this rework, the LLM was asked to judge resume credibility with no
  resume in the prompt — only self-reported claims made live in the transcript. `eval_user` now
  includes a resume claims block built by `_build_resume_claims_block`, which runs the resume
  (`state["resume_json"]`, sourced from `structured_resume` in `agent_runtime.py`) through the
  same `RawResumeJSON` / `ResumeExtractor` the interview-brief pipeline already uses — pulling
  clean `WORK: ... [tech: ...]`, `PROJECT: ... — impact claimed: ...`, and `SKILLS CLAIMED: ...`
  lines instead of a truncated JSON blob. This keeps every concrete, checkable claim (tech named,
  duration, impact numbers) inside the prompt even when the raw resume JSON is large, so the score
  reflects real claims-vs-live-answer matching, not just internal-transcript consistency.

---

## Table 2 — Each report section: exact input it receives

| Report section | LLM call | Input given |
|---|---|---|
| Dimension scores + strengths/concerns | `report_eval` | Role title, JD context (`state["jd_context"]`), **candidate resume claims block** (`_build_resume_claims_block`, reuses the deterministic `ResumeExtractor` from `brief_extraction.py` — zero extra LLM cost — to pull WORK/PROJECT/SKILLS lines with tech/duration/impact, instead of a raw-JSON dump that could truncate mid-project; falls back to "score from self-reported claims only" if resume missing/unparseable), integrity score/band, behavioral-signal-count string, full transcript (**5000 tokens**, skips first 4 warmup/greeting lines) |
| Skill ratings | `report_skills` | Role title + one block per `topic_records` entry: `[TOPIC N] <topic name>` followed by every matching turn from `interview_scores` as `Q / A / [clarity depth specificity grounding overall]`. No topic-level aggregate fields (no `exit_reason`, `probe_count`, `avg_overall`, `tech_skills`, `denied`) — just the topic name and its real per-turn Q&A + scores, so the LLM groups and scores from actual evidence, not pre-computed averages. **No QA-fallback path** — if `topic_records` is empty, the prompt says "No interview topics found." |
| Behavioral analysis (paragraphs) | `behavioral_analysis` | Session metadata (duration, turn counts), per-turn behavioral signals (`ownership_ambiguous`, `answer_hollow`, `example_evaded`, `functional_claim_unverified`, `claim_not_demonstrated`) grouped by topic/turn with reasons, full Q&A log with per-answer depth/clarity/specificity/grounding |
| Answer integrity (phrasing/consistency) | `report_answer_integrity` | Full transcript only (**5000 tokens**) — no scores, no signals, just the raw conversation |
| Integrity signals analysis (3 points/signal type) | `report_integrity_narrative` | Every fired proctoring event, grouped by signal type, each occurrence showing severity, elapsed timestamp, `during_question`/`during_topic` (attached by `_attach_question_context`), latency (if applicable), raw reason/quotes |
| Executive summary (3 bullets) | `report_summary` | Shared `shared_user` block (see below) |
| Final verdict + hire score | `report_verdict` | Identical `shared_user` block as summary — same system, different task (decisive score + Hire/Hold/Reject instead of bullets) |

**`shared_user` block** (built once in `generate_interview_summary`, reused for both calls 6 and 7):
- Role title
- Integrity band/score
- Behavioral-signal summary string
- Computed weighted overall score (deterministic anchor)
- All 5 dimension scores + evidence
- Full skill breakdown (skill/score/evidence)
- Strengths observed
- Concerns flagged
- **Behavioral analysis points** (the 4-5 paragraphs from call 3)
- **Integrity signals analysis** (the 3-point-per-type breakdown from call 5)
- **Answer integrity result** (flagged/score/reason, or "Not enabled for this org")
- **Full interview transcript** (5000 tokens)

So the verdict and summary calls see literally everything every earlier stage produced, plus the
raw conversation — not just the aggregated scores.

---

## Node 1 — `_node_signals` (deterministic, no LLM)

- Fetches `integritySignals` from DB (browser-written events: `tab_switch`, `face_absence`,
  `camera_disabled`, `multiple_faces`, `microphone_disabled`, `fullscreen_exit`,
  `window_focus_loss`, `connection_lost`, `identity_mismatch`, `session_fingerprint`).
- Attaches `during_question`/`during_topic` to every event via `_attach_question_context`
  (matches event timestamp against per-turn wall-clock windows from `answer_scores`).
- Runs `IntegrityEngine.score()` — O(n) Counter-based weighted scoring:

```
Start: 100
Each fired signal type: weight × min(occurrences, 3)
  tab_switch -10, fullscreen_exit -15, window_focus_loss -10, face_absence -15,
  multiple_faces -25, camera_disabled -15, microphone_disabled -8,
  identity_mismatch -20, connection_lost -12, answer_integrity -20,
  session_fingerprint -20
Band: HIGH ≥80, MODERATE ≥55, LOW below
```

- Builds `signal_context` (e.g. `"tab_switchx2"`) and `jd_context` (JD JSON + experience-level hint)
  for downstream prompts.

---

## Node 2 — `_node_llm_calls` (5 calls in parallel via `asyncio.gather`)

Builds `eval_user`, `skills_user`, then fires all 5 calls from Table 1 (#1-#5) concurrently.
Billing is persisted for all 5 usages concurrently after the gather resolves. Eval and skills
responses are parsed into `LLMEvalResponse` / `LLMSkillsResponse` (fall back to empty models on
parse failure, logged as a warning).

---

## Node 3 — `_node_assemble` (persist)

- Computes weighted overall: `jk×0.30 + ps×0.25 + ec×0.20 + cm×0.15 + od×0.10`.
- If `answer_integrity` fired above threshold (score ≥ 60), folds it into the browser-events list
  as a synthetic event, re-scores `IntegrityEngine`, and persists it back onto the
  `integritySignals` DB column so it shows up alongside real proctoring events.
- Writes 4 DB columns in one query: `scoreBreakdown`, `skillRatings`, `signalAnalysis`,
  `interviewSummary` (first write — strengths/concerns only).
- Returns `scores_context` — the dict `generate_interview_summary` consumes next.

### `scoreBreakdown` column
```json
{
  "dimensions": [
    {"name": "JD Knowledge", "score": 61, "evidence": "..."},
    {"name": "Problem Solving", "score": 58, "evidence": "..."},
    {"name": "Experience Credibility", "score": 54, "evidence": "..."},
    {"name": "Communication", "score": 72, "evidence": "..."},
    {"name": "Ownership", "score": 65, "evidence": "..."}
  ],
  "overall": 61,
  "integrity": {"score": 80, "band": "HIGH", "signals_used": ["tab_switch"], "methodology": "signal_weighted_deterministic"},
  "skills_evaluated": ["Backend", "Databases", "System Design"]
}
```

### `skillRatings` column (read directly by UI, separate from scoreBreakdown)
```json
[
  {"skill": "APIs & Integrations", "score": 7, "evidence": "..."},
  {"skill": "Backend", "score": 6, "evidence": "..."},
  {"skill": "Databases", "score": 4, "evidence": "..."}
]
```

### `signalAnalysis` column — integrity and behavioral kept as two separate JSON blocks
```json
{
  "points": ["4-5 behavioral paragraphs..."],
  "behavioral_signals": [{"signal_name": "ownership_ambiguity", "turn": 3, "topic": "...", "..." : "..."}],
  "proctoring_events": [{"eventType": "tab_switch", "timestamp": 340000, "during_question": "..."}],
  "integrity_signals_analysis": {
    "tab_switch": ["point 1 (what/when)", "point 2 (why)", "point 3 (hiring impact)"],
    "face_absence": ["...", "...", "..."]
  },
  "behavioral_signals_analysis": ["same 4-5 paragraphs as points, explicit alias for the UI"],
  "answer_integrity": {
    "enabled": true, "score": 72, "flagged": true, "reason": "...",
    "phrasing_score": 65, "phrasing_reason": "...",
    "consistency_score": 78, "consistency_reason": "...",
    "quotes": ["..."]
  }
}
```

### `interviewSummary` column (first write)
```json
{"strengths": ["..."], "concerns": ["..."]}
```

---

## `generate_interview_summary` — 2 more parallel calls

Consumes `scores_context` (all the fields above) plus the raw transcript, builds the enriched
`shared_user` block (see Table 2), and fires `report_summary` + `report_verdict` in parallel.

- **`report_summary`** returns exactly 3 dashed bullets: strongest technical signal, biggest
  fit/trajectory takeaway, sharpest hiring implication.
- **`report_verdict`** returns strict JSON: `{"decision": "Hire"|"Hold"|"Reject", "score": 0-100, "justification": "..."}`.
  The score anchors to the deterministic weighted overall, adjustable ±~10 points by evidence.

Both write into `interviewSummary` via a `jsonb` merge (`COALESCE(...) || $1::jsonb`), so the
second write adds `summary` and `decision_note` alongside the strengths/concerns from Node 3
without clobbering them.

### Final `interviewSummary` column
```json
{
  "strengths": ["..."],
  "concerns": ["..."],
  "summary": "- bullet one\n- bullet two\n- bullet three",
  "decision_note": {"decision": "Hold", "score": 61, "justification": "..."}
}
```

---

## Signal separation — why two stores

| Signal type | Source | Stored in | Used for |
|---|---|---|---|
| `tab_switch`, `face_absence`, `multiple_faces`, `camera_disabled`, `fullscreen_exit`, `window_focus_loss`, `connection_lost`, `identity_mismatch`, `session_fingerprint`, `answer_integrity` | Browser frontend during interview (+ synthetic `answer_integrity` event added post-hoc) | `integritySignals` DB column | `IntegrityEngine` deterministic score, `report_integrity_narrative` 3-point breakdown, proctoring UI |
| `ownership_ambiguous`, `answer_hollow`, `example_evaded`, `functional_claim_unverified`, `claim_not_demonstrated` | Eval pipeline, per-turn during the interview | `signalAnalysis.behavioral_signals` | `behavioral_analysis` LLM prompt input, Behavioral Analysis UI panel |

Browser/proctoring events never feed the behavioral paragraphs; behavioral signals never feed the
integrity score. They're grouped for the UI as two separate blocks inside `signalAnalysis`
(`integrity_signals_analysis` vs `behavioral_signals_analysis`/`points`), never merged.

---

## What lands in the UI

| UI element | DB column read | Notes |
|---|---|---|
| 5 dimension score bars | `scoreBreakdown.dimensions` | JD Knowledge / Problem Solving / Experience Credibility / Communication / Ownership |
| Overall fit % | `scoreBreakdown.overall` | Weighted 30/25/20/15/10 |
| Integrity score badge | `scoreBreakdown.integrity` | Score/band + `signals_used` |
| Integrity Signals panel (hover detail) | `integritySignals` + `signalAnalysis.integrity_signals_analysis` | 3 LLM points per fired signal type shown in the hover card, replacing generic static copy when available |
| Skill bars (click to expand evidence) | `skillRatings` | 1-10 per domain category |
| Behavioral Analysis panel | `signalAnalysis.points` | 4-5 paragraphs, unchanged format |
| AI summary bullets | `interviewSummary.summary` | 3 bullets |
| Verdict / recommendation | `interviewSummary.decision_note` | `{decision, score, justification}` |
| Strengths / Concerns lists | `interviewSummary.strengths` / `.concerns` | From `report_eval` |

---

## Notes / known gaps

- `regenerate.py` (standalone debug script, not part of the production path) was not updated for
  the new `resume_json` param or the removed QA-fallback skills path — it also calls
  `generate_interview_report` with a stale `_LLM_DEFAULT` kwarg that doesn't match the real
  `llmInterviewReport` parameter name. Pre-existing issue, out of scope for the report rework.
