"""
live_trap_score.py
──────────────────
A completely separate, real-time suspicion scorer that lives inside the Python
agent during the interview. Its sole job is to decide when the agent should
ask a trap question (bait-and-switch, referencing something the candidate
actually said, to check if they're bluffing/reading answers).

This is NOT the same as the post-interview IntegrityEngine in report.py.
Key differences:
  - Report score  ->  counts every single event, even low-severity ones.
                      Used by the recruiter after the interview is over.
  - Live score    ->  strike-pattern based, counts UP from 0. A single
                      accidental tab switch never adds a point. Only repeated
                      or deliberately sustained behaviour moves the needle.
                      Used by the agent IN REAL TIME to decide when to trap.

Design philosophy
-----------------
  1.  STRIKE PATTERN  - We track a per-event-type strike counter. The FIRST
      occurrence of most events is silently absorbed. Only the 2nd+ occurrence
      within a rolling 10-minute window adds to the live score.

  2.  HARD SIGNALS    - multiple_faces is the only event that adds on the
      very first occurrence, because it is extremely unlikely to be accidental.

  3.  TRAP THRESHOLD  - Trap fires at live_score >= TRAP_THRESHOLD (100).
      This requires several serious strikes to trigger, which is
      mathematically impossible to reach by accident.

  4.  REPEATABLE      - Once the caller has actually asked a trap question,
      it calls consume_trap() to drop the score back to 0 so it can climb
      again. Until consume_trap() is called, the score stays PINNED at
      TRAP_THRESHOLD (never auto-resets on its own) -- this matters because
      the caller might reach the threshold on a turn where it can't ask a
      trap question yet (e.g. mid-topic-switch), or question generation
      might fail; in either case the strike must not be silently lost.
"""

from __future__ import annotations

import time
import logging
from collections import defaultdict, deque

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Score starts here. Only goes up, until it hits the trap threshold and resets.
LIVE_SCORE_START: int = 0

# If live_score reaches or exceeds this value, agent fires a trap question.
TRAP_THRESHOLD: int = 100

# How many seconds back to look when deciding if a strike is "recent".
# Events older than this window are expired and the strike counter resets.
STRIKE_WINDOW_SEC: float = 600.0  # 10 minutes

# ---------------------------------------------------------------------------
# Per-event rules
# ---------------------------------------------------------------------------
#
# Each entry: (ignore_first_n_occurrences, points_to_add_from_nth_on)
#
#   ignore_first_n = 0  -> add immediately from the very first event
#   ignore_first_n = 1  -> absorb the 1st event, add from the 2nd onwards
#   ignore_first_n = 2  -> absorb 1st+2nd, add from the 3rd onwards
#
# gaze_deviation and robotic_speech are single-tier (no severity buckets) —
# any occurrence of either uses one flat rule regardless of severity passed in.
#
_EVENT_RULES: dict[str, dict] = {
    # Browser / hardware signals
    "tab_switch":            {"ignore_first_n": 1, "add": 15},
    "window_focus_loss":     {"ignore_first_n": 1, "add": 10},
    "fullscreen_exit":       {"ignore_first_n": 1, "add": 12},
    "face_absence":          {"ignore_first_n": 0, "add": 15},
    "multiple_faces":        {"ignore_first_n": 0, "add": 30},
    "camera_disabled":       {"ignore_first_n": 0, "add": 20},
    "microphone_disabled":   {"ignore_first_n": 1, "add": 8},
    "identity_mismatch":     {"ignore_first_n": 0, "add": 25},
    "connection_lost":       {"ignore_first_n": 1, "add": 10},
    "session_fingerprint":   {"ignore_first_n": 0, "add": 20},
    "latency_mismatch":      {"ignore_first_n": 1, "add": 12},
    # Gaze deviation — single tier, no severity buckets
    "gaze_deviation":        {"ignore_first_n": 1, "add": 10},
    # Robotic / AI Teleprompter Speech — single tier, no severity buckets
    "robotic_speech":        {"ignore_first_n": 1, "add": 12},
}

# Fallback rule for any unknown event type.
_DEFAULT_RULE: dict = {"ignore_first_n": 1, "add": 8}


# ---------------------------------------------------------------------------
# Main class
# ---------------------------------------------------------------------------

