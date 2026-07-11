import { prisma } from "@/lib/prisma";
import { deleteObjectStrict, getKeyFromUrl } from "@/lib/s3";
import {
  isoOrNull,
  mergeRecordingState,
  normalizeRecordingState,
  parseJsonRecord,
  type RecordingState,
} from "@/lib/recording-state";
export const RECORDING_RETENTION_QUEUE = "recording-retention-cleanup";
export const RECORDING_RETENTION_SWEEP_JOB = "recording-retention-sweep";
type JsonRecord = Record<string, any>;
function parseJsonSafe<T = JsonRecord>(raw: unknown, fallback: T): T {
  try {
    if (!raw) return fallback;
    if (typeof raw === "string") return JSON.parse(raw) as T;
    if (typeof raw === "object") return raw as T;
    return fallback;
  } catch {
    return fallback;
  }
}
export function normalizeRecordingRetentionDays(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.max(1, Math.round(value));
}
export function computeRecordingRetentionDueAt(completedAt: Date | string | null | undefined, retentionDays: unknown) {
  const base = completedAt instanceof Date ? completedAt : completedAt ? new Date(completedAt) : null;
  if (!base || !Number.isFinite(base.getTime())) return null;
  const days = normalizeRecordingRetentionDays(retentionDays);
  if (days === null) return null;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}
export function getInterviewRecordingBucket() {
  return process.env.R2_INTERVIEW_BUCKET || "interview";
}
export function extractRecordingKey(params: {
  recordingUrl?: string | null;
  recordingKey?: string | null;
  recordingManifest?: unknown;
  recording?: unknown;
}) {
  const manifest = parseJsonSafe<JsonRecord>(params.recordingManifest, {});
  const recording = normalizeRecordingState(params.recording);
  const recordingManifest = parseJsonRecord(recording.manifest);
  const manifestKey = String(
    params.recordingKey
    || recording.key
    || manifest.recordingKey
    || recordingManifest.recordingKey
    || ""
  ).trim();
  if (manifestKey) return manifestKey;
  const manifestUrl = String(manifest.recordingUrl || "").trim();
  const recordingUrl = String(recording.url || recordingManifest.recordingUrl || "").trim();
  const url = String(params.recordingUrl || recordingUrl || manifestUrl).trim();
  if (!url) return null;
  return getKeyFromUrl(url);
}
export async function getOrgRecordingSettings(orgId: string) {
  const org = await prisma.organizationDetails.findUnique({
    where: { id: orgId },
    select: {
      isRecordingEnabled: true,
      recordingKeepForDays: true,
    },
  });
  const recordingRetentionDays = normalizeRecordingRetentionDays(org?.recordingKeepForDays);
  const recordingEnabled = org?.isRecordingEnabled === true && recordingRetentionDays !== null;
  return {
    recordingEnabled,
    recordingRetentionDays,
  };
}
function isIgnorableDeleteError(error: unknown) {
  const err = error as Record<string, unknown>;
  const code = String(err?.name || err?.Code || err?.code || "").toLowerCase();
  return (
    code.includes("nosuchkey")
    || code.includes("notfound")
    || code.includes("not_found")
    || code.includes("404")
  );
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function deleteRecordingObjectWithRetry(params: {
  bucket?: string;
  key: string;
  attempts?: number;
  baseDelayMs?: number;
}) {
  const bucket = params.bucket || getInterviewRecordingBucket();
  const key = String(params.key || "").trim().replace(/^\/+/, "");
  const attempts = Math.max(1, Math.round(params.attempts || 3));
  const baseDelayMs = Math.max(0, Math.round(params.baseDelayMs || 1000));
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await deleteObjectStrict(bucket, key);
      return { success: true, attempts: attempt, bucket, key, lastError: null as string | null };
    } catch (error) {
      lastError = error;
      if (isIgnorableDeleteError(error)) {
        return { success: true, attempts: attempt, bucket, key, lastError: null as string | null };
      }
      if (attempt < attempts && baseDelayMs > 0) {
        await sleep(baseDelayMs * (2 ** (attempt - 1)));
      }
    }
  }
  return {
    success: false,
    attempts,
    bucket,
    key,
    lastError: lastError instanceof Error ? lastError.message : String(lastError || "Unknown delete error"),
  };
}
export async function deleteRecordingAsset(params: {
  recordingUrl?: string | null;
  recordingKey?: string | null;
  recordingManifest?: unknown;
  recording?: unknown;
  bucket?: string;
  attempts?: number;
  baseDelayMs?: number;
}) {
  const key = extractRecordingKey({
    recordingUrl: params.recordingUrl,
    recordingKey: params.recordingKey,
    recordingManifest: params.recordingManifest,
    recording: params.recording,
  });
  if (!key) {
    return {
      success: true,
      attempts: 0,
      bucket: params.bucket || getInterviewRecordingBucket(),
      key: null as string | null,
      lastError: null as string | null,
    };
  }
  return deleteRecordingObjectWithRetry({
    bucket: params.bucket,
    key,
    attempts: params.attempts,
    baseDelayMs: params.baseDelayMs,
  });
}
export async function scheduleRecordingRetentionDeletion(params: {
  applicationId: string;
  completedAt: Date | string | null | undefined;
  retentionDays: unknown;
  recordingName?: string | null;
  recordingUrl?: string | null;
  recordingKey?: string | null;
  recordingManifest?: unknown;
}) {
  const dueAt = computeRecordingRetentionDueAt(params.completedAt, params.retentionDays);
  if (!dueAt) {
    return { scheduled: false, dueAt: null as Date | null };
  }
  const normalizedRetentionDays = normalizeRecordingRetentionDays(params.retentionDays);
  if (normalizedRetentionDays === null) {
    return { scheduled: false, dueAt: null as Date | null };
  }
  const interview = await prisma.interview.findUnique({
    where: { applicationId: params.applicationId },
    select: { sessionRecording: true },
  }).catch(() => null);
  const manifest = parseJsonRecord(params.recordingManifest);
  const recordingPatch: RecordingState = {
    ...(params.recordingName ? { name: params.recordingName } : {}),
    ...(params.recordingUrl ? { url: params.recordingUrl } : {}),
    ...(params.recordingKey ? { key: params.recordingKey } : {}),
    ...(Object.keys(manifest).length ? { manifest } : {}),
    completedAt: isoOrNull(params.completedAt),
    retention: {
      days: normalizedRetentionDays,
      dueAt: dueAt.toISOString(),
      cleanupStatus: "PENDING",
      cleanupAttempts: 0,
      cleanupLastError: null,
      deletedAt: null,
    },
  };
  const nextRecording = mergeRecordingState(interview?.sessionRecording, recordingPatch);
  await prisma.interview.update({
    where: { applicationId: params.applicationId },
    data: {
      sessionRecording: nextRecording,
    },
  }).catch((error: unknown) => {
    console.warn(
      `[RETENTION] Failed to persist retention metadata for ${params.applicationId}:`,
      error
    );
  });
  return { scheduled: false, stored: true, dueAt };
}
