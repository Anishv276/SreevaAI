/**
 * verify-proctoring-signals.ts
 *
 * Verifies the proctoring signal gating contract end-to-end.
 *
 * Contract under test:
 *   - 8 "always-on" behavioral signals MUST fire regardless of the org's
 *     stored JSON value (ownership_ambiguity, ownership_clarified,
 *     resume_claim_mismatch, example_evasion, example_given,
 *     strong_under_pressure, follow_up_collapse, depth_decay).
 *   - 9 "togglable" signals MUST honor the boolean value in the org's JSON.
 *     true -> fire; false -> suppress.
 *     Togglable list: tab_switch, connection_lost, camera_disabled,
 *     microphone_disabled, face_absence, multiple_faces, identity_mismatch,
 *     latency_mismatch, complexity_latency_mismatch.
 *
 * Test surfaces:
 *   1. lib/proctoring-signals.ts  isProctoringSignalEnabled()
 *      (the runtime filter used by /api/interview/proctoring on every event).
 *   2. lib/proctoring-signals.ts  normalizeProctoringSignals()
 *      (the write-path normalizer; must force always-on to true on output).
 *   3. Plan defaults  every plan must ship with the 8 always-on signals true.
 *
 * Run:  npx tsx scripts/verify-proctoring-signals.ts
 * Exit: 0 if all pass, 1 if any fail.
 */
