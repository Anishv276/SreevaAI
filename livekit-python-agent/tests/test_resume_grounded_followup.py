"""
Resume-grounded follow-up sourcing (Branch A) vs. the unchanged concept probe
(Branch B).

Covers the two cases from the spec plus the guardrails that make Branch A safe:
  - a clear JD-skill <-> resume-project match fires Branch A and names the project
  - no match falls back to Branch B with the pre-existing directive text intact
  - the three provenance fields are populated correctly on both paths
  - a shared buzzword with no real overlap does NOT count as a match
  - metrics are only ever cited when the resume actually states them
  - response-shape signals never take Branch A
"""
from __future__ import annotations

import pytest

from interview.tech.brief import TopicItem
from interview.tech.probe import get_probe_context
from interview.tech.resume_match import (
    extract_tested_skill,
    find_resume_match,
    follow_up_provenance,
)


# ---------------------------------------------------------------------------
# Fixtures -- one resume, three projects, mirroring the spec's worked example.
# ---------------------------------------------------------------------------
RESUME = {
    "full_name": "Test Candidate",
    "projects": [
        {
            "name": "Sentiment & Rating Analysis",
            "description": (
                "Sentiment and rating analysis system on 50K+ Amazon reviews using LSTM, "
                "served via FastAPI in Docker. Reached 89.5% accuracy on the held-out set."
            ),
            "technologies": ["Python", "LSTM", "TensorFlow", "FastAPI", "Docker"],
        },
        {
            "name": "Warehouse Stock Dashboard",
            "description": (
                "Internal dashboard showing live stock levels per warehouse, built with "
                "React and a Postgres read replica."
            ),
            "technologies": ["React", "Postgres", "TypeScript"],
        },
        {
            "name": "InsightRAG",
            "description": (
                "Wiki question-answering bot over 12k internal documents using Pinecone "
                "for vector search and a reranking step before generation."
            ),
            "technologies": ["Python", "Pinecone", "LangChain"],
        },
    ],
    "skills": {"technical": ["Python", "LSTM", "FastAPI", "Docker", "React", "Postgres"]},
}

RESUME_NO_METRICS = {
    "projects": [
        {
            "name": "Order Queue Rework",
            "description": "Reworked the order pipeline onto Kafka topics with a retry path.",
            "technologies": ["Kafka", "Java"],
        }
    ],
}


def _topic(title: str, tech: list[str], focus: str = "", desc: str = "") -> TopicItem:
    return TopicItem(
        id="t1",
        topic_type="skill",
        title=title,
        full_description=desc,
        tech_stack=tech,
        probe_focus=focus,
    )


def _probe(**kw):
    """get_probe_context with the required args defaulted, returning
    (directive_text, provenance_dict).

    topic_follow_ups defaults to 1 -- TopicState.follow_up_turns as the real
    runtime actually presents it on a topic's FIRST probe (eval.py increments the
    counter before the directive is built, so the first real turn is 1, not 0 --
    see the ONCE PER TOPIC comment in get_probe_context). This is the only value
    Branch A is eligible on. Tests exercising the once-per-topic gate pass a
    higher value explicitly.
    """
    prov: dict = {}
    base = dict(
        signal="depth_shallow",
        signal_reason="named LSTM but gave no internal detail",
        level=2,
        topic_follow_ups=1,
        topic_denied=False,
        prev_answer="I'd use an LSTM for that, it handles sequences well.",
        prev_question="Which model would you reach for on review text?",
        provenance_out=prov,
    )
    base.update(kw)
    return get_probe_context(**base), prov


# ---------------------------------------------------------------------------
# Step 1 -- tested skill extraction
# ---------------------------------------------------------------------------
def test_tested_skill_prefers_probe_focus_over_the_raw_question_wording():
    """The competency, not the keyword -- a narrow question phrasing must not
    become the thing we search the resume for."""
    topic = _topic(
        "Generators",
        ["Python"],
        focus="memory-efficient lazy iteration over large sequences",
    )
    skill = extract_tested_skill(
        topic_item=topic,
        active_topic="Generators",
        prev_question="why a generator over a list comprehension?",
    )
    assert "lazy iteration" in skill
    assert "Generators" in skill


# ---------------------------------------------------------------------------
# Step 2 -- match detection
# ---------------------------------------------------------------------------
def test_exact_tool_match_is_found_and_high_confidence():
    topic = _topic("Deep Learning (LSTM)", ["LSTM", "TensorFlow"])
    m = find_resume_match(
        resume_json=RESUME,
        tested_skill=extract_tested_skill(topic_item=topic),
        topic_item=topic,
    )
    assert m.is_match
    assert m.project_title == "Sentiment & Rating Analysis"
    assert m.tier == "exact_tool"
    assert m.confidence >= 0.60


