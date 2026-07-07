# Scoring Logic — Interview Evaluation System (End to End)

## Architecture Overview

Every candidate answer flows through a 4-stage pipeline:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ ① Response   │    │ ② Content    │    │ ③ Saturation │    │ ④ Next       │
│ Signal       │───▶│ Scoring +    │───▶│ + Routing    │───▶│ Question     │
│ Detection    │    │ Signal Class │    │ Decision     │    │ Generation   │
│ (G0 gates)   │    │ (G1-G7)      │    │              │    │ (Probe/Move) │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

**Files involved:**
- `agent_scoring.py` — Stage 1+2: two parallel LLM calls (quality + response/content signal)
- `eval_pipeline.py` — Stage 3: routing decision, saturation tracking
- `probe_strategy.py` — Stage 4 probe strategy (how to follow up per signal)
- `agent_runtime.py` — Orchestrates everything, builds directives

---

## Stage 1: Response-Signal Detection (G0)

**File:** `agent_scoring.py` (`_call_signal_classification`) · Runs in parallel with quality scoring.

A single LLM call classifies the answer into one of 5 response-level signals.
If any fires, scoring is short-circuited.

| Signal | Meaning | Action |
|--------|---------|--------|
| `pure_denial` | "I don't know" — zero attempt, nothing substantive | MOVE_ON, scores=0 |
| `denial_with_continuation` | "I haven't done X, but I built Y" — denial + real content | Continue scoring, cap at 5.0 |
| `clarification_request` | "Can you rephrase?" / "What do you mean?" | REPHRASE (re-ask clearer) |
| `rephrase_request` | "Let me say that again" / "I misspoke" | ACCEPT_REPHRASE (use corrected answer) |
| `off_topic` | Answered a completely different question | REDIRECT (re-ask original) |

**Example:**
```
Q: "How do you handle Kubernetes scaling?"
A: "I don't know Kubernetes, but I deployed a Docker Compose setup once"
→ signal = denial_with_continuation → scores capped at 5, probe on Docker experience
```

---

## Stage 2: Content Scoring + Signal Classification (Parallel)

**File:** `agent_scoring.py` · Two concurrent LLM calls.

### Call 1: Quality Scoring (`_call_scoring`)

Evaluates 4 dimensions, weighted:

```
overall = clarity × 0.20 + depth × 0.35 + specificity × 0.20 + grounding × 0.25
```

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| **Clarity** | 20% | Did they answer what was asked, not a safer version? |
| **Depth** | 35% | Did they explain HOW and WHY, not just WHAT? |
| **Specificity** | 20% | Operational detail only a real practitioner would have (numbers, constraints, failures — NOT tool names) |
| **Grounding** | 25% | Does it sound like real lived work? Friction, imperfect recall, reflection? |

**Band-adjusted anchors** — the bar rises with seniority:
- **Fresher:** A simple genuine reason = depth 5+. Credit any real detail.
- **Mid:** Expect at least one tradeoff or constraint. Generic = 4 max.
- **Experienced:** Expect organizational texture, competing options. Single-reason = 5 max.
- **Senior:** Expect strategic judgment, second-order thinking. No tradeoff = 6 max.

### Call 2: Signal Classification (`_call_signal_classification`)

Detects 7 content-level signals with a **variety rule** (same signal cannot fire twice on one topic).

| Signal | Pattern | Example |
|--------|---------|---------|
| `example_evaded` | Gave a habit/rule instead of a real instance | Q: "Tell me about a time..." A: "Usually I check the data first" |
| `depth_ceiling_hit` | Tried to answer, ran out of knowledge | "I've used FAISS but I don't really know how indexing works" |
| `ownership_ambiguous` | "We/team/they" throughout, no "I" | "We built the pipeline, they handled deployment" |
| `explanation_shallow` | Loud claim ("I built it all") + hollow explanation | "I built the whole RAG system myself" — can't describe any part |
| `tool_named_not_used` | Named a tool, zero usage shown | "ChromaDB, FAISS, Pinecone" — no operational verb with any of them |
| `tech_choice_unjustified` | Used a tool, never said WHY that one | "I stored embeddings in ChromaDB. It worked fine." — why not Pinecone? |
| `scenario_untested` | Correct textbook flow, no friction | "Chunks → vectors → store → search" — no edge case, no failure |

