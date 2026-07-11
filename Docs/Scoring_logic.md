# Scoring Logic â€” Interview Evaluation System (End to End)

## Architecture Overview

Every candidate answer flows through a 4-stage pipeline:

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ â‘  Response   â”‚    â”‚ â‘¡ Content    â”‚    â”‚ â‘¢ Saturation â”‚    â”‚ â‘£ Next       â”‚
â”‚ Signal       â”‚â”€â”€â”€â–¶â”‚ Scoring +    â”‚â”€â”€â”€â–¶â”‚ + Routing    â”‚â”€â”€â”€â–¶â”‚ Question     â”‚
â”‚ Detection    â”‚    â”‚ Signal Class â”‚    â”‚ Decision     â”‚    â”‚ Generation   â”‚
â”‚ (G0 gates)   â”‚    â”‚ (G1-G7)      â”‚    â”‚              â”‚    â”‚ (Probe/Move) â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Files involved:**
- `agent_scoring.py` â€” Stage 1+2: two parallel LLM calls (quality + response/content signal)
- `eval_pipeline.py` â€” Stage 3: routing decision, saturation tracking
- `probe_strategy.py` â€” Stage 4 probe strategy (how to follow up per signal)
- `agent_runtime.py` â€” Orchestrates everything, builds directives

---

## Stage 1: Response-Signal Detection (G0)

**File:** `agent_scoring.py` (`_call_signal_classification`) Â· Runs in parallel with quality scoring.

A single LLM call classifies the answer into one of 5 response-level signals.
If any fires, scoring is short-circuited.

| Signal | Meaning | Action |
|--------|---------|--------|
| `pure_denial` | "I don't know" â€” zero attempt, nothing substantive | MOVE_ON, scores=0 |
| `denial_with_continuation` | "I haven't done X, but I built Y" â€” denial + real content | Continue scoring, cap at 5.0 |
| `clarification_request` | "Can you rephrase?" / "What do you mean?" | REPHRASE (re-ask clearer) |
| `rephrase_request` | "Let me say that again" / "I misspoke" | ACCEPT_REPHRASE (use corrected answer) |
| `off_topic` | Answered a completely different question | REDIRECT (re-ask original) |

**Example:**
```
Q: "How do you handle Kubernetes scaling?"
A: "I don't know Kubernetes, but I deployed a Docker Compose setup once"
â†’ signal = denial_with_continuation â†’ scores capped at 5, probe on Docker experience
```

---

## Stage 2: Content Scoring + Signal Classification (Parallel)

**File:** `agent_scoring.py` Â· Two concurrent LLM calls.

### Call 1: Quality Scoring (`_call_scoring`)

Evaluates 4 dimensions, weighted:

```
overall = clarity Ã— 0.20 + depth Ã— 0.35 + specificity Ã— 0.20 + grounding Ã— 0.25
```

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| **Clarity** | 20% | Did they answer what was asked, not a safer version? |
| **Depth** | 35% | Did they explain HOW and WHY, not just WHAT? |
| **Specificity** | 20% | Operational detail only a real practitioner would have (numbers, constraints, failures â€” NOT tool names) |
| **Grounding** | 25% | Does it sound like real lived work? Friction, imperfect recall, reflection? |

**Band-adjusted anchors** â€” the bar rises with seniority:
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
| `explanation_shallow` | Loud claim ("I built it all") + hollow explanation | "I built the whole RAG system myself" â€” can't describe any part |
| `tool_named_not_used` | Named a tool, zero usage shown | "ChromaDB, FAISS, Pinecone" â€” no operational verb with any of them |
| `tech_choice_unjustified` | Used a tool, never said WHY that one | "I stored embeddings in ChromaDB. It worked fine." â€” why not Pinecone? |
| `scenario_untested` | Correct textbook flow, no friction | "Chunks â†’ vectors â†’ store â†’ search" â€” no edge case, no failure |