def test_technique_family_match_bridges_deep_learning_to_lstm():
    """JD says 'Deep Learning', resume says 'LSTM' -- zero shared characters,
    so this can only work via the technique-family lookup."""
    topic = _topic("Deep Learning", [], focus="neural sequence models on text")
    m = find_resume_match(
        resume_json=RESUME,
        tested_skill=extract_tested_skill(topic_item=topic),
        topic_item=topic,
    )
    assert m.is_match
    assert m.project_title == "Sentiment & Rating Analysis"


def test_no_match_for_a_skill_absent_from_every_project():
    topic = _topic(
        "Kubernetes autoscaling",
        ["Kubernetes", "HPA"],
        focus="horizontal pod autoscaling under bursty load",
    )
    m = find_resume_match(
        resume_json=RESUME,
        tested_skill=extract_tested_skill(topic_item=topic),
        topic_item=topic,
    )
    assert not m.is_match


def test_shared_buzzword_alone_is_not_a_match():
    """'system' / 'analysis' style vocabulary overlap must not clear the gate --
    the spec calls this out explicitly as a no-match."""
    topic = _topic("Distributed consensus", [], focus="raft leader election in a system")
    m = find_resume_match(
        resume_json=RESUME,
        tested_skill=extract_tested_skill(topic_item=topic),
        topic_item=topic,
    )
    assert not m.is_match, f"buzzword collision cleared the gate via {m.project_title!r}"


def test_docker_on_a_resume_is_not_evidence_of_kubernetes_autoscaling():
    """Regression: packaging an app into a container is a different competency
    from orchestrating a fleet of them. This previously matched the LSTM project
    (it lists Docker) against a Kubernetes-autoscaling topic and would have named
    a project the candidate never did this work in."""
    topic = _topic("Kubernetes autoscaling", ["Kubernetes", "HPA"], focus="pod autoscaling")
    m = find_resume_match(
        resume_json=RESUME,
        tested_skill=extract_tested_skill(topic_item=topic),
        topic_item=topic,
    )
    assert not m.is_match, (
        f"Docker in {m.project_title!r} was treated as autoscaling experience "
        f"(tier={m.tier}, conf={m.confidence:.2f})"
    )


def test_a_bare_sql_mention_does_not_match_every_data_skill():
    """Guard on the family table's looseness: single ubiquitous tokens like 'sql'
    or 'api' must not make every backend project a category match."""
    resume = {
        "projects": [{
            "name": "Marketing Site",
            "description": "Static marketing site with a contact form writing to SQL.",
            "technologies": ["HTML", "SQL"],
        }]
    }
    topic = _topic(
        "Query optimization",
        ["Postgres"],
        focus="reading query plans and fixing a slow multi-join query",
    )
    m = find_resume_match(
        resume_json=resume,
        tested_skill=extract_tested_skill(topic_item=topic),
        topic_item=topic,
    )
    assert not m.is_match


def test_shared_language_alone_is_not_a_match():
    """Regression, caught in a dry run: 'Generators / memory-efficient lazy
    iteration' matched an LSTM sentiment project purely on the shared token
    'Python'. A language on a tech list is not evidence of any particular
    competency within that language -- the spec names this case as Branch B."""
    topic = _topic(
        "Generators / lazy iteration",
        ["Python"],
        focus="memory-efficient lazy iteration over large sequences",
    )
    m = find_resume_match(
        resume_json=RESUME,
        tested_skill=extract_tested_skill(topic_item=topic),
        topic_item=topic,
    )
    assert not m.is_match, (
        f"matched {m.project_title!r} on a bare language token "
        f"(tier={m.tier}, evidence={m.evidence})"
    )


def test_missing_resume_is_never_a_match():
    topic = _topic("Deep Learning (LSTM)", ["LSTM"])
    for empty in (None, {}, {"projects": []}):
        assert not find_resume_match(
            resume_json=empty, tested_skill="Deep Learning", topic_item=topic
        ).is_match


def test_metrics_are_extracted_verbatim_from_the_resume():
    topic = _topic("Deep Learning (LSTM)", ["LSTM"])
    m = find_resume_match(
        resume_json=RESUME, tested_skill="Deep Learning (LSTM)", topic_item=topic
    )
    joined = " ".join(m.metrics)
    assert "89.5%" in joined
    assert "50K" in joined.upper() or "50k" in joined


