export const UNLIMITED_ACTIVE_DRIVES = 0;
export const FIXED_INTERVIEW_DURATION_MINUTES = 20;

export type DriveLike = {
};

export function isDriveLimitEnabled(maxActiveDrives?: number | null): boolean {
  return Number(maxActiveDrives ?? 0) > UNLIMITED_ACTIVE_DRIVES;
}

export function getActiveDriveCount(drives: DriveLike[]): number {
  return drives.length;
}

export function isDriveCreationLocked(maxActiveDrives?: number | null, activeDriveCount = 0): boolean {
  const limit = Number(maxActiveDrives ?? 0);
  return limit > UNLIMITED_ACTIVE_DRIVES && activeDriveCount >= limit;
}

export function getDriveLimitRemaining(maxActiveDrives?: number | null, activeDriveCount = 0): number | null {
  const limit = Number(maxActiveDrives ?? 0);
  if (!isDriveLimitEnabled(limit)) return null;
  return Math.max(0, limit - activeDriveCount);
}

export function formatDriveLimit(maxActiveDrives?: number | null): string {
  const limit = Number(maxActiveDrives ?? 0);
  return isDriveLimitEnabled(limit) ? String(limit) : "Unlimited";
}
