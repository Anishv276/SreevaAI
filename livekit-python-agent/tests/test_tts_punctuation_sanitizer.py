"""Sarvam TTS punctuation normalization.

Punctuation is the only pacing control we have over synthesized speech, and
each pause character costs a different amount of hold time. Measured on
bulbul:v3 with identical wording, only punctuation varied:

    em-dash     504ms total pause   <- cheapest
    comma       646-927ms
    ellipsis   1069ms               <- most draggy

So every pause-bearing character is normalized to an em-dash. Ellipsis used to
be rewritten to ", ", which turned the worst option into the second worst.

The rules must NOT damage compound words (end-to-end), negative numbers, or
genuine list commas -- those regressions are what the ordering guards against.
"""
import pytest

from interview.agent_runtime_utils import TextSanitizer

EM = "—"


def clean(text: str) -> str:
    return TextSanitizer.apply_tts_phonetic_fixes(text, provider="SARVAM")


@pytest.mark.parametrize(
    "text",
    [
        "Right - so what happens then?",     # spaced single hyphen used as a dash
        "Right -- so what happens then?",    # double hyphen
        "Right " + EM + " so what happens then?",  # already an em-dash
        "Hmm... so what did they say back?",       # ellipsis
        "Wait..... really?",                        # long ellipsis
    ],
)
def test_pause_characters_become_em_dash(text):
    out = clean(text)
    assert EM in out, f"expected an em-dash in {out!r}"
    assert "..." not in out, "ellipsis must never reach Sarvam"


def test_ellipsis_does_not_become_a_comma():
    """Regression: ellipsis -> ", " swapped the draggiest character for the
    second draggiest instead of the cheapest."""
    out = clean("Hmm... so what next?")
    assert "," not in out
    assert EM in out


@pytest.mark.parametrize(
    "text,expected_fragment",
    [
        ("We use end-to-end encryption here.", "end to end"),
        ("A multi-channel rollout works.", "multi channel"),
    ],
)
def test_compound_words_are_spaced_not_dashed(text, expected_fragment):
    out = clean(text)
    assert expected_fragment in out
    assert EM not in out, "a hyphenated compound is not a pause"


def test_compound_word_and_dash_in_same_sentence():
    """Ordering guard: the spaced-hyphen rule runs first, so it must not eat the
    hyphens inside a compound word, and the compound rule must not swallow the
    dash."""
    out = clean("We use end-to-end encryption - where does it break?")
    assert "end to end" in out
    assert EM in out


def test_negative_numbers_are_untouched():
    out = clean("Set it to -5 and retry.")
    assert "-5" in out
    assert EM not in out


def test_bare_opening_filler_gets_a_comma():
    assert clean("Right so what next?").startswith("Right,")


def test_filler_before_a_dash_is_not_double_punctuated():
    """"Right, —" would be a comma AND a dash: two stacked holds."""
    out = clean("Right " + EM + " what next?")
    assert "," not in out


def test_genuine_list_commas_survive():
    """Comma count does not drive Sarvam's pause count (measured), so ordinary
    commas are left alone rather than stripped."""
    out = clean("You look up records by id, constantly, in a loop.")
    assert out.count(",") == 2


def test_markdown_is_stripped():
    out = clean("This is **bold** and _under_.")
    assert "*" not in out and "_" not in out
    assert "bold" in out and "under" in out
