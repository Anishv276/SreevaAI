import { prisma } from "@/lib/prisma";
import { recordingRetentionQueue } from "@/lib/queue";
import { deleteObjectStrict, getKeyFromUrl } from "@/lib/s3";

export const RECORDING_RETENTION_QUEUE = "recording-retention-cleanup";
export const RECORDING_RETENTION_SWEEP_JOB = "recording-retention-sweep";
export const RECORDING_RETENTION_DELETE_JOB = "delete-recording-asset";
export const RECORDING_RETENTION_JOB_PREFIX = "recording-retention";

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

export function getRecordingRetentionJobId(applicationId: string) {
  return `${RECORDING_RETENTION_JOB_PREFIX}:${applicationId}`;
}

export function getInterviewRecordingBucket() {
  return process.env.R2_INTERVIEW_BUCKET || "interview";
}

export function extractRecordingKey(params: {
  recordingUrl?: string | null;
  recordingKey?: string | null;
  recordingManifest?: unknown;
}) {
  const manifest = parseJsonSafe<JsonRecord>(params.recordingManifest, {});
  const manifestKey = String(params.recordingKey || manifest.recordingKey || "").trim();
  if (manifestKey) return manifestKey;

  const manifestUrl = String(manifest.recordingUrl || "").trim();
  const url = String(params.recordingUrl || manifestUrl).trim();
  if (!url) return null;
  return getKeyFromUrl(url);
}

export async function getOrgRecordingSettings(orgId: string) {
  const org = await (prisma as any).organization.findUnique({
    where: { id: orgId },
    select: {
      recordingEnabled: true,
      recordingRetentionDays: true,
    },
  });

  const recordingRetentionDays = normalizeRecordingRetentionDays(org?.recordingRetentionDays);
  const recordingEnabled = org?.recordingEnabled === true && recordingRetentionDays !== null;

  return {
    recordingEnabled,
    recordingRetentionDays,
  };
}

function isIgnorableDeleteError(error: unknown) {
  const code = String((error as any)?.name || (error as any)?.Code || (error as any)?.code || "").toLowerCase();
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
  bucket?: string;
  attempts?: number;
  baseDelayMs?: number;
}) {
  const key = extractRecordingKey({
    recordingUrl: params.recordingUrl,
    recordingKey: params.recordingKey,
    recordingManifest: params.recordingManifest,
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
  recordingUrl?: string | null;
  recordingKey?: string | null;
  recordingManifest?: unknown;
}) {
  const dueAt = computeRecordingRetentionDueAt(params.completedAt, params.retentionDays);
  if (!dueAt) {
    return { scheduled: false, dueAt: null as Date | null };
  }

  const delay = Math.max(0, dueAt.getTime() - Date.now());
  const jobId = getRecordingRetentionJobId(params.applicationId);
  const normalizedRetentionDays = normalizeRecordingRetentionDays(params.retentionDays);
  if (normalizedRetentionDays === null) {
    return { scheduled: false, dueAt: null as Date | null };
  }

  const existingJob = await recordingRetentionQueue.getJob(jobId).catch(() => null);
  if (existingJob) {
    await existingJob.remove().catch(() => {});
  }

  await recordingRetentionQueue.add(
    RECORDING_RETENTION_DELETE_JOB,
    {
      applicationId: params.applicationId,
      dueAt: dueAt.toISOString(),
      recordingUrl: params.recordingUrl || null,
      recordingKey: params.recordingKey || null,
      recordingManifest: params.recordingManifest || null,
      retentionDays: normalizedRetentionDays,
    },
    {
      jobId,
      delay,
    }
  );

  await (prisma as any).interview.update({
    where: { applicationId: params.applicationId },
    data: {
      recordingRetentionDays: normalizedRetentionDays,
      recordingRetentionDueAt: dueAt,
      recordingCleanupStatus: "PENDING",
      recordingCleanupAttempts: 0,
      recordingCleanupLastError: null,
      recordingDeletedAt: null,
    },
  }).catch((error: unknown) => {
    console.warn(
      `[RETENTION] Failed to persist retention metadata for ${params.applicationId}:`,
      error
    );
  });

  return { scheduled: true, dueAt };
}
