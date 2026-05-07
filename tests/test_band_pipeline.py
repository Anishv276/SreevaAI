"""
End-to-end tests for the band-based question bank pipeline.
Tests: extract_critical_skills -> parse_question_bank -> filter_phase3 -> build_question_bank_injection
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent_profile_context import (
    extract_critical_skills,
    filter_phase3_by_critical_skills,
    parse_question_bank,
    build_question_bank_injection,
    QuestionBankQuestion,
    QuestionBank,
)


def test_extract_critical_skills_token_matching():
    """Test that skill matching uses token intersection, not substring."""
    jd_must_haves = [
        "Python backend development",
        "Distributed systems & microservices",
        "Database design & optimization",
    ]
    resume_skills = ["Python", "Go", "PostgreSQL", "Redis", "Docker"]

    result = extract_critical_skills(jd_must_haves, resume_skills)

    # Should match "Python" in "Python backend development"
    assert "Python backend development" in result
    # Should NOT match because "distributed systems" has no words in resume_skills
    assert "Distributed systems & microservices" not in result
    # When no matches > 1, return only matching skills (not padded to 3)
    assert len(result) == 1
    assert result[0] == "Python backend development"


def test_extract_critical_skills_no_jd_must_haves():
    """Test fallback when JD has no must-haves."""
    resume_skills = ["Python", "Go", "PostgreSQL"]
    result = extract_critical_skills([], resume_skills)
    assert result == ["Python", "Go", "PostgreSQL"]


def test_extract_critical_skills_empty_resume():
    """Test when resume has no skills."""
    jd_must_haves = ["Python", "Go", "PostgreSQL"]
    result = extract_critical_skills(jd_must_haves, [])
    assert result == jd_must_haves[:3]


def test_parse_question_bank_valid_format():
    """Test parsing a well-formed question bank."""
    llm_output = """
PHASE 1 — BACKGROUND:
Q1. [OPENING] You led a migration. Tell me more.
Strong: Specific decisions and tradeoffs.
Weak: Generic "we migrated" answers.
Probes: "What broke first?", "How did you debug it?"

PHASE 2 — (reserved)

PHASE 3 — SKILLS:
Q2. [SKILL:python] Tell me about your Python experience.
Strong: Real project with depth.
Weak: Just naming libraries.
Probes: "What's the hardest part?", "Why that approach?"

Q3. [STRENGTH] What's your strongest area?
Strong: Honest, specific.
Weak: "Everything" or too broad.
Probes: "Can you give an example?"
"""

    qb = parse_question_bank(llm_output)

    assert len(qb.phase1) == 1
    assert len(qb.phase3) == 2
    assert qb.phase1[0].tag == "OPENING"
    assert qb.phase1[0].number == 1
    assert qb.phase3[0].tag == "SKILL:python"
    assert qb.phase3[1].tag == "STRENGTH"
    assert len(qb.phase3[0].probes) == 2
    assert "What's the hardest part?" in qb.phase3[0].probes
    assert len(qb.phase1[0].probes) == 2
    assert "What broke first?" in qb.phase1[0].probes


def test_parse_question_bank_missing_phase1_raises_error():
    """Test that missing PHASE 1 header raises ValueError."""
    llm_output = """
PHASE 2 — (reserved)

PHASE 3 — SKILLS:
Q1. [SKILL:python] Python question.
Strong: Good.
Weak: Bad.
Probes: "Follow up?"
"""

    try:
        parse_question_bank(llm_output)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "phase1 has 0 questions" in str(e)


def test_parse_question_bank_missing_phase3_raises_error():
    """Test that missing PHASE 3 header raises ValueError."""
    llm_output = """
PHASE 1 — BACKGROUND:
Q1. [OPENING] Opening question.
Strong: Good.
Weak: Bad.
Probes: "Follow up?"

PHASE 2 — (reserved)
"""

    try:
        parse_question_bank(llm_output)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "phase3 has 0 questions" in str(e)


def test_parse_question_bank_malformed_question_skipped():
    """Test that malformed questions are skipped gracefully."""
    llm_output = """
PHASE 1 — BACKGROUND:
Q1. [OPENING] Valid question.
Strong: Good answer.
Weak: Bad answer.
Probes: "Follow up?"

This line has no Q number so it is skipped.

