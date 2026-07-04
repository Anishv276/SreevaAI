"""Tests for integrity signals persistence fix.

Two bugs fixed:
1. persist_transcript() final save overwrote integritySignals with empty array
2. IntegrityEngine.score() had dead fallback `evt.get("event")` that never matched

Run:  python -m pytest tests/test_integrity_signals_persistence.py -v
"""
from __future__ import annotations

import json
import math
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Test 1: IntegrityEngine.score counts browser signals correctly
# ---------------------------------------------------------------------------
def test_score_with_browser_signals():
    from interview.report_pipeline import IntegrityEngine

    browser_signals = [
        {"signal_name": "tab_switch", "severity": "medium", "timestamp": 1700000000000},
        {"signal_name": "face_absence", "severity": "high", "timestamp": 1700000001000},
        {"signal_name": "multiple_faces", "severity": "high", "timestamp": 1700000002000},
        {"signal_name": "tab_switch", "severity": "low", "timestamp": 1700000003000},
        {"signal_name": "identity_mismatch", "severity": "high", "timestamp": 1700000004000},
        {"signal_name": "camera_disabled", "severity": "medium", "timestamp": 1700000005000},
        {"signal_name": "microphone_disabled", "severity": "medium", "timestamp": 1700000006000},
        {"signal_name": "connection_lost", "severity": "high", "timestamp": 1700000007000},
    ]

    result = IntegrityEngine.score(browser_signals)

    # Penalties: tab_switch=-10*2, face_absence=-15, multiple_faces=-25,
    # identity_mismatch=-20, camera_disabled=-15, microphone_disabled=-8,
    # connection_lost=-12  => total -115
    assert result["score"] == 0
    assert result["band"] == "LOW"
    assert len(result["signals_used"]) == 7
    # 2 tab_switches, but capped at 3 so still counted once in signals_used
    assert result["signals_used"].count("tab_switch") == 1


def test_score_with_old_event_type_fallback_ignored():
    """Ensure the dead `evt.get("event")` fallback is removed so only
    `signal_name` key is used."""
    from interview.report_pipeline import IntegrityEngine

    browser_signals = [
        {"event": "tab_switch", "severity": "medium", "timestamp": 1700000000000},
        {"signal_name": "face_absence", "severity": "high", "timestamp": 1700000001000},
    ]

    result = IntegrityEngine.score(browser_signals)

    # "event" key entries should NOT be counted since fallback was removed
    assert "tab_switch" not in result["signals_used"]
    assert result["signals_used"] == ["face_absence"]


def test_score_empty_signals():
    from interview.report_pipeline import IntegrityEngine

    result = IntegrityEngine.score([])
    assert result["score"] == 100
    assert result["band"] == "HIGH"
    assert result["signals_used"] == []


# ---------------------------------------------------------------------------
# Helper: create an async context manager mock for pool.acquire()
# ---------------------------------------------------------------------------
def _mock_acquire(conn):
    """Return a mock that acts like an async context manager for pool.acquire()."""
    ctx = AsyncMock()
    ctx.__aenter__ = AsyncMock(return_value=conn)
    ctx.__aexit__ = AsyncMock(return_value=None)
    return ctx


# ---------------------------------------------------------------------------
# Test 2: persist_transcript preserves existing browser signals
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_persist_transcript_preserves_existing_signals():
    from interview.agent_persistence import persist_transcript

    existing_signals = [
        {"signal_name": "tab_switch", "severity": "medium", "timestamp": 1700000000000},
        {"signal_name": "face_absence", "severity": "high", "timestamp": 1700000001000},
    ]

    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value={"integritySignals": existing_signals})
    mock_conn.execute = AsyncMock()

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=_mock_acquire(mock_conn))

    with (
        patch("interview.agent_persistence.DatabasePool.get", AsyncMock(return_value=mock_pool)),
        patch("interview.agent_persistence.logger", MagicMock()),
    ):
        await persist_transcript(
            app_id="test_app_123",
            transcript_lines=["Q: Hello", "A: Hi"],
            start_time=time.time(),
            proctoring_data={"events": []},
            final_status="COMPLETED",
        )

    call_args = mock_conn.execute.call_args
    assert call_args is not None, "Expected conn.execute() to be called"

    sql, *params = call_args[0]
    saved_signals = json.loads(params[3])
    assert len(saved_signals) == 2
    assert saved_signals[0]["signal_name"] == "tab_switch"
    assert saved_signals[1]["signal_name"] == "face_absence"


