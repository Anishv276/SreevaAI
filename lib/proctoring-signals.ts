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
  | "contradiction"
  | "contradiction_resolved"
  | "duplicate_ip"
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
  "contradiction",
  "contradiction_resolved",
  "duplicate_ip",
  "depth_decay",
  "complexity_latency_mismatch",
];

function createSignalMap(value: boolean): ProctoringSignalToggles {
  return Object.fromEntries(MANAGED_PROCTORING_SIGNALS.map((signal) => [signal, value])) as ProctoringSignalToggles;
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
  contradiction: true,
  contradiction_resolved: true,
  duplicate_ip: true,
  depth_decay: true,
  complexity_latency_mismatch: true,
};

export const BASIC_PLAN_SIGNALS: ProctoringSignalToggles = createSignalMap(false);

// GROWTH plan: cheap / light signals from the user-provided table.
// "answer_compression" is represented here by the existing latency_mismatch signal.
export const GROWTH_PLAN_SIGNALS: ProctoringSignalToggles = {
  ...BASIC_PLAN_SIGNALS,
  tab_switch: true,
  camera_disabled: true,
  microphone_disabled: true,
  connection_lost: true,
  ownership_ambiguity: true,
  example_evasion: true,
  resume_claim_mismatch: true,
  follow_up_collapse: true,
  depth_decay: true,
  latency_mismatch: true,
  complexity_latency_mismatch: true,
  ownership_clarified: true,
  example_given: true,
  strong_under_pressure: true,
} as ProctoringSignalToggles;

// SCALE / ENTERPRISE adds the heavy vision / contradiction checks.
export const SCALE_PLAN_SIGNALS: ProctoringSignalToggles = {
  ...GROWTH_PLAN_SIGNALS,
  contradiction: true,
  contradiction_resolved: true,
  face_absence: true,
  multiple_faces: true,
  identity_mismatch: true,
};

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
  return {
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
    contradiction: toBoolean(source.contradiction, DEFAULT_PROCTORING_SIGNALS.contradiction),
    contradiction_resolved: toBoolean(source.contradiction_resolved, DEFAULT_PROCTORING_SIGNALS.contradiction_resolved),
    duplicate_ip: toBoolean(source.duplicate_ip, DEFAULT_PROCTORING_SIGNALS.duplicate_ip),
    depth_decay: toBoolean(source.depth_decay, DEFAULT_PROCTORING_SIGNALS.depth_decay),
    complexity_latency_mismatch: toBoolean(source.complexity_latency_mismatch, DEFAULT_PROCTORING_SIGNALS.complexity_latency_mismatch),
  };
}

export function isManagedProctoringSignal(eventType: string): eventType is ManagedProctoringSignal {
  return MANAGED_PROCTORING_SIGNALS.includes(eventType as ManagedProctoringSignal);
}

export function isProctoringSignalEnabled(
  toggles: ProctoringSignalToggles,
  eventType: string,
): boolean {
  if (!isManagedProctoringSignal(eventType)) return true;
  return Boolean(toggles[eventType]);
}
