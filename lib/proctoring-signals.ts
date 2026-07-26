export type ManagedProctoringSignal =
  | "tab_switch"
  | "fullscreen_exit"
  | "window_focus_loss"
  | "camera_disabled"
  | "microphone_disabled"
  | "connection_lost"
  | "face_absence"
  | "multiple_faces"
  | "identity_mismatch"
  | "latency_mismatch"
  | "answer_integrity"
  | "session_fingerprint"
  | "gaze_deviation"
  | "live_integrity_monitoring";
export type ProctoringSignalToggles = Record<ManagedProctoringSignal, boolean>;
export const MANAGED_PROCTORING_SIGNALS: ManagedProctoringSignal[] = [
  "tab_switch",
  "fullscreen_exit",
  "window_focus_loss",
  "camera_disabled",
  "microphone_disabled",
  "connection_lost",
  "face_absence",
  "multiple_faces",
  "identity_mismatch",
  "latency_mismatch",
  "answer_integrity",
  "session_fingerprint",
  "gaze_deviation",
  "live_integrity_monitoring",
];
function createSignalMap(value: boolean): ProctoringSignalToggles {
  return Object.fromEntries(MANAGED_PROCTORING_SIGNALS.map((signal) => [signal, value])) as ProctoringSignalToggles;
}
export const DEFAULT_PROCTORING_SIGNALS: ProctoringSignalToggles = {
  tab_switch: true,
  fullscreen_exit: true,
  window_focus_loss: true,
  camera_disabled: true,
  microphone_disabled: true,
  connection_lost: true,
  face_absence: true,
  multiple_faces: true,
  identity_mismatch: true,
  latency_mismatch: true,
  answer_integrity: true,
  session_fingerprint: true,
  gaze_deviation: true,
  // Off by default everywhere -- super-admin opt-in only, see GROWTH/SCALE below.
  live_integrity_monitoring: false,
};
// BASIC / STARTER plan: nothing enabled until plan upgrade.
export const BASIC_PLAN_SIGNALS: ProctoringSignalToggles = createSignalMap(false);
// GROWTH plan: light environment/device signals + latency checks.
export const GROWTH_PLAN_SIGNALS: ProctoringSignalToggles = {
  ...createSignalMap(false),
  tab_switch: true,
  fullscreen_exit: true,
  window_focus_loss: true,
  camera_disabled: true,
  microphone_disabled: true,
  connection_lost: true,
  latency_mismatch: true,
  answer_integrity: true,
  session_fingerprint: false,
  gaze_deviation: true,
};
// SCALE / ENTERPRISE adds the heavier vision checks on top of GROWTH.
export const SCALE_PLAN_SIGNALS: ProctoringSignalToggles = {
  ...GROWTH_PLAN_SIGNALS,
  face_absence: true,
  multiple_faces: true,
  identity_mismatch: true,
  session_fingerprint: true,
  gaze_deviation: true,
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
  const normalized: ProctoringSignalToggles = {
    tab_switch: toBoolean(source.tab_switch, DEFAULT_PROCTORING_SIGNALS.tab_switch),
    fullscreen_exit: toBoolean(source.fullscreen_exit, DEFAULT_PROCTORING_SIGNALS.fullscreen_exit),
    window_focus_loss: toBoolean(source.window_focus_loss, DEFAULT_PROCTORING_SIGNALS.window_focus_loss),
    camera_disabled: toBoolean(source.camera_disabled, DEFAULT_PROCTORING_SIGNALS.camera_disabled),
    microphone_disabled: toBoolean(source.microphone_disabled, DEFAULT_PROCTORING_SIGNALS.microphone_disabled),
    connection_lost: toBoolean(source.connection_lost, DEFAULT_PROCTORING_SIGNALS.connection_lost),
    face_absence: toBoolean(source.face_absence, DEFAULT_PROCTORING_SIGNALS.face_absence),
    multiple_faces: toBoolean(source.multiple_faces, DEFAULT_PROCTORING_SIGNALS.multiple_faces),
    identity_mismatch: toBoolean(source.identity_mismatch, DEFAULT_PROCTORING_SIGNALS.identity_mismatch),
    latency_mismatch: toBoolean(source.latency_mismatch, DEFAULT_PROCTORING_SIGNALS.latency_mismatch),
    answer_integrity: toBoolean(source.answer_integrity, DEFAULT_PROCTORING_SIGNALS.answer_integrity),
    session_fingerprint: toBoolean(source.session_fingerprint, DEFAULT_PROCTORING_SIGNALS.session_fingerprint),
    gaze_deviation: toBoolean(source.gaze_deviation, DEFAULT_PROCTORING_SIGNALS.gaze_deviation),
    live_integrity_monitoring: toBoolean(source.live_integrity_monitoring, DEFAULT_PROCTORING_SIGNALS.live_integrity_monitoring),
  };
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
  return Boolean(toggles[eventType]);
}