@pytest.mark.asyncio
async def test_persist_transcript_with_no_existing_signals():
    from interview.agent_persistence import persist_transcript

    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value={"integritySignals": None})
    mock_conn.execute = AsyncMock()

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=_mock_acquire(mock_conn))

    with (
        patch("interview.agent_persistence.DatabasePool.get", AsyncMock(return_value=mock_pool)),
        patch("interview.agent_persistence.logger", MagicMock()),
    ):
        await persist_transcript(
            app_id="test_app_123",
            transcript_lines=["Q: Hello", "A: Hi"],
            start_time=time.time(),
            proctoring_data={"events": []},
            final_status="COMPLETED",
        )

    call_args = mock_conn.execute.call_args
    sql, *params = call_args[0]
    saved_signals = json.loads(params[3])
    assert saved_signals == []


@pytest.mark.asyncio
async def test_persist_transcript_handles_null_row():
    from interview.agent_persistence import persist_transcript

    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value=None)
    mock_conn.execute = AsyncMock()

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=_mock_acquire(mock_conn))

    with (
        patch("interview.agent_persistence.DatabasePool.get", AsyncMock(return_value=mock_pool)),
        patch("interview.agent_persistence.logger", MagicMock()),
    ):
        await persist_transcript(
            app_id="test_app_123",
            transcript_lines=["Q: Hello", "A: Hi"],
            start_time=time.time(),
            proctoring_data={"events": []},
            final_status="COMPLETED",
        )

    call_args = mock_conn.execute.call_args
    sql, *params = call_args[0]
    saved_signals = json.loads(params[3])
    assert saved_signals == []


# ---------------------------------------------------------------------------
# Test 3: persist_latency_signals appends a single event with per-turn map
# ---------------------------------------------------------------------------
def _make_answer_scores(turn_count: int, base_latency: float = 2.0) -> list[dict]:
    return [
        {"turn": i + 1, "response_latency_sec": base_latency * (i + 1),
         "question": f"Q{i+1}", "answer": f"A{i+1}"}
        for i in range(turn_count)
    ]


@pytest.mark.asyncio
async def test_persist_latency_signals_appends_to_existing():
    from interview.agent_persistence import persist_latency_signals

    existing_browser_signals = [
        {"eventType": "tab_switch", "timestamp": 1700000000000},
    ]
    answer_scores = _make_answer_scores(3, 2.0)

    fetchrow_responses = [{"integritySignals": existing_browser_signals}]

    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(side_effect=lambda *a, **kw: fetchrow_responses.pop(0) if fetchrow_responses else None)
    mock_conn.execute = AsyncMock()

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=_mock_acquire(mock_conn))

    with (
        patch("interview.agent_persistence.DatabasePool.get", AsyncMock(return_value=mock_pool)),
        patch("interview.agent_persistence.logger", MagicMock()),
    ):
        await persist_latency_signals("test_app_123", answer_scores)

    call_args = mock_conn.execute.call_args
    assert call_args is not None, "Expected conn.execute() to be called"

    sql, *params = call_args[0]
    merged = json.loads(params[0])
    assert len(merged) == 2  # 1 browser + 1 latency event
    assert merged[0]["eventType"] == "tab_switch"

    latency = merged[1]
    assert latency["eventType"] == "latency_mismatch"
    assert latency["severity"] == "medium"
    assert isinstance(latency["timestamp"], int)
    assert latency["timestamp"] > 0
    assert latency["latency_sec"] == {"turn_1": 2.0, "turn_2": 4.0, "turn_3": 6.0}


@pytest.mark.asyncio
async def test_persist_latency_signals_no_scores():
    from interview.agent_persistence import persist_latency_signals

    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock()
    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=_mock_acquire(mock_conn))

    with (
        patch("interview.agent_persistence.DatabasePool.get", AsyncMock(return_value=mock_pool)),
        patch("interview.agent_persistence.logger", MagicMock()),
    ):
        await persist_latency_signals("test_app_123", [])

    mock_conn.execute.assert_not_called()


@pytest.mark.asyncio
async def test_persist_latency_signals_skips_zero_latency():
    from interview.agent_persistence import persist_latency_signals

    answer_scores = [
        {"turn": 1, "response_latency_sec": 0.0},
        {"turn": 2, "response_latency_sec": None},
        {"turn": 3, "response_latency_sec": 3.5},
    ]

    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value=None)
    mock_conn.execute = AsyncMock()

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=_mock_acquire(mock_conn))

    with (
        patch("interview.agent_persistence.DatabasePool.get", AsyncMock(return_value=mock_pool)),
        patch("interview.agent_persistence.logger", MagicMock()),
    ):
        await persist_latency_signals("test_app_123", answer_scores)

    call_args = mock_conn.execute.call_args
    sql, *params = call_args[0]
    merged = json.loads(params[0])
    assert len(merged) == 1
    assert merged[0]["eventType"] == "latency_mismatch"
    assert merged[0]["latency_sec"] == {"turn_3": 3.5}