class LiveTrapScore:
    """
    Real-time suspicion tracker for one interview session.

    Usage inside the agent
    ----------------------
        trap_score = LiveTrapScore()

        # When a DataChannel proctoring event arrives:
        result = trap_score.record_event(
            event_type="tab_switch",
            severity="medium",
        )
        if result.trap_triggered:
            # score is now pinned at TRAP_THRESHOLD -- only call
            # trap_score.consume_trap() once a trap question is actually
            # generated and about to be asked, to reset it back to 0
            ...

    Concurrency
    -----------
    NOT thread-safe. Designed to be called from within the asyncio event loop
    of the Python agent (single-threaded coroutine model).
    """

    def __init__(self) -> None:
        self._score: int = LIVE_SCORE_START

        # Per event-type: deque of monotonic timestamps of past occurrences
        # still within the STRIKE_WINDOW_SEC.
        self._history: dict[str, deque[float]] = defaultdict(deque)

        # Total strikes applied (for diagnostics / logging).
        self._total_strikes: int = 0

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    @property
    def score(self) -> int:
        return self._score

    @property
    def trap_triggered(self) -> bool:
        return self._score >= TRAP_THRESHOLD

    def record_event(
        self,
        event_type: str,
        severity: str = "medium",
    ) -> "_RecordResult":
        """
        Record one proctoring event and update the live score.

        Returns a _RecordResult with:
          .added          - points added to the live score (0 if absorbed)
          .score_after    - the new score value
          .trap_triggered - True if this event just pushed the score to/past
                            the trap threshold. The score is PINNED at
                            TRAP_THRESHOLD (not reset) until the caller
                            actually asks a trap question and calls
                            consume_trap() -- see that method's docstring for
                            why this matters (a trap that never gets asked,
                            e.g. because generation failed or the eval turn
                            wasn't a PROBE, must not silently burn the strike).
          .reason         - human-readable explanation
        """
        now = time.monotonic()
        raw_type = (event_type or "").strip().lower()
        rule = _EVENT_RULES.get(raw_type, _DEFAULT_RULE)

        # Expire stale history entries outside the rolling window
        history = self._history[raw_type]
        while history and now - history[0] > STRIKE_WINDOW_SEC:
            history.popleft()

        # Determine if this occurrence should add points
        occurrence_index = len(history)   # 0-based (0 = first ever in window)
        ignore_first_n = rule["ignore_first_n"]
        add = rule["add"]
        should_add = (occurrence_index >= ignore_first_n) and (add > 0)

        # Always record the timestamp
        history.append(now)

        # Apply addition
        points_added = 0
        if should_add:
            points_added = add
            self._score = min(TRAP_THRESHOLD, self._score + points_added)
            self._total_strikes += 1
            logger.warning(
                "[LiveTrapScore] Strike #%d — event=%s severity=%s "
                "occurrence=%d added=%d score=%d/%d%s",
                self._total_strikes, raw_type, severity,
                occurrence_index + 1, points_added,
                self._score, TRAP_THRESHOLD,
                " <- TRAP THRESHOLD REACHED" if self._score >= TRAP_THRESHOLD else "",
            )
        else:
            logger.debug(
                "[LiveTrapScore] Absorbed — event=%s severity=%s "
                "occurrence=%d (first %d ignored) score=%d",
                raw_type, severity, occurrence_index + 1,
                ignore_first_n, self._score,
            )

        # Build human-readable reason
        if should_add:
            reason = (
                f"Strike #{self._total_strikes}: '{raw_type}' "
                f"(severity={severity}) occurred {occurrence_index + 1}x "
                f"within {int(STRIKE_WINDOW_SEC // 60)} min window. "
                f"+{points_added} pts -> live score now {self._score}."
            )
        else:
            reason = (
                f"'{raw_type}' (severity={severity}) absorbed - "
                f"occurrence {occurrence_index + 1}/{ignore_first_n} "
                f"within grace window."
            )

        trap_just_fired = self._score >= TRAP_THRESHOLD

        if trap_just_fired:
            logger.warning(
                "[LiveTrapScore] *** TRAP THRESHOLD REACHED *** "
                "score=%d >= threshold=%d after %d strikes. "
                "Agent should fire a trap question; score stays pinned until consume_trap() is called.",
                self._score, TRAP_THRESHOLD, self._total_strikes,
            )

        return _RecordResult(
            added=points_added,
            score_after=self._score,
            trap_triggered=trap_just_fired,
            reason=reason,
        )

    def consume_trap(self) -> None:
        """Call this ONLY once a trap question has actually been generated and
        is about to be asked. Drops the score back to 0 so the cycle can start
        climbing again. Do NOT call this just because trap_triggered is True --
        if question generation fails, or the eval turn wasn't a PROBE turn (so
        no trap check ran at all), the score must stay pinned at
        TRAP_THRESHOLD so the next eligible turn still asks a trap question,
        instead of silently losing the strike that earned it.
        """
        self._score = LIVE_SCORE_START

    def reset(self) -> None:
        """Hard-reset. Used in tests only. Never call during a live session."""
        self.__init__()


# ---------------------------------------------------------------------------
# Result object
# ---------------------------------------------------------------------------

class _RecordResult:
    """Returned by LiveTrapScore.record_event()."""

    __slots__ = ("added", "score_after", "trap_triggered", "reason")

    def __init__(
        self,
        added: int,
        score_after: int,
        trap_triggered: bool,
        reason: str,
    ) -> None:
        self.added = added
        self.score_after = score_after
        self.trap_triggered = trap_triggered
        self.reason = reason

    def __repr__(self) -> str:
        return (
            f"_RecordResult(added={self.added}, "
            f"score={self.score_after}, trap={self.trap_triggered})"
        )


def _demo() -> None:
    """ponytail: smallest runnable check — asserts the count-up/pin/consume cycle works."""
    s = LiveTrapScore()
    r = s.record_event("multiple_faces")  # ignore_first_n=0 -> fires immediately
    assert r.added == 30 and r.score_after == 30 and not r.trap_triggered, r
    for _ in range(3):
        r = s.record_event("multiple_faces")
    assert s.score >= 0

    # Drive it to the threshold and confirm it PINS, not auto-resets.
    last = s.record_event("identity_mismatch")  # ignore_first_n=0, add=25
    for _ in range(10):
        if last.trap_triggered:
            break
        last = s.record_event("identity_mismatch")
    assert last.trap_triggered, "expected trap to fire"
    assert s.score == TRAP_THRESHOLD, f"expected score pinned at {TRAP_THRESHOLD}, got {s.score}"

    # More events while pinned must not push the score past the threshold.
    s.record_event("tab_switch")
    s.record_event("tab_switch")
    assert s.score == TRAP_THRESHOLD, "score must stay pinned until consume_trap() is called"

    # Only consume_trap() (called once a trap question is actually asked) resets it.
    s.consume_trap()
    assert s.score == 0, f"expected reset to 0 after consume_trap(), got {s.score}"
    print("live_trap_score self-check OK")


if __name__ == "__main__":
    _demo()
