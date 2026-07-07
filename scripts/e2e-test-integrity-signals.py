"""
e2e-test-integrity-signals.py

End-to-end verification that all 10 browser-side proctoring signals survive
to the DB after interview completion + raw JSON dump of what's in the DB.

Usage:
  python scripts/e2e-test-integrity-signals.py --app-id <id> [--keep]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SIGNAL_CATALOG: list[dict] = [
    {"eventType": "tab_switch",        "severity": "medium", "reason": "Candidate switched browser tab"},
    {"eventType": "fullscreen_exit",   "severity": "high",  "reason": "Candidate exited fullscreen mode"},
    {"eventType": "window_focus_loss", "severity": "medium", "reason": "Candidate's browser window lost focus"},
    {"eventType": "face_absence",       "severity": "high",  "reason": "No face detected in frame"},
    {"eventType": "multiple_faces",     "severity": "high",  "reason": "Multiple faces detected"},
    {"eventType": "identity_mismatch",  "severity": "high",  "reason": "Face does not match reference"},
    {"eventType": "camera_disabled",    "severity": "medium", "reason": "Camera was turned off"},
    {"eventType": "microphone_disabled", "severity": "medium", "reason": "Microphone was muted"},
    {"eventType": "connection_lost",    "severity": "high",  "reason": "Network connection lost"},
    {"eventType": "answer_integrity", "severity": "high", "reason": "AI-generated phrasing and cross-turn contradiction detected",
     "score": 82, "phrasing_score": 78, "consistency_score": 82,
     "quotes": ["it's worth noting that leveraging this approach is crucial"]},
]


def _make_test_events() -> list[dict]:
    now_ms = int(time.time() * 1000)
    return [{**sig, "timestamp": now_ms + i * 1000} for i, sig in enumerate(SIGNAL_CATALOG)]


async def _get_pool():
    from interview.agent_persistence import DatabasePool
    return await DatabasePool.get()


async def _find_or_create_interview(pool, app_id: str | None) -> str:
    aid = app_id
    if not aid:
        aid = f"test-int-{uuid.uuid4().hex[:12]}"
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO "Application" (id, "driveId", "fullName", "email")
                   VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING""",
                aid, "test-drive-id", "Test Candidate", "test@example.com",
            )
            await conn.execute(
                """INSERT INTO "Interview" (id, "applicationId", "accessToken", status)
                   VALUES ($1, $2, $3, $4) ON CONFLICT ("applicationId") DO NOTHING""",
                f"int-{uuid.uuid4().hex[:12]}", aid, uuid.uuid4().hex, "IN_PROGRESS",
            )
        print(f"[SETUP] Created throwaway interview applicationId={aid}")
    else:
        print(f"[SETUP] Using existing interview applicationId={aid}")
    return aid


async def _write_events(pool, app_id: str, events: list[dict]) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE "Interview" SET "integritySignals" = $1, "updatedAt" = NOW()
               WHERE "applicationId" = $2""",
            json.dumps(events),
            app_id,
        )
    print(f"[WRITE] Inserted {len(events)} proctoring events into integritySignals")


async def _read_events(pool, app_id: str) -> list[dict]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT "integritySignals" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
            app_id,
        )
    if not row or not row["integritySignals"]:
        return []
    raw = row["integritySignals"]
    result = raw if isinstance(raw, list) else (json.loads(raw) if isinstance(raw, str) else [])
    return result


async def _read_raw_json(pool, app_id: str) -> str | None:
    """Return the raw integritySignals value as a pretty-printed JSON string."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            'SELECT "integritySignals" FROM "Interview" WHERE "applicationId" = $1 LIMIT 1',
            app_id,
        )
    if not row:
        return None
    raw = row["integritySignals"]
    if isinstance(raw, list):
        return json.dumps(raw, indent=2)
    if isinstance(raw, str):
        # Already a JSON string from the DB; pretty-print it
        try:
            parsed = json.loads(raw)
            return json.dumps(parsed, indent=2)
        except (json.JSONDecodeError, TypeError):
            return raw
    return str(raw)


