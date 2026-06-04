export type ManagedProctoringSignal =
  | "tab_switch"
  | "camera_disabled"
  | "microphone_disabled"
  | "connection_lost"
  | "face_absence"
  | "multiple_faces"
  | "identity_mismatch"
  | "ownership_ambiguity"
  | "example_evasion"
  | "latency_mismatch"
  | "resume_claim_mismatch"
  | "ownership_clarified"
  | "example_given"
  | "strong_under_pressure"
  | "follow_up_collapse"
  | "depth_decay"
  | "complexity_latency_mismatch";

export type ProctoringSignalToggles = Record<ManagedProctoringSignal, boolean>;

export const MANAGED_PROCTORING_SIGNALS: ManagedProctoringSignal[] = [
  "tab_switch",
  "camera_disabled",
  "microphone_disabled",
  "connection_lost",
  "face_absence",
  "multiple_faces",
  "identity_mismatch",
  "ownership_ambiguity",
  "example_evasion",
  "latency_mismatch",
  "resume_claim_mismatch",
  "ownership_clarified",
  "example_given",
  "strong_under_pressure",
  "follow_up_collapse",
  "depth_decay",
  "complexity_latency_mismatch",
];

function createSignalMap(value: boolean): ProctoringSignalToggles {
  return Object.fromEntries(MANAGED_PROCTORING_SIGNALS.map((signal) => [signal, value])) as ProctoringSignalToggles;
}

// Behavioral signals that are FORCED ON for every plan and every org.
// These are the signals an interview cannot be scored fairly without --
// ownership, example/evidence, and pressure/reasoning checks.
//
// Three layers of enforcement keep these on:
//   1. `withAlwaysOn(...)` ensures plan defaults include them.
//   2. `normalizeProctoringSignals(...)` overrides them to true on every
//      write/read (so even tampered DB rows or malicious PATCH payloads
//      cannot disable them).
//   3. `isProctoringSignalEnabled(...)` returns true for these regardless
//      of the stored toggles -- the final guarantee at signal-firing time.
//
// The super-admin UI also locks the checkboxes for these signals (visual
// truthfulness), but the backend never trusts that the UI did its job.
export const ALWAYS_ON_PROCTORING_SIGNALS: ManagedProctoringSignal[] = [
  // Ownership and Claim Checks
  "ownership_ambiguity",
  "ownership_clarified",
  "resume_claim_mismatch",
  // Example and Evidence
  "example_evasion",
  "example_given",
  // Pressure and Reasoning
  "strong_under_pressure",
  "follow_up_collapse",
  "depth_decay",
];

// O(1) lookup; built once at module load.
const ALWAYS_ON_SET: ReadonlySet<ManagedProctoringSignal> = new Set(ALWAYS_ON_PROCTORING_SIGNALS);

export function isAlwaysOnSignal(key: string): boolean {
  return ALWAYS_ON_SET.has(key as ManagedProctoringSignal);
}

/**
 * Force the always-on signals to true on top of any base toggle map.
 * Used by plan-default builders below; safe to call on any partial input.
 */
function withAlwaysOn(base: ProctoringSignalToggles): ProctoringSignalToggles {
  const out: ProctoringSignalToggles = { ...base };
  for (const key of ALWAYS_ON_PROCTORING_SIGNALS) {
    out[key] = true;
  }
  return out;
}

export const DEFAULT_PROCTORING_SIGNALS: ProctoringSignalToggles = {
  tab_switch: true,
  camera_disabled: true,
  microphone_disabled: true,
  connection_lost: true,
  face_absence: true,
  multiple_faces: true,
  identity_mismatch: true,
  ownership_ambiguity: true,
  example_evasion: true,
  latency_mismatch: true,
  resume_claim_mismatch: true,
  ownership_clarified: true,
  example_given: true,
  strong_under_pressure: true,
  follow_up_collapse: true,
  depth_decay: true,
  complexity_latency_mismatch: true,
};

// BASIC / STARTER plan: only the always-on behavioral signals are enabled.
// All optional environment / device / identity signals stay off until plan upgrade.
export const BASIC_PLAN_SIGNALS: ProctoringSignalToggles = withAlwaysOn(createSignalMap(false));

// GROWTH plan: always-on behavioral signals + light environment/device signals.
// "answer_compression" is represented here by the existing latency_mismatch signal.
export const GROWTH_PLAN_SIGNALS: ProctoringSignalToggles = withAlwaysOn({
  ...createSignalMap(false),
  tab_switch: true,
  camera_disabled: true,
  microphone_disabled: true,
  connection_lost: true,
  latency_mismatch: true,
  complexity_latency_mismatch: true,
});

