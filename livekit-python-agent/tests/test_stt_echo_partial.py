"""STT self-echo: the agent's own TTS bleeding into the candidate's mic must
never be scored as a candidate answer.

The whole-utterance similarity checks only fired when the mic captured
substantially the ENTIRE agent turn. The common real bleed is a fragment --
usually the tail, because the candidate's mic opens as the agent finishes. Such
a fragment scored low against the full question and was treated as a genuine
answer, so the eval pipeline probed on it. To the candidate that looks like the
agent replying to something they never said, right after they finished
speaking.

False positives are worse than misses here: wrongly flagging a real answer
makes the agent re-ask a question the candidate just answered. The
must-not-catch cases below guard that direction.
"""
import pytest

from interview.agent_runtime import _looks_like_interviewer_echo

Q_DICT = "Storing user sessions you look up by token constantly, list or dict, and why?"
Q_LIST = "You point two variables at the same list and append to one, what does the other see?"
# What TTS actually spoke: reaction prefix + question. _last_interviewer_question
# holds only the question, so a bleed spanning the boundary matches this but not that.
SPOKEN = "Got it. " + Q_DICT


@pytest.mark.parametrize(
    "text,reference",
    [
        ("storing user sessions you look up by token constantly list or dict and why", Q_DICT),
        ("list or dict and why", Q_DICT),               # tail bleed
        ("what does the other see", Q_LIST),            # tail bleed
        ("you look up by token constantly", Q_DICT),    # mid bleed
        ("got it storing user sessions you look up by token", SPOKEN),  # reaction + question
    ],
)
def test_agent_audio_bleed_is_detected(text, reference):
    assert _looks_like_interviewer_echo(text, reference), f"missed echo: {text!r}"


@pytest.mark.parametrize(
    "text,reference",
    [
        ("I would use a dict because token lookup is O of one instead of scanning", Q_DICT),
        ("It sees the appended element since both names point at the same object", Q_LIST),
        ("A dict definitely", Q_DICT),
        ("Dict for sure, list would mean scanning every session on each request", Q_DICT),
        ("The other variable would see the change too", Q_LIST),
        ("yes", Q_DICT),
        ("Hmm let me think about that for a second", Q_DICT),
        # Reuses the question's exact key terms but in the candidate's own
        # sentence -- vocabulary overlap without a long contiguous verbatim run.
        ("List or dict really depends on how often you read versus write", Q_DICT),
    ],
)
def test_genuine_answers_are_not_flagged(text, reference):
    assert not _looks_like_interviewer_echo(text, reference), f"false positive: {text!r}"


def test_empty_inputs_are_safe():
    assert not _looks_like_interviewer_echo("", Q_DICT)
    assert not _looks_like_interviewer_echo("list or dict", "")
    assert not _looks_like_interviewer_echo("", "")


def test_very_short_text_never_trips():
    """Below the length floor nothing can be classified as an echo."""
    assert not _looks_like_interviewer_echo("dict", Q_DICT)
