export type RecordingCleanupStatus = "PENDING" | "PROCESSING" | "FAILED" | "COMPLETED";
export type RecordingState = {
  name?: string | null;
  mode?: string | null;
  status?: string | null;
  mimeType?: string | null;
  url?: string | null;
  key?: string | null;
  egressId?: string | null;
  roomName?: string | null;
  recordedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationSec?: number | null;
  manifest?: Record<string, any> | null;
  retention?: {
    days?: number | null;
    dueAt?: string | null;
    cleanupStatus?: RecordingCleanupStatus | string | null;
    cleanupAttempts?: number | null;
    cleanupLastError?: string | null;
    deletedAt?: string | null;
  };
};
export function parseJsonRecord(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
export function normalizeRecordingState(value: unknown): RecordingState {
  return parseJsonRecord(value) as RecordingState;
}
export function isoOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export function mergeRecordingState(current: unknown, patch: RecordingState): RecordingState {
  const base = normalizeRecordingState(current);
  const retentionPatch = patch.retention || {};
  const next: RecordingState = {
    ...base,
    ...patch,
    manifest: {
      ...(parseJsonRecord(base.manifest) || {}),
      ...(parseJsonRecord(patch.manifest) || {}),
    },
    retention: {
      ...(base.retention || {}),
      ...retentionPatch,
    },
  };
  if (!patch.manifest && base.manifest === undefined) delete next.manifest;
  if (!patch.retention && base.retention === undefined) delete next.retention;
  return next;
}
export function getRecordingUrl(recording: unknown, fallback?: string | null) {
  const state = normalizeRecordingState(recording);
  const status = String(state.status || "").trim().toUpperCase();
  if (["DELETED", "DISABLED", "FAILED", "ABORTED", "LIMIT_REACHED"].includes(status)) {
    return null;
  }
  const manifest = parseJsonRecord(state.manifest);
  return String(state.url || manifest.recordingUrl || fallback || "").trim() || null;
}
export function getRecordingKey(recording: unknown, fallback?: string | null) {
  const state = normalizeRecordingState(recording);
  const manifest = parseJsonRecord(state.manifest);
  return String(state.key || manifest.recordingKey || fallback || "").trim() || null;
}
export function getRecordingDurationSec(recording: unknown, fallback?: number | null) {
  const state = normalizeRecordingState(recording);
  const value = Number(state.durationSec ?? fallback ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}
export function getRecordingMimeType(recording: unknown, fallback?: string | null) {
  const state = normalizeRecordingState(recording);
  return String(state.mimeType || fallback || "").trim() || null;
}
