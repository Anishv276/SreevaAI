export type ManagedProctoringSignal =
  | "tab_switch"
  | "fullscreen_exit"
  | "camera_disabled"
  | "microphone_disabled"
  | "connection_lost"
  | "face_absence"
  | "multiple_faces"
  | "gaze_violation"
  | "head_pose_violation"
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
  | "meta_question"
  | "mouse_erratic"
  | "mouse_snap"
  | "duplicate_ip"
  | "connection_restored"
  | "depth_decay"
  | "complexity_latency_mismatch";

export type ProctoringSignalToggles = Record<ManagedProctoringSignal, boolean>;

export const MANAGED_PROCTORING_SIGNALS: ManagedProctoringSignal[] = [
  "tab_switch",
  "fullscreen_exit",
  "camera_disabled",
  "microphone_disabled",
  "connection_lost",
  "face_absence",
  "multiple_faces",
  "gaze_violation",
  "head_pose_violation",
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
  "meta_question",
  "mouse_erratic",
  "mouse_snap",
  "duplicate_ip",
  "connection_restored",
  "depth_decay",
  "complexity_latency_mismatch",
];

export const DEFAULT_PROCTORING_SIGNALS: ProctoringSignalToggles = {
  tab_switch: true,
  fullscreen_exit: true,
  camera_disabled: true,
  microphone_disabled: true,
  connection_lost: true,
  face_absence: true,
  multiple_faces: true,
  gaze_violation: true,
  head_pose_violation: true,
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
  meta_question: true,
  mouse_erratic: true,
  mouse_snap: true,
  duplicate_ip: true,
  connection_restored: true,
  depth_decay: true,
  complexity_latency_mismatch: true,
};

// GROWTH / PRO Plan Signals
export const PRO_PLAN_SIGNALS: ProctoringSignalToggles = {
  ...Object.fromEntries(MANAGED_PROCTORING_SIGNALS.map(s => [s, false])),
  tab_switch: true,
  fullscreen_exit: true,
  camera_disabled: true,
  microphone_disabled: true,
  connection_lost: true,
  connection_restored: true,
  ownership_ambiguity: true,
  example_evasion: true,
  resume_claim_mismatch: true,
  follow_up_collapse: true,
  depth_decay: true,
  latency_mismatch: true,
  meta_question: true,
} as ProctoringSignalToggles;

// SCALE / BUSINESS / ENTERPRISE Plan Signals
export const SCALE_PLAN_SIGNALS: ProctoringSignalToggles = {
  ...PRO_PLAN_SIGNALS,
  contradiction: true,
  contradiction_resolved: true,
  complexity_latency_mismatch: true,
  strong_under_pressure: true,
  ownership_clarified: true,
  example_given: true,
  mouse_erratic: true,
  mouse_snap: true,
  duplicate_ip: true,
  face_absence: true,
  multiple_faces: true,
  gaze_violation: true,
  head_pose_violation: true,
  identity_mismatch: true,
};

export function getProctoringSignalsForPlan(planId: string): ProctoringSignalToggles {
  const pid = planId.toUpperCase();
  if (pid === "PRO") return { ...PRO_PLAN_SIGNALS };
  if (pid === "BUSINESS" || pid === "ENTERPRISE") return { ...SCALE_PLAN_SIGNALS };
  // Default for STARTER or unknown: nothing enabled as requested
  return Object.fromEntries(MANAGED_PROCTORING_SIGNALS.map(s => [s, false])) as ProctoringSignalToggles;
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
    fullscreen_exit: toBoolean(source.fullscreen_exit, DEFAULT_PROCTORING_SIGNALS.fullscreen_exit),
    camera_disabled: toBoolean(source.camera_disabled, DEFAULT_PROCTORING_SIGNALS.camera_disabled),
    microphone_disabled: toBoolean(source.microphone_disabled, DEFAULT_PROCTORING_SIGNALS.microphone_disabled),
    connection_lost: toBoolean(source.connection_lost, DEFAULT_PROCTORING_SIGNALS.connection_lost),
    face_absence: toBoolean(source.face_absence, DEFAULT_PROCTORING_SIGNALS.face_absence),
    multiple_faces: toBoolean(source.multiple_faces, DEFAULT_PROCTORING_SIGNALS.multiple_faces),
    gaze_violation: toBoolean(source.gaze_violation, DEFAULT_PROCTORING_SIGNALS.gaze_violation),
    head_pose_violation: toBoolean(source.head_pose_violation, DEFAULT_PROCTORING_SIGNALS.head_pose_violation),
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
    meta_question: toBoolean(source.meta_question, DEFAULT_PROCTORING_SIGNALS.meta_question),
    mouse_erratic: toBoolean(source.mouse_erratic, DEFAULT_PROCTORING_SIGNALS.mouse_erratic),
    mouse_snap: toBoolean(source.mouse_snap, DEFAULT_PROCTORING_SIGNALS.mouse_snap),
    duplicate_ip: toBoolean(source.duplicate_ip, DEFAULT_PROCTORING_SIGNALS.duplicate_ip),
    connection_restored: toBoolean(source.connection_restored, DEFAULT_PROCTORING_SIGNALS.connection_restored),
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