// SCALE / ENTERPRISE adds the heavier vision checks on top of GROWTH.
export const SCALE_PLAN_SIGNALS: ProctoringSignalToggles = withAlwaysOn({
  ...GROWTH_PLAN_SIGNALS,
  face_absence: true,
  multiple_faces: true,
  identity_mismatch: true,
});

export function getProctoringSignalsForPlan(planId: string): ProctoringSignalToggles {
  const pid = planId.toUpperCase();
  if (pid === "STARTER" || pid === "BASIC") return { ...BASIC_PLAN_SIGNALS };
  if (pid === "PRO") return { ...GROWTH_PLAN_SIGNALS };
  if (pid === "BUSINESS" || pid === "ENTERPRISE") return { ...SCALE_PLAN_SIGNALS };
  // Default for unknown: nothing enabled as requested
  return { ...BASIC_PLAN_SIGNALS };
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

export function normalizeProctoringSignals(raw: unknown): ProctoringSignalToggles {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const normalized: ProctoringSignalToggles = {
    tab_switch: toBoolean(source.tab_switch, DEFAULT_PROCTORING_SIGNALS.tab_switch),
    camera_disabled: toBoolean(source.camera_disabled, DEFAULT_PROCTORING_SIGNALS.camera_disabled),
    microphone_disabled: toBoolean(source.microphone_disabled, DEFAULT_PROCTORING_SIGNALS.microphone_disabled),
    connection_lost: toBoolean(source.connection_lost, DEFAULT_PROCTORING_SIGNALS.connection_lost),
    face_absence: toBoolean(source.face_absence, DEFAULT_PROCTORING_SIGNALS.face_absence),
    multiple_faces: toBoolean(source.multiple_faces, DEFAULT_PROCTORING_SIGNALS.multiple_faces),
    identity_mismatch: toBoolean(source.identity_mismatch, DEFAULT_PROCTORING_SIGNALS.identity_mismatch),
    ownership_ambiguity: toBoolean(source.ownership_ambiguity, DEFAULT_PROCTORING_SIGNALS.ownership_ambiguity),
    example_evasion: toBoolean(source.example_evasion, DEFAULT_PROCTORING_SIGNALS.example_evasion),
    latency_mismatch: toBoolean(source.latency_mismatch, DEFAULT_PROCTORING_SIGNALS.latency_mismatch),
    resume_claim_mismatch: toBoolean(source.resume_claim_mismatch, DEFAULT_PROCTORING_SIGNALS.resume_claim_mismatch),
    ownership_clarified: toBoolean(source.ownership_clarified, DEFAULT_PROCTORING_SIGNALS.ownership_clarified),
    example_given: toBoolean(source.example_given, DEFAULT_PROCTORING_SIGNALS.example_given),
    strong_under_pressure: toBoolean(source.strong_under_pressure, DEFAULT_PROCTORING_SIGNALS.strong_under_pressure),
    follow_up_collapse: toBoolean(source.follow_up_collapse, DEFAULT_PROCTORING_SIGNALS.follow_up_collapse),
    depth_decay: toBoolean(source.depth_decay, DEFAULT_PROCTORING_SIGNALS.depth_decay),
    complexity_latency_mismatch: toBoolean(source.complexity_latency_mismatch, DEFAULT_PROCTORING_SIGNALS.complexity_latency_mismatch),
  };
  // Force always-on signals to true regardless of the raw input. This is the
  // write-path guarantee: any malicious or stale PATCH cannot disable them.
  for (const key of ALWAYS_ON_PROCTORING_SIGNALS) {
    normalized[key] = true;
  }
  return normalized;
}

export function isManagedProctoringSignal(eventType: string): eventType is ManagedProctoringSignal {
  return MANAGED_PROCTORING_SIGNALS.includes(eventType as ManagedProctoringSignal);
}

export function isProctoringSignalEnabled(
  toggles: ProctoringSignalToggles,
  eventType: string,
): boolean {
  if (!isManagedProctoringSignal(eventType)) return true;
  // Read-path guarantee: always-on signals fire regardless of the stored toggle.
  // This is the last line of defense against stale DB rows or a buggy admin UI.
  if (isAlwaysOnSignal(eventType)) return true;
  return Boolean(toggles[eventType]);
}
