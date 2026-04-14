export type ProctoringSeverity = "low" | "medium" | "high";

export type ProctoringEventType =
  | "tab_switch"
  | "fullscreen_exit"
  | "face_not_detected"
  | "multiple_faces"
  | "camera_disabled"
  | "microphone_disabled"
  | "connection_lost"
  | "connection_restored"
  | "audio_flag"
  | "duplicate_ip";

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
  candidate_out_of_screen: "tab_switch",
  tab_switch: "tab_switch",
  tabSwitch: "tab_switch",
  visibility_hidden: "tab_switch",
  visibilityHidden: "tab_switch",
  window_blur: "tab_switch",
  windowBlur: "tab_switch",
  tab_violation: "tab_switch",
  tabViolation: "tab_switch",
  fullscreen_exit: "fullscreen_exit",
  fullscreenExit: "fullscreen_exit",
  face_not_detected: "face_not_detected",
  faceNotDetected: "face_not_detected",
  multiple_faces: "multiple_faces",
  multipleFaces: "multiple_faces",
  camera_disabled: "camera_disabled",
  cameraDisabled: "camera_disabled",
  microphone_disabled: "microphone_disabled",
  microphoneDisabled: "microphone_disabled",
  connection_lost: "connection_lost",
  connectionLost: "connection_lost",
  connection_restored: "connection_restored",
  connectionRestored: "connection_restored",
  audio_flag: "audio_flag",
  audioFlag: "audio_flag",
  duplicate_ip: "duplicate_ip",
  duplicateIp: "duplicate_ip",
};

export const PROCTORING_SEVERITY_BY_TYPE: Record<ProctoringEventType, ProctoringSeverity> = {
  tab_switch: "high",
  fullscreen_exit: "high",
  face_not_detected: "medium",
  multiple_faces: "high",
  camera_disabled: "high",
  microphone_disabled: "medium",
  connection_lost: "medium",
  connection_restored: "low",
  audio_flag: "medium",
  duplicate_ip: "high",
};

export const PROCTORING_EVENT_ORDER: ProctoringEventType[] = [
  "tab_switch",
  "fullscreen_exit",
  "face_not_detected",
  "multiple_faces",
  "camera_disabled",
  "microphone_disabled",
  "connection_lost",
  "connection_restored",
  "audio_flag",
  "duplicate_ip",
];

export function normalizeProctoringEvent(event: ProctoringEvent): ProctoringEvent {
  const rawType = String(event.eventType || "").trim();
  const key = rawType.replace(/\s+/g, "_");
  const normalizedType = EVENT_ALIASES[key] || EVENT_ALIASES[key.toLowerCase()] || (key.toLowerCase() as ProctoringEventType);
  const safeType = normalizedType || "tab_switch";

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