PHASE 2 — (reserved)

PHASE 3 — SKILLS:
Q2. [SKILL:python] Python question.
Strong: Expert-level understanding.
Weak: Surface-level knowledge.
Probes: "Example?", "Why?"
"""

    # Should not raise; just skip the malformed line
    qb = parse_question_bank(llm_output)
    assert len(qb.phase1) == 1
    assert len(qb.phase3) == 1


def test_parse_question_bank_probe_parsing_with_spaces():
    """Test that probe parsing handles spaces after commas."""
    llm_output = """
PHASE 1 — BACKGROUND:
Q1. [OPENING] Question?
Strong: Good.
Weak: Bad.
Probes: "Follow up 1?", "Follow up 2?", "Follow up 3?"

PHASE 2 — (reserved)

PHASE 3 — SKILLS:
Q2. [SKILL:python] Python?
Strong: Good.
Weak: Bad.
Probes: "Space after comma?",  "Double space?",   "Many spaces?"
"""

    qb = parse_question_bank(llm_output)
    assert len(qb.phase1[0].probes) == 3
    assert qb.phase1[0].probes[0] == "Follow up 1?"
    assert len(qb.phase3[0].probes) == 3
    assert qb.phase3[0].probes[0] == "Space after comma?"


def test_filter_phase3_by_critical_skills_keeps_matching_skills():
    """Test that SKILL questions matching critical_skills are kept."""
    phase3 = [
        QuestionBankQuestion(number=1, tag="SKILL:python", text="Python?", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=2, tag="SKILL:microservices", text="Microservices?", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=3, tag="SKILL:kubernetes", text="Kubernetes?", strong="", weak="", probes=[], phase=3),
    ]
    critical_skills = ["Python backend", "Distributed systems & microservices"]

    filtered = filter_phase3_by_critical_skills(phase3, critical_skills)

    # "Python" matches "Python backend" ✓
    # "Microservices" matches "Distributed systems & microservices" ✓
    # "Kubernetes" doesn't match → dropped
    assert len(filtered) == 2
    assert filtered[0].tag == "SKILL:python"
    assert filtered[1].tag == "SKILL:microservices"


def test_filter_phase3_by_critical_skills_keeps_always_keep_tags():
    """Test that STRENGTH/WEAKNESS/WATCHOUT/CUSTOM are always kept, plus fallback for skills."""
    phase3 = [
        QuestionBankQuestion(number=1, tag="SKILL:unrelated", text="Q1", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=2, tag="STRENGTH", text="Q2", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=3, tag="WEAKNESS", text="Q3", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=4, tag="WATCHOUT", text="Q4", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=5, tag="CUSTOM", text="Q5", strong="", weak="", probes=[], phase=3),
    ]
    critical_skills = ["Python"]

    filtered = filter_phase3_by_critical_skills(phase3, critical_skills)

    # When no SKILL matches, fallback takes first SKILL question (SKILL:unrelated)
    # Plus always-keep tags: STRENGTH/WEAKNESS/WATCHOUT/CUSTOM
    assert len(filtered) == 5
    assert filtered[0].tag == "SKILL:unrelated"  # fallback
    assert filtered[1].tag == "STRENGTH"
    assert filtered[2].tag == "WEAKNESS"
    assert filtered[3].tag == "WATCHOUT"
    assert filtered[4].tag == "CUSTOM"


def test_filter_phase3_by_critical_skills_fallback_no_matches():
    """Test fallback when no SKILL questions match critical_skills."""
    phase3 = [
        QuestionBankQuestion(number=1, tag="SKILL:unrelated1", text="Q1", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=2, tag="SKILL:unrelated2", text="Q2", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=3, tag="SKILL:unrelated3", text="Q3", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=4, tag="STRENGTH", text="Q4", strong="", weak="", probes=[], phase=3),
    ]
    critical_skills = ["Python"]

    filtered = filter_phase3_by_critical_skills(phase3, critical_skills)

    # Fallback: take first 3 SKILL questions regardless of match
    # Plus STRENGTH (always kept)
    assert len(filtered) == 4
    assert filtered[0].tag == "SKILL:unrelated1"
    assert filtered[1].tag == "SKILL:unrelated2"
    assert filtered[2].tag == "SKILL:unrelated3"
    assert filtered[3].tag == "STRENGTH"


def test_filter_phase3_by_critical_skills_stops_at_3_skills():
    """Test that filtering stops after 3 matching SKILL questions."""
    phase3 = [
        QuestionBankQuestion(number=1, tag="SKILL:python", text="Q1", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=2, tag="SKILL:microservices", text="Q2", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=3, tag="SKILL:database", text="Q3", strong="", weak="", probes=[], phase=3),
        QuestionBankQuestion(number=4, tag="SKILL:docker", text="Q4", strong="", weak="", probes=[], phase=3),
    ]
    critical_skills = ["Python", "Microservices", "Database", "Docker"]

    filtered = filter_phase3_by_critical_skills(phase3, critical_skills)

    # Only 3 matching SKILL questions kept
    assert len(filtered) == 3
    assert filtered[0].tag == "SKILL:python"
    assert filtered[1].tag == "SKILL:microservices"
    assert filtered[2].tag == "SKILL:database"


def test_build_question_bank_injection_formats_clean_message():
    """Test that build_question_bank_injection produces clean formatted output."""
    llm_output = """
