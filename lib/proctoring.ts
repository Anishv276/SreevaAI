export type ProctoringSeverity = "low" | "medium" | "high";
export type ProctoringEventType =
  | "camera_disabled"
  | "microphone_disabled"
  | "connection_lost"
  | "tab_switch"
  | "fullscreen_exit"
  | "window_focus_loss"
  | "face_absence"
  | "multiple_faces"
  | "identity_mismatch"
  | "latency_mismatch"
  | "session_fingerprint";
export interface ProctoringEvent {
  eventType: string;
  severity?: ProctoringSeverity;
  reason?: string;
  durationSeconds?: number;
  strike?: number;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}
const EVENT_ALIASES: Record<string, ProctoringEventType> = {
  camera_disabled: "camera_disabled",
  cameraDisabled: "camera_disabled",
  microphone_disabled: "microphone_disabled",
  microphoneDisabled: "microphone_disabled",
  connection_lost: "connection_lost",
  connectionLost: "connection_lost",
  tab_switch: "tab_switch",
  tabSwitch: "tab_switch",
  fullscreen_exit: "fullscreen_exit",
  fullscreenExit: "fullscreen_exit",
  window_focus_loss: "window_focus_loss",
  windowFocusLoss: "window_focus_loss",
  face_absence: "face_absence",
  faceAbsence: "face_absence",
  multiple_faces: "multiple_faces",
  multipleFaces: "multiple_faces",
  identity_mismatch: "identity_mismatch",
  identityMismatch: "identity_mismatch",
  latency_mismatch: "latency_mismatch",
  latencyMismatch: "latency_mismatch",
  session_fingerprint: "session_fingerprint",
  sessionFingerprint: "session_fingerprint",
};
export const PROCTORING_SEVERITY_BY_TYPE: Record<ProctoringEventType, ProctoringSeverity> = {
  camera_disabled: "high",
  microphone_disabled: "medium",
  connection_lost: "medium",
  tab_switch: "medium",
  fullscreen_exit: "high",
  window_focus_loss: "medium",
  face_absence: "high",
  multiple_faces: "high",
  identity_mismatch: "high",
  latency_mismatch: "medium",
  session_fingerprint: "high",
};
export const PROCTORING_EVENT_ORDER: ProctoringEventType[] = [
  "camera_disabled",
  "microphone_disabled",
  "connection_lost",
  "tab_switch",
  "fullscreen_exit",
  "window_focus_loss",
  "face_absence",
  "multiple_faces",
  "identity_mismatch",
  "latency_mismatch",
  "session_fingerprint",
];
export function normalizeProctoringEvent(event: ProctoringEvent): ProctoringEvent {
  const rawType = String(event.eventType || "").trim();
  const key = rawType.replace(/\s+/g, "_");
  const normalizedType = EVENT_ALIASES[key] || EVENT_ALIASES[key.toLowerCase()] || (key.toLowerCase() as ProctoringEventType);
  const safeType = normalizedType || (PROCTORING_EVENT_ORDER.length > 0 ? PROCTORING_EVENT_ORDER[0] : "connection_lost" as ProctoringEventType);
  return {
    eventType: safeType,
    severity: event.severity || PROCTORING_SEVERITY_BY_TYPE[safeType as ProctoringEventType] || "low",
    reason: event.reason,
    durationSeconds: typeof event.durationSeconds === "number" && Number.isFinite(event.durationSeconds)
      ? Math.max(0, Math.round(event.durationSeconds))
      : undefined,
    strike: typeof event.strike === "number" && Number.isFinite(event.strike)
      ? Math.max(1, Math.round(event.strike))
      : undefined,
    metadata: event.metadata && typeof event.metadata === "object" ? event.metadata : undefined,
    timestamp: typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
      ? Math.round(event.timestamp)
      : Date.now(),
  };
}
export function normalizeProctoringEvents(events: ProctoringEvent[]): ProctoringEvent[] {
  return events.map((event) => normalizeProctoringEvent(event));
}
export function getProctoringCategory(eventType: string): ProctoringEventType {
  const rawType = String(eventType || "").trim().replace(/\s+/g, "_");
  return EVENT_ALIASES[rawType] || EVENT_ALIASES[rawType.toLowerCase()] || (rawType.toLowerCase() as ProctoringEventType);
}