**Variety rule:** If `depth_ceiling_hit` already fired on this topic, the LLM must pick a different signal (e.g., `tool_named_not_used`). This ensures every follow-up question probes a fresh angle.

**Fallback:** If both LLM calls fail (timeout), returns low-confidence recovery scores (overall=1.3) and `signal=None`. The fallback classifier (`_classify_signal_from_answer`) then picks the best-fit content signal.

### Response-Signal Score Overrides

After both calls complete, response signals override quality scores:

| Signal | Effect |
|--------|--------|
| `pure_denial` | All scores → 0.0 |
| `denial_with_continuation` | All scores capped at 5.0 |
| `clarification_request` | All scores → 0.0, re-ask |
| `rephrase_request` | All scores → 0.0, accept new answer |
| `off_topic` | All scores → 0.0, redirect |

**Example 1 — Strong Answer (HR, Experienced):**
```
Q: "Walk me through a difficult hiring campaign."
A: "We needed 8 engineers in 60 days. 3 required niche ML experience,
    maybe 150 qualified people in the country. I decided to go direct
    on LinkedIn — sent about 300 messages myself. We filled 6 of 8.
    The other 2 dragged because the hiring manager kept changing the
    spec — I should have locked that down earlier."

Clarity=9, Depth=8, Specificity=8, Grounding=9 → Overall=8.7
Signal=none → MOVE_ON
```

**Example 2 — Prepared Faker (Senior, Technical):**
```
Q: "Tell me about a system you designed end to end."
A: "I designed a lead qualification pipeline using n8n. I chose n8n
    over Zapier because it's self-hostable and cost-effective at scale.
    It would ingest leads, enrich via Clearbit, score by ICP criteria,
    and route qualified ones to CRM. It improved lead quality."

Clarity=7, Depth=5 (borrowed reasoning cap), Specificity=3 (tool names only),
Grounding=3 (senior: clean narrative with no friction cap) → Overall=4.1
Signal=tool_named_not_used → PROBE
```

**Example 3 — Signal with Variety Rule:**
```
Turn 1: "I built RAG pipeline, used ChromaDB ..." → signal = tool_named_not_used
Turn 2: "I used ChromaDB for storing embeddings, it worked fine."
         → tool_named_not_used is BANNED (already fired)
         → LLM picks tech_choice_unjustified instead ("why ChromaDB not Pinecone?")
```

---

## Stage 3: Saturation & Routing Decision

**File:** `eval_pipeline.py`

### TopicState — Per-Topic Saturation Tracker

Each topic has a `TopicState` that tracks:

```
saturation_score += base_turn_credit + contribution
is_saturated = saturation_score >= saturation_threshold
```

Where:
- `contribution = clamp((weighted - 2.0) / 8.0 × 3.5, 0.0, 3.5)`
- `base_turn_credit` is band-aware and importance-aware (0.6–1.4)
- `saturation_threshold` is band-aware (2.5–11.0 depending on band + importance)

**Band-Aware Thresholds:**

| Band | CRITICAL | HIGH | MEDIUM | LOW |
|------|----------|------|--------|-----|
| Fresher | 5.5 | 5.0 | 5.0 | 2.5 |
| Mid | 7.0 | 5.5 | 4.0 | 3.0 |
| Experienced | 9.0 | 7.0 | 5.0 | 3.5 |
| Senior | 11.0 | 8.5 | 6.0 | 4.0 |

### Routing Decision (Priority Order)

1. **Response signal** (pure_denial, etc.) → forced action from signal
2. **Clarification escalation** (2× clarification_request) → MOVE_ON
3. **Dry topic** (2 consecutive zero-score answers) → MOVE_ON
4. **Weak exit** (turn ≥3 with <50% saturation, or turn ≥5) → MOVE_ON
5. **Saturated** (score ≥ threshold) → MOVE_ON
6. **Else** → PROBE

### Clarification/Dry-Topic Edge Cases

- `clarification_request` and `rephrase_request` are **non-follow-up signals** — they don't count toward `follow_up_turns`, saturation, dry-topic detection, or the variety ban. The candidate isn't penalized for asking to repeat.
- If `clarification_request` fires twice on the same topic, it escalates to MOVE_ON (question is fundamentally unclear or candidate is confused).