**Variety rule:** If `depth_ceiling_hit` already fired on this topic, the LLM must pick a different signal (e.g., `tool_named_not_used`). This ensures every follow-up question probes a fresh angle.

**Fallback:** If both LLM calls fail (timeout), returns low-confidence recovery scores (overall=1.3) and `signal=None`. The fallback classifier (`_classify_signal_from_answer`) then picks the best-fit content signal.

### Response-Signal Score Overrides

After both calls complete, response signals override quality scores:

| Signal | Effect |
|--------|--------|
| `pure_denial` | All scores â†’ 0.0 |
| `denial_with_continuation` | All scores capped at 5.0 |
| `clarification_request` | All scores â†’ 0.0, re-ask |
| `rephrase_request` | All scores â†’ 0.0, accept new answer |
| `off_topic` | All scores â†’ 0.0, redirect |

**Example 1 â€” Strong Answer (HR, Experienced):**
```
Q: "Walk me through a difficult hiring campaign."
A: "We needed 8 engineers in 60 days. 3 required niche ML experience,
    maybe 150 qualified people in the country. I decided to go direct
    on LinkedIn â€” sent about 300 messages myself. We filled 6 of 8.
    The other 2 dragged because the hiring manager kept changing the
    spec â€” I should have locked that down earlier."

Clarity=9, Depth=8, Specificity=8, Grounding=9 â†’ Overall=8.7
Signal=none â†’ MOVE_ON
```

**Example 2 â€” Prepared Faker (Senior, Technical):**
```
Q: "Tell me about a system you designed end to end."
A: "I designed a lead qualification pipeline using n8n. I chose n8n
    over Zapier because it's self-hostable and cost-effective at scale.
    It would ingest leads, enrich via Clearbit, score by ICP criteria,
    and route qualified ones to CRM. It improved lead quality."

Clarity=7, Depth=5 (borrowed reasoning cap), Specificity=3 (tool names only),
Grounding=3 (senior: clean narrative with no friction cap) â†’ Overall=4.1
Signal=tool_named_not_used â†’ PROBE
```

**Example 3 â€” Signal with Variety Rule:**
```
Turn 1: "I built RAG pipeline, used ChromaDB ..." â†’ signal = tool_named_not_used
Turn 2: "I used ChromaDB for storing embeddings, it worked fine."
         â†’ tool_named_not_used is BANNED (already fired)
         â†’ LLM picks tech_choice_unjustified instead ("why ChromaDB not Pinecone?")
```

---

## Stage 3: Saturation & Routing Decision

**File:** `eval_pipeline.py`

### TopicState â€” Per-Topic Saturation Tracker

Each topic has a `TopicState` that tracks:

```
saturation_score += base_turn_credit + contribution
is_saturated = saturation_score >= saturation_threshold
```

Where:
- `contribution = clamp((weighted - 2.0) / 8.0 Ã— 3.5, 0.0, 3.5)`
- `base_turn_credit` is band-aware and importance-aware (0.6â€“1.4)
- `saturation_threshold` is band-aware (2.5â€“11.0 depending on band + importance)

**Band-Aware Thresholds:**

| Band | CRITICAL | HIGH | MEDIUM | LOW |
|------|----------|------|--------|-----|
| Fresher | 5.5 | 5.0 | 5.0 | 2.5 |
| Mid | 7.0 | 5.5 | 4.0 | 3.0 |
| Experienced | 9.0 | 7.0 | 5.0 | 3.5 |
| Senior | 11.0 | 8.5 | 6.0 | 4.0 |

### Routing Decision (Priority Order)

1. **Response signal** (pure_denial, etc.) â†’ forced action from signal
2. **Clarification escalation** (2Ã— clarification_request) â†’ MOVE_ON
3. **Dry topic** (2 consecutive zero-score answers) â†’ MOVE_ON
4. **Weak exit** (turn â‰¥3 with <50% saturation, or turn â‰¥5) â†’ MOVE_ON
5. **Saturated** (score â‰¥ threshold) â†’ MOVE_ON
6. **Else** â†’ PROBE

