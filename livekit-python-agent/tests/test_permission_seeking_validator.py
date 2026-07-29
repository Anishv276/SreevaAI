"""The interviewer drives the session: it must never hand control to the
candidate ("shall we move on?") or fish for validation of its own turn
("does that make sense?").

Observed in demo: after the candidate answered, the agent explained the answer
back and then asked permission to continue, which stalls the interview.
validate_spoken_question() flags these so llm_node regenerates instead of
speaking them.
"""
import pytest

from interview.agent_runtime import validate_spoken_question

PERMISSION_VIOLATION = "permission-seeking"


def _permission_flagged(text: str) -> bool:
    return any(PERMISSION_VIOLATION in v for v in validate_spoken_question(text))


@pytest.mark.parametrize(
    "text",
    [
        "Right, exactly. Should I move on?",
        "Shall we move on to the next question?",
        "Good. Do you want to move to the next one?",
        "Okay. Would you like me to continue?",
        "Are you ready for the next question?",
        "Ready to move on?",
        "Should we proceed?",
        "So the GIL serialises bytecode execution. Does that make sense?",
        "Is that clear?",
        "Did that make sense?",
    ],
)
def test_permission_seeking_turns_are_flagged(text):
    assert _permission_flagged(text), f"should have been flagged: {text!r}"


@pytest.mark.parametrize(
    "text",
    [
        # Ordinary interview questions -- must never trip the rule.
        "Nice. What made you pick that approach?",
        "A three-table join suddenly got slow -- what is your first check?",
        "What does that error message tell you?",
        "Walk me through what happens when the cache misses.",
        # 'move' used as real technical content, not as a request to proceed.
        "How would you move that computation off the hot path?",
        "When would you want to move data to cold storage?",
        # 'make sense' as part of a genuine question about the candidate's view.
        "Which of those two designs makes more sense to you here?",
    ],
)
def test_legitimate_questions_are_not_flagged(text):
    assert not _permission_flagged(text), f"false positive on: {text!r}"


def test_sentinel_and_empty_are_untouched():
    assert validate_spoken_question("") == []
    assert validate_spoken_question("NO_FOLLOW_UP_NEEDED") == []