**Example — Saturation Flow:**
```
Topic: "Lead Generation" (HIGH importance)
Candidate: Mid band → threshold = 5.5, base_credit = 0.9

Turn 1: Overall=6.2 → contribution=1.84, base=0.9 → sat=2.74
Turn 2: Overall=4.5 → contribution=1.09, base=0.79 → sat=4.62
Turn 3: Overall=5.8 → contribution=1.66, base=0.9 → sat=7.18
→ SATURATED (7.18 ≥ 5.5) → MOVE_ON
```

**Example — Weak Exit:**
```
Turn 1: Overall=2.0 → sat=0.35 (well below 50% of 5.5 at turn 1 — no exit yet)
Turn 2: Overall=1.5 → sat=0.53 (way below 50% at turn 3 — weak exit fires)
→ MOVE_ON (candidate can't reach threshold)
```

---

## Stage 4: Next Question Generation

Two paths depending on routing decision. Both paths avoid scripting — they provide principles, not templates. The interview LLM ("Ishita") writes her own question.

### Path A: PROBE (Stay on Topic)

**File:** `probe_strategy.py` + `agent_runtime.py:_build_probe_directive()`

The detected signal selects a **probe definition** with:
- `goal` — the ONE thing to surface
- `question_type` — e.g., MEMORY RETRIEVAL, FLOOR FINDER, HANDS-ON VERIFICATION
- `principles` — how to frame the question
- `voice_note` — example human phrasing
- `skip` — what NOT to do
- `band_overlay` — depth adjustment per signal × band

**What gets injected into the LLM prompt:**

```
SIGNAL: example_evaded
WHAT: They gave a general rule when a real story was asked for.
TRIGGER: "usually I check the data first"
GOAL: Get one specific moment that actually happened.
QUESTION TYPE: MEMORY RETRIEVAL
PRINCIPLES:
  - Pin it to a specific moment — "one time", "that one instance"
  - Invite imperfection — ask what went wrong or surprised them
  - Make it impossible to answer with "usually" again
VOICE: "Give me one specific time that happened — not generally, one real instance."
SKIP: Never ask "can you give me an example" — too easy to dodge again.
BAND (mid): Push for a real work moment — a specific project or client.
```

**Sub-concept rotation:** If a topic has a `probe_focus` list (e.g., `["chunking", "embedding", "retrieval"]`), consecutive probes rotate through different items so follow-ups hit fresh angles.

**Angle pivot (same signal 2× in a row):** Forces a switch to a different sub-concept entirely instead of asking another follow-up on the same angle.

**Reaction tone:** The opener varies based on signal intent (not a generic "Mm"):
- `explanation_shallow` → "That's a big claim —"
- `tool_named_not_used` → "Okay, [tool] —"
- `scenario_untested` → "Right, that flow makes sense —"

### Path B: MOVE_ON (Switch Topics)

**File:** `agent_runtime.py:_generate_move_on_directive()`

Picks the next topic from the unified pool via `_next_uncovered_topic()`.

**Tag-based framing** determines question style:
| Tag | Framing |
|-----|---------|
| RESUME_TOPIC | "You did this — ask about what they built/owned/decided" |
| JD_TOPIC | "Role requires it — ask neutrally about exposure" |
| ROLE_TOPIC | "Expert domain check — ask about thinking/approach" |

**Semantic overlap detection:** `_topics_overlap()` uses Jaccard similarity + title containment on topic text, description, and tech stack to prevent asking about the same thing twice.

**Pre-fire optimization:** MOVE_ON directive is generated in parallel with evaluation (using `asyncio.gather`) to eliminate serial wait time.

**TOPIC_LOCK injection:** A critical instruction closes the previous topic before opening the new one.

### Path C: WRAP_UP

When no topics remain, a WRAP_UP directive tells the LLM to close naturally and call `end_call`.

### Question-Generation System Prompt

The `QUESTION_GENERATION_SYSTEM` in `probe_strategy.py` instructs Ishita:
1. Open with a reaction grounded in a specific word they said
2. Ask ONE question (one question mark only)
3. Reference something specific they actually said
4. Match the question type from the directive
5. Never use filler like "Great!" or "Can you..."

---

## End-to-End Example Walkthrough

### Turn-by-Turn for a Technical Candidate (Mid, Java Developer)

**Setup:** Pool = [Spring Boot (CRITICAL), Hibernate (HIGH), Docker (MED), Kafka (LOW)]