# ---------------------------------------------------------------------------
# Step 3 -- Branch A
# ---------------------------------------------------------------------------
def test_branch_a_directive_names_the_project_and_sets_provenance():
    topic = _topic("Deep Learning (LSTM)", ["LSTM", "TensorFlow"])
    out, prov = _probe(resume_json=RESUME, topic_item=topic, active_topic="Deep Learning (LSTM)")

    assert "FOLLOW-UP SOURCE: RESUME PROJECT" in out
    assert "Sentiment & Rating Analysis" in out
    assert prov["follow_up_source"] == "resume_project"
    assert prov["referenced_project"] == "Sentiment & Rating Analysis"
    assert "Deep Learning (LSTM)" in prov["skill_matched"]


def test_branch_a_permits_only_resume_stated_metrics():
    topic = _topic("Deep Learning (LSTM)", ["LSTM"])
    out, _ = _probe(resume_json=RESUME, topic_item=topic)
    assert "89.5%" in out
    assert "ONLY numbers you may" in out


def test_branch_a_forbids_inventing_a_metric_when_the_resume_states_none():
    """Guardrail: no stated metric -> the directive must tell the LLM to ask the
    candidate for their own number, not to assert one."""
    topic = _topic("Message queues", ["Kafka"], focus="at-least-once delivery and retries")
    out, prov = _probe(resume_json=RESUME_NO_METRICS, topic_item=topic)

    assert prov["follow_up_source"] == "resume_project"
    assert prov["referenced_project"] == "Order Queue Rework"
    assert "STATED METRICS: none" in out
    assert "may NOT cite any number" in out


def test_branch_a_bans_behavioural_and_generic_framing():
    topic = _topic("Deep Learning (LSTM)", ["LSTM"])
    out, _ = _probe(resume_json=RESUME, topic_item=topic)
    assert "tell me about a time" in out.lower()   # named as forbidden
    assert "Tell me about your project" in out     # named as forbidden
    assert "ONE question" in out


def test_branch_a_does_not_blend_in_the_answer_drill_probe():
    """The two branches must never both be live in one directive -- that is what
    produces a compound question.

    Checks for the signal's DIRECTIVE body, not for its reaction TONE: the shared
    reaction/filler policy (get_reaction_hint) is intentionally kept on Branch A so
    the interviewer's voice doesn't switch between a resume follow-up and a
    mechanism follow-up, and that policy quotes the signal's tone wording.
    """
    topic = _topic("Deep Learning (LSTM)", ["LSTM"])
    out, _ = _probe(resume_json=RESUME, topic_item=topic)

    # The depth_shallow answer-drill instructions must be absent entirely.
    assert "MECHANISM DEEP-DIVE" not in out
    assert "DIRECTIVE (verbatim framing instructions for this signal)" not in out
    assert "walk through what happens STEP BY STEP" not in out
    # ...while the Branch A instructions are the only question guidance present.
    assert "FOLLOW-UP SOURCE: RESUME PROJECT" in out


# ---------------------------------------------------------------------------
# Branch B -- must be byte-identical to the pre-change behaviour
# ---------------------------------------------------------------------------
def test_branch_b_directive_is_identical_with_and_without_a_resume():
    """The regression guard that matters most: when no project matches, passing a
    resume must change NOTHING about the directive."""
    topic = _topic("Kubernetes autoscaling", ["Kubernetes", "HPA"], focus="pod autoscaling")
    with_resume, prov = _probe(resume_json=RESUME, topic_item=topic)
    without_resume, _ = _probe(resume_json=None, topic_item=topic)

    assert with_resume == without_resume
    assert prov["follow_up_source"] == "concept_probe"
    assert prov["referenced_project"] is None
    assert prov["skill_matched"] is None


def test_branch_b_keeps_the_signals_own_probe_framing():
    topic = _topic("Kubernetes autoscaling", ["Kubernetes"], focus="pod autoscaling")
    out, _ = _probe(resume_json=RESUME, topic_item=topic)
    assert "MECHANISM DEEP-DIVE" in out
    assert "FOLLOW-UP SOURCE: RESUME PROJECT" not in out


@pytest.mark.parametrize(
    "signal", ["clarification_request", "rephrase_request", "off_topic", "pure_denial"]
)
def test_response_shape_signals_never_take_branch_a(signal):
    """A 'please repeat that' turn must not name a resume project, however well
    the skill matches."""
    topic = _topic("Deep Learning (LSTM)", ["LSTM", "TensorFlow"])
    out, prov = _probe(signal=signal, resume_json=RESUME, topic_item=topic)
    assert "FOLLOW-UP SOURCE: RESUME PROJECT" not in out
    assert prov["follow_up_source"] == "concept_probe"


