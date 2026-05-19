import pytest
from interview.tts_phonetic_processor import TTSPhoneticProcessor

def test_tts_phonetic_processor_static_defaults():
    processor = TTSPhoneticProcessor().initialize_defaults()
    
    # Test SQL and SaaS
    assert processor.transform("Write a SQL query.") == "Write a sequel query."
    assert processor.transform("This is a SaaS product.") == "This is a sass product."
    assert processor.transform("We use DevOps processes.") == "We use dev ops processes."
    assert processor.transform("This is powered by LiveKit.") == "This is powered by Live Kit."

def test_tts_phonetic_processor_known_acronyms():
    processor = TTSPhoneticProcessor().initialize_defaults()
    
    # Test case insensitivity and plurals for known acronyms (api, url, ui, ux, hr)
    assert processor.transform("Build an api.") == "Build an A P I."
    assert processor.transform("Check the APIs.") == "Check the A P I s."
    assert processor.transform("Shorten the url.") == "Shorten the U R L."
    assert processor.transform("We have multiple URLs.") == "We have multiple U R L s."
    assert processor.transform("The UI is clean.") == "The U I is clean."
    assert processor.transform("Review the UIs.") == "Review the U I s."
    assert processor.transform("UX design is key.") == "U X design is key."  # Wait, UX case-insensitive test:
    assert processor.transform("Review the ux.") == "Review the U X."
    assert processor.transform("Talk to the hr manager.") == "Talk to the H R manager."
    assert processor.transform("We met with different HRs.") == "We met with different H R s."

def test_tts_phonetic_processor_auto_spell_caps():
    processor = TTSPhoneticProcessor().initialize_defaults()
    
    # Test other uppercase acronyms (AWS, GCP, SDK, DNS, HTML, etc.)
    assert processor.transform("We deploy on AWS.") == "We deploy on A W S."
    assert processor.transform("Use the GCP console.") == "Use the G C P console."
    assert processor.transform("Download the SDK.") == "Download the S D K."
    assert processor.transform("The DNS server is down.") == "The D N S server is down."
    assert processor.transform("HTML and CSS are core.") == "H T M L and C S S are core."

def test_tts_phonetic_processor_blacklist():
    processor = TTSPhoneticProcessor().initialize_defaults()
    
    # Test that common uppercase words in the blacklist are NOT split
    assert processor.transform("IT is a good tool.") == "IT is a good tool."
    assert processor.transform("CAN you do this?") == "CAN you do this?"
    assert processor.transform("A NEW project starts.") == "A NEW project starts."
    assert processor.transform("WHO is this?") == "WHO is this?"
    assert processor.transform("WHY do that?") == "WHY do that?"
    assert processor.transform("NOW it works.") == "NOW it works."
    assert processor.transform("ONE more thing.") == "ONE more thing."

def test_tts_phonetic_processor_dynamic_tools():
    processor = TTSPhoneticProcessor().initialize_defaults()
    
    # Add tools
    tools = ["n8n", "make.com", "heyreach", "zapier", "instantly"]
    processor.add_tools(tools)
    
    # Test dynamic tools spelling/transformations
    assert processor.transform("We use n8n for workflow automation.") == "We use n eight n for workflow automation."
    assert processor.transform("Send it via make.com.") == "Send it via make dot com."
    assert processor.transform("We reach out using heyreach.") == "We reach out using hey reach."
    assert processor.transform("Zapier is cool.") == "zay pee er is cool."  # case insensitive
    assert processor.transform("instantly works.") == "instantly works."  # stays unchanged