### Clarification/Dry-Topic Edge Cases

- `clarification_request` and `rephrase_request` are **non-follow-up signals** â€” they don't count toward `follow_up_turns`, saturation, dry-topic detection, or the variety ban. The candidate isn't penalized for asking to repeat.
- If `clarification_request` fires twice on the same topic, it escalates to MOVE_ON (question is fundamentally unclear or candidate is confused).

**Example â€” Saturation Flow:**
```
Topic: "Lead Generation" (HIGH importance)
Candidate: Mid band â†’ threshold = 5.5, base_credit = 0.9

Turn 1: Overall=6.2 â†’ contribution=1.84, base=0.9 â†’ sat=2.74
Turn 2: Overall=4.5 â†’ contribution=1.09, base=0.79 â†’ sat=4.62
Turn 3: Overall=5.8 â†’ contribution=1.66, base=0.9 â†’ sat=7.18
â†’ SATURATED (7.18 â‰¥ 5.5) â†’ MOVE_ON
```

**Example â€” Weak Exit:**
```
Turn 1: Overall=2.0 â†’ sat=0.35 (well below 50% of 5.5 at turn 1 â€” no exit yet)
Turn 2: Overall=1.5 â†’ sat=0.53 (way below 50% at turn 3 â€” weak exit fires)
â†’ MOVE_ON (candidate can't reach threshold)
```

---

## Stage 4: Next Question Generation

Two paths depending on routing decision. Both paths avoid scripting â€” they provide principles, not templates. The interview LLM ("Ishita") writes her own question.

### Path A: PROBE (Stay on Topic)

**File:** `probe_strategy.py` + `agent_runtime.py:_build_probe_directive()`

The detected signal selects a **probe definition** with:
- `goal` â€” the ONE thing to surface
- `question_type` â€” e.g., MEMORY RETRIEVAL, FLOOR FINDER, HANDS-ON VERIFICATION
- `principles` â€” how to frame the question
- `voice_note` â€” example human phrasing
- `skip` â€” what NOT to do
- `band_overlay` â€” depth adjustment per signal Ã— band

**What gets injected into the LLM prompt:**

```
SIGNAL: example_evaded
WHAT: They gave a general rule when a real story was asked for.
TRIGGER: "usually I check the data first"
GOAL: Get one specific moment that actually happened.
QUESTION TYPE: MEMORY RETRIEVAL
PRINCIPLES:
  - Pin it to a specific moment â€” "one time", "that one instance"
  - Invite imperfection â€” ask what went wrong or surprised them
  - Make it impossible to answer with "usually" again
VOICE: "Give me one specific time that happened â€” not generally, one real instance."
SKIP: Never ask "can you give me an example" â€” too easy to dodge again.
BAND (mid): Push for a real work moment â€” a specific project or client.
```

**Sub-concept rotation:** If a topic has a `probe_focus` list (e.g., `["chunking", "embedding", "retrieval"]`), consecutive probes rotate through different items so follow-ups hit fresh angles.

**Angle pivot (same signal 2Ã— in a row):** Forces a switch to a different sub-concept entirely instead of asking another follow-up on the same angle.

**Reaction tone:** The opener varies based on signal intent (not a generic "Mm"):
- `explanation_shallow` â†’ "That's a big claim â€”"
- `tool_named_not_used` â†’ "Okay, [tool] â€”"
- `scenario_untested` â†’ "Right, that flow makes sense â€”"

### Path B: MOVE_ON (Switch Topics)

**File:** `agent_runtime.py:_generate_move_on_directive()`

Picks the next topic from the unified pool via `_next_uncovered_topic()`.