BRIEF:
Band: mid
Tone: Direct and specific.
Depth: Expect implementation details.
Probe pressure: Push for examples.
Opener style: Start with their most recent project.

QUESTION BANK:

PHASE 1 — BACKGROUND:
Q1. [OPENING] You led a migration. Describe it.
Strong: Specific architectural decisions.
Weak: Generic team-level answers.
Probes: "What broke first?", "Why that approach?"

PHASE 2 — (reserved)

PHASE 3 — SKILLS:
Q2. [SKILL:python] Hardest Python problem?
Strong: Concrete example with reasoning.
Weak: Framework name-drop.
Probes: "How did you debug?", "Would you do it differently?"

Q3. [STRENGTH] Your strongest area?
Strong: Honest and specific.
Weak: Too broad.
Probes: "Can you elaborate?"
"""

    qb = QuestionBank(
        phase1=[
            QuestionBankQuestion(number=1, tag="OPENING", text="You led a migration. Describe it.",
                                strong="Specific architectural decisions.", weak="Generic team-level answers.",
                                probes=["What broke first?", "Why that approach?"], phase=1),
        ],
        phase3=[
            QuestionBankQuestion(number=2, tag="SKILL:python", text="Hardest Python problem?",
                                strong="Concrete example with reasoning.", weak="Framework name-drop.",
                                probes=["How did you debug?", "Would you do it differently?"], phase=3),
            QuestionBankQuestion(number=3, tag="STRENGTH", text="Your strongest area?",
                                strong="Honest and specific.", weak="Too broad.",
                                probes=["Can you elaborate?"], phase=3),
        ]
    )

    critical_skills = ["Python", "Microservices"]
    injection = build_question_bank_injection(llm_output, qb, critical_skills)

    # Should contain BRIEF fields
    assert "Band: mid" in injection
    assert "Tone: Direct and specific" in injection

    # Should contain phase structure
    assert "PHASE 1" in injection
    assert "PHASE 2" in injection
    assert "reserved" in injection
    assert "PHASE 3" in injection

    # Should contain questions in order
    assert "Q1." in injection
    assert "Q2." in injection
    assert "Q3." in injection

    # Should contain Strong/Weak/Probes
    assert "Strong:" in injection
    assert "Weak:" in injection
    assert "Probes:" in injection


if __name__ == "__main__":
    test_extract_critical_skills_token_matching()
    test_extract_critical_skills_no_jd_must_haves()
    test_extract_critical_skills_empty_resume()
    test_parse_question_bank_valid_format()
    test_parse_question_bank_missing_phase1_raises_error()
    test_parse_question_bank_missing_phase3_raises_error()
    test_parse_question_bank_malformed_question_skipped()
    test_parse_question_bank_probe_parsing_with_spaces()
    test_filter_phase3_by_critical_skills_keeps_matching_skills()
    test_filter_phase3_by_critical_skills_keeps_always_keep_tags()
    test_filter_phase3_by_critical_skills_fallback_no_matches()
    test_filter_phase3_by_critical_skills_stops_at_3_skills()
    test_build_question_bank_injection_formats_clean_message()
    print("[PASS] All pipeline tests passed!")