import asyncio

import agent
import prompt_layers


def _collect_async_iter(async_iter):
    async def _run():
        items = []
        async for item in async_iter:
            items.append(item)
        return items

    return asyncio.run(_run())


def test_float_and_risk_helpers():
    assert agent._safe_float(3) == 3.0
    assert agent._safe_float(" 2.5 ") == 2.5
    assert agent._safe_float("") is None
    assert agent._safe_float("not-a-number") is None

    assert agent.compose_risk_score(50, 50) == 50
    assert agent.compose_risk_score(200, 200) == 100
    assert agent.compose_mode_risk_score(50, 50) == 58
    assert agent.compose_mode_risk_score(0, 0) == 0


def test_alias_hints_and_basic_text_helpers():
    assert agent.build_term_alias_hints("We use Apollo.io and Salesforce for outbound.") == (
        "- apollo -> Apollo.io\n- salesforce -> Salesforce"
    )
    assert agent.build_term_alias_hints("No stack mentioned") == (
        "- No strong alias hints from context. If unclear, confirm once, then move on."
    )

    assert agent.safe_parse({"name": "Alice", "score": 10}) == "  name: Alice\n  score: 10"
    assert agent.safe_parse(["one", "two"]) == "  - one\n  - two"
    assert agent.safe_parse(None) == "Not provided"


def test_role_and_name_helpers():
    assert agent.detect_role_category("Senior Frontend Engineer") == "engineering"
    assert agent.detect_role_category("Account Executive") == "sales"
    assert agent.detect_role_subtype("Senior Frontend Engineer", "engineering") == "frontend"
    assert agent.detect_role_subtype("Platform DevOps Engineer", "engineering") == "devops"
    assert agent.first_name_from_full_name("  Ada Lovelace ") == "Ada"
    assert agent.first_name_from_full_name("") == ""


def test_dispatch_metadata_parser():
    parsed = agent.parse_dispatch_metadata(
        '{"applicationId":"app_123","candidateName":"Ada Lovelace","roleLabel":"Frontend Engineer"}'
    )

    assert parsed["applicationId"] == "app_123"
    assert parsed["candidateName"] == "Ada Lovelace"
    assert parsed["roleLabel"] == "Frontend Engineer"
    assert agent.parse_dispatch_metadata("not-json") == {}


def test_prompt_layers_include_extra_context():
    voice_prompt = prompt_layers.build_voice_layer_prompt(
        candidate_name="Ada",
        job_title="Frontend Engineer",
        time_limit_mins=45,
        depth_instruction="Stay concise.",
        candidate_band="mid",
        ai_name="Ishitha",
        org_name="Acme",
        org_location="Toronto",
        drive_location="Remote",
    )

    evaluation_prompt = prompt_layers.build_evaluation_layer_prompt(
        live_prompt_context="",
        candidate_name="Ada",
        job_title="Frontend Engineer",
        time_limit_mins=45,
        depth_instruction="Stay concise.",
        candidate_band="mid",
        ai_name="Ishitha",
        org_name="Acme",
        org_location="Toronto",
        drive_location="Remote",
    )

    assert "Interviewer name: Ishitha" in voice_prompt
    assert "Organization: Acme" in voice_prompt
    assert "Drive location: Remote" in evaluation_prompt
    assert "Candidate band: mid" in evaluation_prompt


def test_resume_band_inference():
    assert agent.infer_candidate_band({"experience": {"total_years": 0.8}}, "") == "fresher"
    assert agent.infer_candidate_band({"experienceYears": 6}, "") == "experienced"
    assert agent.infer_candidate_band({"experience_years": 12}, "") == "senior"
    assert agent.infer_candidate_band({}, "final year student with internship experience") == "fresher"


def test_build_interview_turns_groups_speakers():
    turns = agent.build_interview_turns(
        [
            "Interviewer: Tell me about yourself.",
            "Candidate: I am a backend engineer.",
            "Candidate: I have five years of experience.",
            "Interviewer: Why this role?",
            "Candidate: It matches my interests.",
        ]
    )

    assert turns == [
        {
            "turn": 1,
            "question": "Tell me about yourself.",
            "answer": "I am a backend engineer. I have five years of experience.",
            "questionSpeaker": "Interviewer",
            "answerSpeaker": "Candidate",
        },
        {
            "turn": 2,
            "question": "Why this role?",
            "answer": "It matches my interests.",
            "questionSpeaker": "Interviewer",
            "answerSpeaker": "Candidate",
        },
    ]


def test_single_question_transform_truncates_after_first_question():
    async def _source():
        yield "Hello. First question? Second question? Final line."

    chunks = _collect_async_iter(agent._single_question_transform(_source()))
    assert chunks == ["Hello. First question?"]


def test_single_question_transform_keeps_one_question_with_followup_text():
    async def _source():
        yield "Please answer this one question? Thanks."

    chunks = _collect_async_iter(agent._single_question_transform(_source()))
    assert chunks == ["Please answer this one question? Thanks."]