**Tag-based framing** determines question style:
| Tag | Framing |
|-----|---------|
| RESUME_TOPIC | "You did this â€” ask about what they built/owned/decided" |
| JD_TOPIC | "Role requires it â€” ask neutrally about exposure" |
| ROLE_TOPIC | "Expert domain check â€” ask about thinking/approach" |

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
â”Œâ”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Turn â”‚ Answer Type                  â”‚ Overall  â”‚ Signal â”‚ Route   â”‚ Next Action                         â”‚
â”œâ”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  1   â”‚ "I use Spring Boot" â€”        â”‚   3.1    â”‚ tool_  â”‚ PROBE   â”‚ "You mentioned Spring Boot â€” what    â”‚
â”‚      â”‚ generic, no usage detail     â”‚          â”‚ named_ â”‚         â”‚ did you actually build with it?"     â”‚
â”‚      â”‚                              â”‚          â”‚ not_   â”‚         â”‚                                      â”‚
â”‚      â”‚                              â”‚          â”‚ used   â”‚         â”‚                                      â”‚
â”œâ”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  2   â”‚ "I built a REST API with     â”‚   5.8    â”‚ tech_  â”‚ PROBE   â”‚ "You went with PostgreSQL â€” why      â”‚
â”‚      â”‚ Spring Boot + PostgreSQL."   â”‚          â”‚ choice_â”‚         â”‚ that over MongoDB for the API?"      â”‚
â”‚      â”‚ Shows usage, no why          â”‚          â”‚ unjust â”‚         â”‚                                      â”‚
â”œâ”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  3   â”‚ "PostgreSQL because we had   â”‚   7.5    â”‚ none   â”‚ MOVE_ON â”‚ "You've used Hibernate as well â€” how â”‚
â”‚      â”‚ relational data, needed ACID â”‚          â”‚        â”‚ (SAT)   â”‚ do you typically configure it?"      â”‚
â”‚      â”‚ compliance."                 â”‚          â”‚        â”‚         â”‚ â†’ Moves to Hibernate topic           â”‚
â”œâ”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  4   â”‚ "I've used Hibernate but     â”‚   2.0    â”‚ depth_ â”‚ PROBE   â”‚ "No worries â€” what part of           â”‚
â”‚      â”‚ I don't really know ..."     â”‚          â”‚ ceilingâ”‚         â”‚ Hibernate did you actually get your  â”‚
â”‚      â”‚ (tried, ran out)             â”‚          â”‚ _hit   â”‚         â”‚ hands on, even briefly?"             â”‚
â”œâ”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  5   â”‚ "I just used it for basic    â”‚   3.5    â”‚ depth_ â”‚ PROBE   â”‚ (depth_ceiling_hit banned now â€”      â”‚
â”‚      â”‚ CRUD, nothing advanced"      â”‚          â”‚ ceilingâ”‚         â”‚ rotation picks ownership_ambiguous)  â”‚
â”‚      â”‚                              â”‚          â”‚ _hit   â”‚         â”‚ "You mentioned the team â€” what part  â”‚
â”‚      â”‚                              â”‚          â”‚ (bannedâ”‚         â”‚ of the Hibernate setup was yours?"   â”‚
â”‚      â”‚                              â”‚          â”‚ â†’ rerolled to    â”‚                                  â”‚
â”‚      â”‚                              â”‚          â”‚   ownership_amb) â”‚                                  â”‚
â”œâ”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  6   â”‚ "Well I did the entity       â”‚   5.0    â”‚ tech_  â”‚ MOVE_ON â”‚ "Docker â€” have you containerized     â”‚
â”‚      â”‚ mappings myself" + usage     â”‚          â”‚ choice_â”‚ (weak   â”‚ any of these Spring Boot apps?"      â”‚
â”‚      â”‚ but no why                   â”‚          â”‚ unjust â”‚ exit at â”‚ â†’ Moves to Docker                    â”‚
â”‚      â”‚                              â”‚          â”‚        â”‚ turn 3) â”‚                                      â”‚
â””â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Recovery & Edge Cases

| Failure Mode | Handling |
|-------------|----------|
| Both LLM calls timeout | Returns low-confidence recovery scores (overall=1.3), signal=None â†’ fallback classifier picks best-fit signal |
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
| `extraction_resume_JD_score_report/` | Pre-interview resume + JD scoring (separate system) |