```
┌──────┬──────────────────────────────┬──────────┬────────┬──────────┬──────────────────────────────────────┐
│ Turn │ Answer Type                  │ Overall  │ Signal │ Route   │ Next Action                         │
├──────┼──────────────────────────────┼──────────┼────────┼──────────┼──────────────────────────────────────┤
│  1   │ "I use Spring Boot" —        │   3.1    │ tool_  │ PROBE   │ "You mentioned Spring Boot — what    │
│      │ generic, no usage detail     │          │ named_ │         │ did you actually build with it?"     │
│      │                              │          │ not_   │         │                                      │
│      │                              │          │ used   │         │                                      │
├──────┼──────────────────────────────┼──────────┼────────┼──────────┼──────────────────────────────────────┤
│  2   │ "I built a REST API with     │   5.8    │ tech_  │ PROBE   │ "You went with PostgreSQL — why      │
│      │ Spring Boot + PostgreSQL."   │          │ choice_│         │ that over MongoDB for the API?"      │
│      │ Shows usage, no why          │          │ unjust │         │                                      │
├──────┼──────────────────────────────┼──────────┼────────┼──────────┼──────────────────────────────────────┤
│  3   │ "PostgreSQL because we had   │   7.5    │ none   │ MOVE_ON │ "You've used Hibernate as well — how │
│      │ relational data, needed ACID │          │        │ (SAT)   │ do you typically configure it?"      │
│      │ compliance."                 │          │        │         │ → Moves to Hibernate topic           │
├──────┼──────────────────────────────┼──────────┼────────┼──────────┼──────────────────────────────────────┤
│  4   │ "I've used Hibernate but     │   2.0    │ depth_ │ PROBE   │ "No worries — what part of           │
│      │ I don't really know ..."     │          │ ceiling│         │ Hibernate did you actually get your  │
│      │ (tried, ran out)             │          │ _hit   │         │ hands on, even briefly?"             │
├──────┼──────────────────────────────┼──────────┼────────┼──────────┼──────────────────────────────────────┤
│  5   │ "I just used it for basic    │   3.5    │ depth_ │ PROBE   │ (depth_ceiling_hit banned now —      │
│      │ CRUD, nothing advanced"      │          │ ceiling│         │ rotation picks ownership_ambiguous)  │
│      │                              │          │ _hit   │         │ "You mentioned the team — what part  │
│      │                              │          │ (banned│         │ of the Hibernate setup was yours?"   │
│      │                              │          │ → rerolled to    │                                  │
│      │                              │          │   ownership_amb) │                                  │
├──────┼──────────────────────────────┼──────────┼────────┼──────────┼──────────────────────────────────────┤
│  6   │ "Well I did the entity       │   5.0    │ tech_  │ MOVE_ON │ "Docker — have you containerized     │
│      │ mappings myself" + usage     │          │ choice_│ (weak   │ any of these Spring Boot apps?"      │
│      │ but no why                   │          │ unjust │ exit at │ → Moves to Docker                    │
│      │                              │          │        │ turn 3) │                                      │
└──────┴──────────────────────────────┴──────────┴────────┴──────────┴──────────────────────────────────────┘
```

---

## Recovery & Edge Cases

| Failure Mode | Handling |
|-------------|----------|
| Both LLM calls timeout | Returns low-confidence recovery scores (overall=1.3), signal=None → fallback classifier picks best-fit signal |
| Signal classification returns invalid signal | Fallback `_classify_signal_from_answer()` compares answer against all signal definitions, picks strongest match |
| Variety rule violated (banned signal returned) | Post-hoc enforcement re-runs classifier with banned signals excluded |
| MOVE_ON directive LLM call fails | Rule-based fallback generates the directive |
| Empty answer | Returned as `pure_denial` with scores=0 |
| Warmup turns | Skipped entirely (scores=0, forced MOVE_ON) |

---

## File Map

| File | Role |
|------|------|
| `agent_scoring.py` | Stage 1+2: parallel quality scoring + response/content signal classification |
| `eval_pipeline.py` | Stage 3: TopicState saturation tracking, routing decision |
| `probe_strategy.py` | Stage 4a: probe definitions per signal, band overlays, reaction tones |
| `agent_runtime.py` | Orchestration: builds probe/move-on directives, tracks topic pool |
| `agent_persistence.py` | Saves per-turn scores and signals to DB |
| `report_pipeline.py` | Post-interview report generation + IntegrityEngine scoring |
| `extraction_resume_JD_score_report_v2/` | Pre-interview resume + JD scoring (separate system) |
