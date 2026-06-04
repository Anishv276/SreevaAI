export type ProctoringSeverity = "low" | "medium" | "high";

export type ProctoringEventType =
  | "camera_disabled"
  | "microphone_disabled"
  | "connection_lost"
  | "tab_switch"
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
  face_absence: "face_absence",
  faceAbsence: "face_absence",
  multiple_faces: "multiple_faces",
  multipleFaces: "multiple_faces",
  identity_mismatch: "identity_mismatch",
  identityMismatch: "identity_mismatch",
  ownership_ambiguity: "ownership_ambiguity",
  ownershipAmbiguity: "ownership_ambiguity",
  example_evasion: "example_evasion",
  exampleEvasion: "example_evasion",
  latency_mismatch: "latency_mismatch",
  latencyMismatch: "latency_mismatch",
  resume_claim_mismatch: "resume_claim_mismatch",
  resumeClaimMismatch: "resume_claim_mismatch",
  ownership_clarified: "ownership_clarified",
  ownershipClarified: "ownership_clarified",
  example_given: "example_given",
  exampleGiven: "example_given",
  strong_under_pressure: "strong_under_pressure",
  strongUnderPressure: "strong_under_pressure",
  follow_up_collapse: "follow_up_collapse",
  followUpCollapse: "follow_up_collapse",
  depth_decay: "depth_decay",
  depthDecay: "depth_decay",
  complexity_latency_mismatch: "complexity_latency_mismatch",
  complexityLatencyMismatch: "complexity_latency_mismatch",
};

export const PROCTORING_SEVERITY_BY_TYPE: Record<ProctoringEventType, ProctoringSeverity> = {
  camera_disabled: "high",
  microphone_disabled: "medium",
  connection_lost: "medium",
  tab_switch: "medium",
  face_absence: "high",
  multiple_faces: "high",
  identity_mismatch: "high",
  ownership_ambiguity: "medium",
  example_evasion: "high",
  latency_mismatch: "medium",
  resume_claim_mismatch: "high",
  ownership_clarified: "low",
  example_given: "low",
  strong_under_pressure: "low",
  follow_up_collapse: "high",
  depth_decay: "high",
  complexity_latency_mismatch: "high",
};

export const PROCTORING_EVENT_ORDER: ProctoringEventType[] = [
  "camera_disabled",
  "microphone_disabled",
  "connection_lost",
  "tab_switch",
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
