"""The agent must ASK, not answer.

Reported from demo: "it's saying both the question and the answer." The turn
states the answer as a declarative lead-in and then asks the question, e.g.
"A list is mutable and a tuple is immutable. What happens if you modify a
tuple?" -- 18 words, one '?', so every pre-existing check passed it while the
candidate had nothing left to answer.

False positives are the dangerous direction here: TRACE/DECIDE/DIAGNOSE
questions legitimately open with a concrete scenario, and flagging those would
suppress exactly the question shapes the prompt asks for.
"""
import pytest

from interview.agent_runtime import validate_spoken_question

SELF_ANSWER = "agent answered its own question"


def _flagged(text: str) -> bool:
    return any(SELF_ANSWER in v for v in validate_spoken_question(text))


@pytest.mark.parametrize(
    "text",
    [
        "A list is mutable and a tuple is immutable. What happens if you try to modify a tuple?",
        "Got it. So dictionaries use hashing for O(1) lookup. Why would you pick a dict over a list?",
        "Right, tuples are hashable because they are immutable. Where would that matter?",
        "The GIL serialises bytecode execution. So how would you get real parallelism?",
        "Correct, indexes speed up reads but slow writes. When would you skip one?",
        "Exactly. Redis keeps everything in memory, that is why it is fast. What breaks at scale?",
    ],
)
def test_turns_that_state_the_answer_are_flagged(text):
    assert _flagged(text), f"should have been flagged: {text!r}"


@pytest.mark.parametrize(
    "text",
    [
        # Short reaction + question -- the shape the prompt actually asks for.
        "Nice. What made you pick that approach?",
        "Got it. Why would you pick a dict over a list?",
        "Hmm. Where would you check first?",
        "Right. What happens on a cache miss?",
        "Okay, interesting. Walk me through what happens when the cache misses.",
        # TRACE: concrete case the candidate is placed inside.
        "You append to one of two names pointing at the same list -- what does the other see?",
        # DECIDE: situation + choice.
        "You look up 10k records by id constantly. List or dict, and why?",
        "Storing user sessions you look up by token constantly -- list or dict?",
        # DIAGNOSE: a narrative failure scenario, not a factual claim.
        "A three-table join suddenly got slow. What is your first check?",
        "Imagine the queue backs up overnight. What do you check first?",
        "Your service just started returning 500s. Where do you look?",
    ],
)
def test_legitimate_question_shapes_are_not_flagged(text):
    assert not _flagged(text), f"false positive on: {text!r}"


def test_sentinel_and_empty_are_untouched():
    assert validate_spoken_question("") == []
    assert validate_spoken_question("NO_FOLLOW_UP_NEEDED") == []


def test_question_with_no_declarative_lead_is_fine():
    assert not _flagged("What does the other variable see?")
