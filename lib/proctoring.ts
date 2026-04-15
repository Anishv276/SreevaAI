export type ProctoringSeverity = "low" | "medium" | "high";

export type ProctoringEventType =
  | "face_not_detected"
  | "multiple_faces"
  | "camera_disabled"
  | "microphone_disabled"
  | "connection_lost"
  | "connection_restored"
  | "audio_flag"
  | "duplicate_ip"
  | "tab_switch"
  | "fullscreen_exit";

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
  tab_switch: "tab_switch",
  tabSwitch: "tab_switch",
  fullscreen_exit: "fullscreen_exit",
  fullscreenExit: "fullscreen_exit",
};

export const PROCTORING_SEVERITY_BY_TYPE: Record<ProctoringEventType, ProctoringSeverity> = {
  face_not_detected: "medium",
  multiple_faces: "high",
  camera_disabled: "high",
  microphone_disabled: "medium",
  connection_lost: "medium",
  connection_restored: "low",
  audio_flag: "medium",
  duplicate_ip: "high",
  tab_switch: "medium",
  fullscreen_exit: "high",
};

export const PROCTORING_EVENT_ORDER: ProctoringEventType[] = [
  "face_not_detected",
  "multiple_faces",
  "camera_disabled",
  "microphone_disabled",
  "connection_lost",
  "connection_restored",
  "audio_flag",
  "duplicate_ip",
  "tab_switch",
  "fullscreen_exit",
];

export function normalizeProctoringEvent(event: ProctoringEvent): ProctoringEvent {
  const rawType = String(event.eventType || "").trim();
  const key = rawType.replace(/\s+/g, "_");
  const normalizedType = EVENT_ALIASES[key] || EVENT_ALIASES[key.toLowerCase()] || (key.toLowerCase() as ProctoringEventType);
  const safeType = normalizedType || (PROCTORING_EVENT_ORDER[0] as ProctoringEventType);

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