async def _delete_test_data(pool, app_id: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute('DELETE FROM "Interview" WHERE "applicationId" = $1', app_id)
        await conn.execute('DELETE FROM "Application" WHERE id = $1', app_id)
    print(f"[CLEANUP] Deleted test rows for {app_id}")


async def main():
    parser = argparse.ArgumentParser(description="E2E integrity signals test")
    parser.add_argument("--app-id", help="Existing applicationId (omit to create throwaway)")
    parser.add_argument("--keep", action="store_true", help="Keep test data after run")
    args = parser.parse_args()

    if not os.environ.get("DATABASE_URL"):
        print("ERROR: DATABASE_URL not set.")
        sys.exit(1)

    test_events = _make_test_events()
    print("=== Integrity Signals E2E Test ===\n")
    print("Test events being inserted:")
    for ev in test_events:
        print(f"  {ev['eventType']:22s}  severity={ev['severity']:6s}  ts={ev['timestamp']}")

    pool = await _get_pool()
    app_id = await _find_or_create_interview(pool, args.app_id)
    cleanup_needed = not args.app_id and not args.keep

    try:
        # Step 1: Write browser events (simulating API route)
        await _write_events(pool, app_id, test_events)

        # Step 2: Read back raw JSON from DB
        print("\n--- RAW JSON IN DB (AFTER WRITE) ---")
        raw_before = await _read_raw_json(pool, app_id)
        print(raw_before)

        before = json.loads(raw_before) if isinstance(raw_before, str) else []
        assert len(before) == len(SIGNAL_CATALOG), (
            f"Expected {len(SIGNAL_CATALOG)} events before persist, got {len(before)}"
        )
        print(f"\n[VERIFY] Pre-persist: {len(before)} events in DB [OK]")

        # Step 3: Call persist_transcript with empty proctoring_data (real agent path)
        from interview.agent_persistence import persist_transcript
        await persist_transcript(
            app_id=app_id,
            transcript_lines=["Q: Hello", "A: Hi there"],
            start_time=time.time() - 120,
            proctoring_data={"events": []},
            final_status="COMPLETED",
        )
        print(f"[PERSIST] persist_transcript() completed [OK]")

        # Step 3b: Call persist_latency_signals with synthetic answer_scores
        from interview.agent_persistence import persist_latency_signals
        answer_scores = [
            {"turn": 1, "response_latency_sec": 2.5, "question": "Q1", "answer": "A1"},
            {"turn": 2, "response_latency_sec": 4.2, "question": "Q2", "answer": "A2"},
            {"turn": 3, "response_latency_sec": 1.8, "question": "Q3", "answer": "A3"},
            {"turn": 4, "response_latency_sec": 6.0, "question": "Q4", "answer": "A4"},
            {"turn": 5, "response_latency_sec": 3.1, "question": "Q5", "answer": "A5"},
        ]
        await persist_latency_signals(app_id, answer_scores)
        print(f"[LATENCY] persist_latency_signals() completed [OK]")

        # Step 4: Read back raw JSON again and verify
        print("\n--- RAW JSON IN DB (AFTER PERSIST + LATENCY) ---")
        raw_after = await _read_raw_json(pool, app_id)
        print(raw_after)

        after = json.loads(raw_after) if isinstance(raw_after, str) else []
        after_count = len(after)
        after_types = {e.get("eventType") or e.get("signal_name", "") for e in after}
        browser_event_types = {sig["eventType"] for sig in SIGNAL_CATALOG}
        latency_events = [e for e in after if e.get("eventType") == "latency_mismatch"]
        browser_events_found = {e.get("eventType") or e.get("signal_name", "") for e in after if e.get("eventType") != "latency_mismatch"}

        print(f"\n--- Summary ---")
        print(f"Browser events before:  {len(before)}")
        print(f"Browser events after:   {len([e for e in after if e.get('eventType') != 'latency_mismatch'])}")
        print(f"Latency events added:   {len(latency_events)}")
        print(f"Total events in DB:     {len(after)}")
        print(f"Browser types found:    {sorted(browser_events_found)}")
        print(f"Latency turn map:       {latency_events[0].get('latency_sec', {}) if latency_events else {}}")

        # Verifications
        all_good = True

        missing_browser = browser_event_types - browser_events_found
        if missing_browser:
            print(f"[FAIL] Missing browser signal types: {missing_browser}")
            all_good = False

        expected_total = len(SIGNAL_CATALOG) + 1
        if len(after) < expected_total:
            print(f"[FAIL] Expected {expected_total} total events ({len(SIGNAL_CATALOG)} browser + 1 latency), got {len(after)}")
            all_good = False

        missing_ts = [e for e in after if not e.get("timestamp")]
        if missing_ts:
            print(f"[FAIL] {len(missing_ts)} events missing timestamps")
            all_good = False

        per_turn = {}
        if latency_events:
            ev = latency_events[0]
            per_turn = ev.get("latency_sec", {})
            expected_latencies = {"turn_1": 2.5, "turn_2": 4.2, "turn_3": 1.8, "turn_4": 6.0, "turn_5": 3.1}
            for k, expected in expected_latencies.items():
                got = per_turn.get(k)
                if got is None or abs(got - expected) > 0.01:
                    print(f"[FAIL] {k}: expected {expected}s, got {got}s")
                    all_good = False
        else:
            print(f"[FAIL] No latency_mismatch events found")
            all_good = False

        if all_good:
            print(f"\n[PASS] All signals preserved + latency events verified")
            print(f"\nBrowser events in DB:")
            for i, ev in enumerate([e for e in after if e.get('eventType') != 'latency_mismatch'], 1):
                name = ev.get("eventType") or ev.get("signal_name", "?")
                sev = ev.get("severity", "?")
                ts = ev.get("timestamp", "?")
                print(f"  {i:2d}. {name:22s}  severity={sev:6s}  timestamp={ts}")
            print(f"\nLatency event in DB:")
            print(f"  1. latency_mismatch  turns={list(per_turn.keys())}  severity=medium  timestamp={ev['timestamp']}")
            for k, v in per_turn.items():
                print(f"       {k}: {v}s")

    finally:
        if cleanup_needed:
            await _delete_test_data(pool, app_id)
        else:
            print(f"\n[INFO] Test data preserved at applicationId={app_id}")


if __name__ == "__main__":
    asyncio.run(main())
