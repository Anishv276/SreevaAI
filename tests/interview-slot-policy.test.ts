import assert from "node:assert/strict";
import {
  getSlotJoinDeadline,
  isEmailMatchCaseInsensitive,
  isValidSlotBoundary,
  roundToNextSlotBoundary,
} from "../lib/interview-slot-policy";

function run(): void {
  {
    const now = new Date("2026-05-20T09:00:00.000Z");
    const rounded = roundToNextSlotBoundary(now, 30);
    assert.equal(rounded.toISOString(), "2026-05-20T09:00:00.000Z");
  }

  {
    const now = new Date("2026-05-20T09:05:00.000Z");
    const rounded = roundToNextSlotBoundary(now, 30);
    assert.equal(rounded.toISOString(), "2026-05-20T09:30:00.000Z");
  }

  {
    assert.equal(isValidSlotBoundary(new Date("2026-05-20T09:30:00.000Z"), 30), true);
    assert.equal(isValidSlotBoundary(new Date("2026-05-20T09:20:00.000Z"), 30), false);
    assert.equal(isValidSlotBoundary(new Date("2026-05-20T09:30:30.000Z"), 30), false);
  }

  {
    assert.equal(
      isEmailMatchCaseInsensitive("  Candidate@Example.com ", "candidate@example.com"),
      true
    );
    assert.equal(
      isEmailMatchCaseInsensitive("candidate+1@example.com", "candidate@example.com"),
      false
    );
  }

  {
    const slotStart = Date.parse("2026-05-20T09:00:00.000Z");
    const deadline = getSlotJoinDeadline(slotStart, 10);
    assert.equal(new Date(deadline).toISOString(), "2026-05-20T09:10:00.000Z");
  }

  console.log("interview-slot-policy tests passed");
}

run();