def test_provenance_is_always_fully_populated_on_a_probe_turn():
    topic = _topic("Kubernetes autoscaling", ["Kubernetes"])
    _, prov = _probe(resume_json=RESUME, topic_item=topic)
    assert set(prov) == {"follow_up_source", "referenced_project", "skill_matched"}


# ---------------------------------------------------------------------------
# Once-per-topic gate.
#
# Regression #1: a live session showed the SAME project follow-up twice in a
# row on one topic (Generators) -- turn 1 asked about CPU/memory impact on the
# Multi-Document AI Research Assistant project, turn 2 asked "what caused the
# high CPU" on the SAME project, which is just turn 1 reworded. Nothing in the
# original design stopped Branch A from re-firing on every follow-up of a
# topic, because the same project keeps winning the match turn after turn.
# Branch A must fire at most once per topic.
#
# Regression #2 (found after #1 shipped): the gate was first written as
# `topic_follow_ups == 0`, which is a value the real runtime NEVER produces.
# eval.py's TopicState.add_contribution() increments follow_up_turns BEFORE
# agent_runtime reads it to build the directive, so the topic's first real
# probe already has topic_follow_ups == 1, not 0. Gating on 0 meant Branch A
# silently never fired at all in production -- confirmed against a live
# session where every follow-up fell back to a Branch B mechanism-trace that
# then repeated itself turn to turn ("walk me through what happens step by
# step..." then "how does Python pause and resume..." -- same angle, reworded).
# These tests use topic_follow_ups=1 as the eligible turn (matching _probe's
# default) specifically so a future change back to 0 fails loudly here instead
# of silently killing Branch A again.
# ---------------------------------------------------------------------------
def test_branch_a_fires_on_the_topics_first_real_followup():
    """topic_follow_ups=1 is what TopicState actually reports on turn 1 -- see
    the regression #2 note above. This must be the value the gate accepts."""
    topic = _topic("Deep Learning (LSTM)", ["LSTM", "TensorFlow"])
    out, prov = _probe(resume_json=RESUME, topic_item=topic, topic_follow_ups=1)
    assert prov["follow_up_source"] == "resume_project"
    assert "FOLLOW-UP SOURCE: RESUME PROJECT" in out


@pytest.mark.parametrize("topic_follow_ups", [2, 3, 4])
def test_branch_a_never_fires_again_later_in_the_same_topic(topic_follow_ups):
    """Even with the exact same high-confidence match available, the second and
    later follow-ups in a topic must be Branch B -- otherwise the same project
    gets asked about twice with only the wording changed."""
    topic = _topic("Deep Learning (LSTM)", ["LSTM", "TensorFlow"])
    out, prov = _probe(
        resume_json=RESUME, topic_item=topic, topic_follow_ups=topic_follow_ups
    )
    assert prov["follow_up_source"] == "concept_probe"
    assert prov["referenced_project"] is None
    assert "FOLLOW-UP SOURCE: RESUME PROJECT" not in out
    assert "MECHANISM DEEP-DIVE" in out


def test_branch_a_second_followup_directive_matches_plain_branch_b():
    """The topic's second follow-up (topic_follow_ups=2) with a resume present
    must be BYTE-IDENTICAL to the same call with no resume at all -- confirms
    the gate doesn't just suppress the project name but fully reverts to the
    untouched Branch B path."""
    topic = _topic("Deep Learning (LSTM)", ["LSTM", "TensorFlow"])
    with_resume, _ = _probe(resume_json=RESUME, topic_item=topic, topic_follow_ups=2)
    without_resume, _ = _probe(resume_json=None, topic_item=topic, topic_follow_ups=2)
    assert with_resume == without_resume


def test_follow_up_provenance_helper_shapes():
    none_case = follow_up_provenance(None)
    assert none_case == {
        "follow_up_source": "concept_probe",
        "referenced_project": None,
        "skill_matched": None,
    }


# ---------------------------------------------------------------------------
# A project with no usable title can never be named
# ---------------------------------------------------------------------------
def test_untitled_project_is_not_eligible_even_on_a_perfect_tech_match():
    resume = {"projects": [{"description": "LSTM sentiment model", "technologies": ["LSTM"]}]}
    topic = _topic("Deep Learning (LSTM)", ["LSTM"])
    m = find_resume_match(
        resume_json=resume, tested_skill="Deep Learning (LSTM)", topic_item=topic
    )
    assert not m.is_match