import {
  ALWAYS_ON_PROCTORING_SIGNALS,
  BASIC_PLAN_SIGNALS,
  GROWTH_PLAN_SIGNALS,
  SCALE_PLAN_SIGNALS,
  MANAGED_PROCTORING_SIGNALS,
  isAlwaysOnSignal,
  isProctoringSignalEnabled,
  normalizeProctoringSignals,
  type ManagedProctoringSignal,
  type ProctoringSignalToggles,
} from "../lib/proctoring-signals";
// ---------------------------------------------------------------------------
// Test infra
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}
function section(title: string) {
  console.log(`\n=== ${title} ===`);
}
// ---------------------------------------------------------------------------
// Derived expectations
// ---------------------------------------------------------------------------
const ALWAYS_ON: ManagedProctoringSignal[] = [...ALWAYS_ON_PROCTORING_SIGNALS];
const TOGGLABLE: ManagedProctoringSignal[] = MANAGED_PROCTORING_SIGNALS.filter(
  (s) => !ALWAYS_ON.includes(s),
);
console.log(`Catalog size: ${MANAGED_PROCTORING_SIGNALS.length}`);
console.log(`Always-on count: ${ALWAYS_ON.length}`);
console.log(`Togglable count: ${TOGGLABLE.length}`);
console.log(`Always-on signals: ${ALWAYS_ON.join(", ")}`);
console.log(`Togglable signals: ${TOGGLABLE.join(", ")}`);
// ---------------------------------------------------------------------------
// Section 1: structural sanity
// ---------------------------------------------------------------------------
section("Structural sanity");
assert(
  ALWAYS_ON.length === 8,
  `ALWAYS_ON has exactly 8 signals (got ${ALWAYS_ON.length})`,
);
assert(
  TOGGLABLE.length === 9,
  `TOGGLABLE has exactly 9 signals (got ${TOGGLABLE.length})`,
);
assert(
  MANAGED_PROCTORING_SIGNALS.length === 17,
  `MANAGED catalog has exactly 17 signals (got ${MANAGED_PROCTORING_SIGNALS.length})`,
);
const expectedAlwaysOn = new Set([
  "ownership_ambiguity",
  "ownership_clarified",
  "resume_claim_mismatch",
  "example_evasion",
  "example_given",
  "strong_under_pressure",
  "follow_up_collapse",
  "depth_decay",
]);
for (const k of expectedAlwaysOn) {
  assert(ALWAYS_ON.includes(k as ManagedProctoringSignal), `Always-on list contains ${k}`);
}
// duplicate_ip removal guard
assert(
  !(MANAGED_PROCTORING_SIGNALS as string[]).includes("duplicate_ip"),
  `duplicate_ip is no longer in the catalog`,
);
// ---------------------------------------------------------------------------
// Section 2: isAlwaysOnSignal classifier
// ---------------------------------------------------------------------------
section("isAlwaysOnSignal classifier");
for (const s of ALWAYS_ON) {
  assert(isAlwaysOnSignal(s), `isAlwaysOnSignal("${s}") === true`);
}
for (const s of TOGGLABLE) {
  assert(!isAlwaysOnSignal(s), `isAlwaysOnSignal("${s}") === false`);
}
assert(!isAlwaysOnSignal("nonexistent_signal"), `isAlwaysOnSignal("nonexistent_signal") === false`);
// ---------------------------------------------------------------------------
// Section 3: isProctoringSignalEnabled runtime filter
// ---------------------------------------------------------------------------
section("isProctoringSignalEnabled  always-on signals bypass the JSON gate");
// Build a hostile toggles map: every key set to false.
const allFalseToggles: ProctoringSignalToggles = Object.fromEntries(
  MANAGED_PROCTORING_SIGNALS.map((s) => [s, false]),
) as ProctoringSignalToggles;
for (const s of ALWAYS_ON) {
  assert(
    isProctoringSignalEnabled(allFalseToggles, s) === true,
    `always-on "${s}" fires even when JSON says false`,
  );
}
section("isProctoringSignalEnabled  togglable signals honor JSON false");
for (const s of TOGGLABLE) {
  assert(
    isProctoringSignalEnabled(allFalseToggles, s) === false,
    `togglable "${s}" suppressed when JSON says false`,
  );
}
section("isProctoringSignalEnabled  togglable signals honor JSON true");
const allTrueToggles: ProctoringSignalToggles = Object.fromEntries(
  MANAGED_PROCTORING_SIGNALS.map((s) => [s, true]),
) as ProctoringSignalToggles;
for (const s of TOGGLABLE) {
  assert(
    isProctoringSignalEnabled(allTrueToggles, s) === true,
    `togglable "${s}" fires when JSON says true`,
  );
}
// Unmanaged event types are allowed to pass through (legacy / new signal types
// that aren't part of the managed catalog should NOT be silently dropped).
section("isProctoringSignalEnabled  unmanaged event types pass through");
assert(
  isProctoringSignalEnabled(allFalseToggles, "some_legacy_event") === true,
  `unmanaged event "some_legacy_event" passes through (returns true)`,
);
// ---------------------------------------------------------------------------
// Section 4: normalizeProctoringSignals  write-path enforcement
// ---------------------------------------------------------------------------
section("normalizeProctoringSignals  always-on stays true even when input says false");
const tamperedInput: Record<string, boolean> = Object.fromEntries(
  MANAGED_PROCTORING_SIGNALS.map((s) => [s, false]),
);
const normalized = normalizeProctoringSignals(tamperedInput);
for (const s of ALWAYS_ON) {
  assert(normalized[s] === true, `normalize forces "${s}" to true regardless of input`);
}
for (const s of TOGGLABLE) {
  assert(
    normalized[s] === false,
    `normalize preserves togglable "${s}" = false from input`,
  );
}
section("normalizeProctoringSignals  togglable signals preserved when true");
const allTrueInput: Record<string, boolean> = Object.fromEntries(
  MANAGED_PROCTORING_SIGNALS.map((s) => [s, true]),
);
const normalizedAllTrue = normalizeProctoringSignals(allTrueInput);
for (const s of MANAGED_PROCTORING_SIGNALS) {
  assert(
    normalizedAllTrue[s] === true,
    `normalize preserves "${s}" = true from input`,
  );
}
section("normalizeProctoringSignals  handles null / undefined / non-object input");
const fromNull = normalizeProctoringSignals(null);
const fromUndefined = normalizeProctoringSignals(undefined);
const fromString = normalizeProctoringSignals("not an object");
for (const s of ALWAYS_ON) {
  assert(fromNull[s] === true, `normalize(null) sets always-on "${s}" to true`);
  assert(fromUndefined[s] === true, `normalize(undefined) sets always-on "${s}" to true`);
  assert(fromString[s] === true, `normalize("string") sets always-on "${s}" to true`);
}
section("normalizeProctoringSignals  coerces non-boolean values");
const mixedInput: Record<string, unknown> = {
  tab_switch: "true",            // string coerces to true
  connection_lost: 1,            // number coerces to true
  camera_disabled: "false",      // string coerces to false
  microphone_disabled: 0,        // number coerces to false
};
const mixedNorm = normalizeProctoringSignals(mixedInput);
assert(mixedNorm.tab_switch === true, `"true" string  true`);
assert(mixedNorm.connection_lost === true, `1 number  true`);
assert(mixedNorm.camera_disabled === false, `"false" string  false`);
assert(mixedNorm.microphone_disabled === false, `0 number  false`);
// ---------------------------------------------------------------------------
// Section 5: plan defaults
// ---------------------------------------------------------------------------
section("Plan defaults  all 3 plans include the 8 always-on signals as true");
for (const s of ALWAYS_ON) {
  assert(BASIC_PLAN_SIGNALS[s] === true, `BASIC plan has "${s}" = true`);
  assert(GROWTH_PLAN_SIGNALS[s] === true, `GROWTH plan has "${s}" = true`);
  assert(SCALE_PLAN_SIGNALS[s] === true, `SCALE plan has "${s}" = true`);
}
section("Plan defaults  togglable signals follow plan tier as documented");
// BASIC: only always-on signals are on; togglable signals are all off.
for (const s of TOGGLABLE) {
  assert(
    BASIC_PLAN_SIGNALS[s] === false,
    `BASIC plan keeps togglable "${s}" off (Starter tier)`,
  );
}
// GROWTH: adds tab_switch, camera_disabled, microphone_disabled, connection_lost,
// latency_mismatch, complexity_latency_mismatch. Leaves face / identity off.
const expectedGrowthOn: ManagedProctoringSignal[] = [
  "tab_switch",
  "camera_disabled",
  "microphone_disabled",
  "connection_lost",
  "latency_mismatch",
  "complexity_latency_mismatch",
];
for (const s of expectedGrowthOn) {
  assert(GROWTH_PLAN_SIGNALS[s] === true, `GROWTH plan has "${s}" = true`);
}
for (const s of ["face_absence", "multiple_faces", "identity_mismatch"] as ManagedProctoringSignal[]) {
  assert(
    GROWTH_PLAN_SIGNALS[s] === false,
    `GROWTH plan keeps face/identity "${s}" off`,
  );
}
// SCALE: GROWTH + face_absence + multiple_faces + identity_mismatch.
for (const s of MANAGED_PROCTORING_SIGNALS) {
  assert(SCALE_PLAN_SIGNALS[s] === true, `SCALE plan has "${s}" = true`);
}
// ---------------------------------------------------------------------------
// Section 6: end-to-end scenario  hostile write then read
// ---------------------------------------------------------------------------
section("End-to-end  hostile input survives the full write+read pipeline");
// Simulate a malicious admin attempting to disable everything via a PATCH.
const hostilePatch = Object.fromEntries(
  MANAGED_PROCTORING_SIGNALS.map((s) => [s, false]),
);
// Step 1: write path normalizes  always-on forced back to true.
const stored = normalizeProctoringSignals(hostilePatch);
// Step 2: read path filters events using the stored toggles.
for (const s of ALWAYS_ON) {
  assert(
    isProctoringSignalEnabled(stored, s) === true,
    `e2e: always-on "${s}" fires even after hostile patch`,
  );
}
for (const s of TOGGLABLE) {
  assert(
    isProctoringSignalEnabled(stored, s) === false,
    `e2e: togglable "${s}" suppressed when admin disabled it`,
  );
}
// ---------------------------------------------------------------------------
// Section 7: simulate a stale DB row missing the always-on keys entirely
// ---------------------------------------------------------------------------
section("Stale DB row  missing always-on keys still fire");
const staleRow: Record<string, unknown> = {
  tab_switch: true,
  camera_disabled: true,
  // intentionally omit every always-on signal
};
const staleNorm = normalizeProctoringSignals(staleRow);
for (const s of ALWAYS_ON) {
  assert(
    staleNorm[s] === true && isProctoringSignalEnabled(staleNorm, s) === true,
    `stale row: always-on "${s}" fires via fallback`,
  );
}
// ---------------------------------------------------------------------------
// Final report
// ---------------------------------------------------------------------------
console.log("\n=========================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log("=========================================");
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("\nAll proctoring-signal gating contracts verified.");
process.exit(0);
