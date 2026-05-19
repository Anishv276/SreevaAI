import pytest
from interview.agent_runtime_helpers import sanitize_candidate_facing_text

def test_sanitize_candidate_facing_text_basic():
    # Test simple stripping
    text = "Hello, how are you? <wait for response>"
    assert sanitize_candidate_facing_text(text) == "Hello, how are you?"

def test_sanitize_candidate_facing_text_bracketed_control_blocks():
    # Test that bracketed system instructions are removed
    text = "[DO NOT SAY ALOUD] Please ask about React.\nHello! Tell me about React."
    assert sanitize_candidate_facing_text(text) == "Hello! Tell me about React."

def test_sanitize_candidate_facing_text_topic_tags():
    # Test different variations of topic tags
    text = "[TOPIC:NEW]\nSo let's move to database scaling."
    assert sanitize_candidate_facing_text(text) == "So let's move to database scaling."
    
    text = "**[TOPIC:NEW]**\nSo let's move to database scaling."
    assert sanitize_candidate_facing_text(text) == "So let's move to database scaling."

    text = "*[TOPIC:FOLLOWUP]*\nTell me more about Postgres."
    assert sanitize_candidate_facing_text(text) == "Tell me more about Postgres."

    text = "   [TOPIC : FOLLOWUP]   \nHow did you handle that?"
    assert sanitize_candidate_facing_text(text) == "How did you handle that?"

def test_sanitize_candidate_facing_text_multiple_lines():
    text = (
        "**[TOPIC:NEW]**\n"
        "[STAGE 1: RESUME]\n"
        "Let's move on to the next project.\n"
        "[DO NOT SAY ALOUD: candidate seems nervous]\n"
        "Tell me about the payments microservice."
    )
    expected = "Let's move on to the next project.\nTell me about the payments microservice."
    assert sanitize_candidate_facing_text(text) == expected

def test_regex_topic_parsing():
    import re
    def parse_tag(raw_content):
        emitted_topic_tag = None
        for line in raw_content.splitlines():
            stripped = line.strip()
            tag_match = re.search(r"\[TOPIC\s*:\s*(NEW|FOLLOWUP)", stripped, re.IGNORECASE)
            if tag_match:
                emitted_topic_tag = tag_match.group(1).upper()
                break
        return emitted_topic_tag

    assert parse_tag("[TOPIC:NEW]") == "NEW"
    assert parse_tag("[TOPIC:FOLLOWUP]") == "FOLLOWUP"
    assert parse_tag("**[TOPIC:NEW]**") == "NEW"
    assert parse_tag("*[TOPIC:FOLLOWUP]*") == "FOLLOWUP"
    assert parse_tag("[TOPIC: NEW]") == "NEW"
    assert parse_tag("[TOPIC : FOLLOWUP]") == "FOLLOWUP"
    assert parse_tag("[topic:new]") == "NEW"
    assert parse_tag("[topic:followup]") == "FOLLOWUP"
    assert parse_tag("[TOPIC:NEW] some text") == "NEW"
    assert parse_tag("[TOPIC:FOLLOWUP] - text") == "FOLLOWUP"
    assert parse_tag("No tag here") is None

def test_build_stt_keywords(monkeypatch):
    import sys
    from unittest.mock import MagicMock
    
    # Mock deepgram.STT in livekit.plugins
    mock_stt_class = MagicMock()
    monkeypatch.setattr("livekit.plugins.deepgram.STT", mock_stt_class)
    
    # Mock _deepgram_supported_params to return a set of supported args
    monkeypatch.setattr("interview.agent_providers._deepgram_supported_params", lambda: {"model", "language", "keywords"})
    
    from interview.agent_providers import build_stt
    
    # Run build_stt
    build_stt(language_code="en", model="nova-3-general")
    
    # Verify that mock_stt_class was called with keywords containing instantly, heyreach, and n8n
    assert mock_stt_class.call_count == 1
    called_kwargs = mock_stt_class.call_args.kwargs
    assert "keywords" in called_kwargs
    keywords = called_kwargs["keywords"]
    assert ("instantly", 10.0) in keywords
    assert ("heyreach", 10.0) in keywords
    assert ("n8n", 10.0) in keywords

@pytest.mark.anyio
async def test_tts_acronym_transform():
    from interview.agent_runtime_helpers import _tts_acronym_transform, tts_phonetic_processor
    
    # Inject tools dynamically for the test environment
    tts_phonetic_processor.add_tools(["n8n", "heyreach", "zapier", "make.com"])
    
    async def mock_stream(chunks):
        for chunk in chunks:
            yield chunk

    # Test lowercase, uppercase, plurals, and tool pronunciation replacements
    input_chunks = [
        "Let's discuss our api and apis, as well as the new url.",
        "We are using n8n for workflows and heyreach for outreach.",
        "Have you used zapier or make.com?",
        "This is an API and a URL and SQL query."
    ]
    
    gen = _tts_acronym_transform(mock_stream(input_chunks))
    results = [chunk async for chunk in gen]
    
    assert results[0] == "Let's discuss our A P I and A P I s, as well as the new U R L."
    assert results[1] == "We are using n eight n for workflows and hey reach for outreach."
    assert results[2] == "Have you used zay pee er or make dot com?"
    assert results[3] == "This is an A P I and a U R L and sequel query."



