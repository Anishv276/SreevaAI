export const UNLIMITED_ACTIVE_DRIVES = 0;

export type DriveLike = {
  status?: string | null;
  deadline?: string | Date | null;
};

export function isDriveLimitEnabled(maxActiveDrives?: number | null): boolean {
  return Number(maxActiveDrives ?? 0) > UNLIMITED_ACTIVE_DRIVES;
}

export function getActiveDriveCount(drives: DriveLike[]): number {
  const now = Date.now();

  return drives.reduce((count, drive) => {
    if (String(drive.status || "").toUpperCase() !== "ACTIVE") {
      return count;
    }

    if (!drive.deadline) {
      return count + 1;
    }

    const deadlineMs = new Date(drive.deadline).getTime();
    if (!Number.isNaN(deadlineMs) && deadlineMs >= now) {
      return count + 1;
    }

    return count;
  }, 0);
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
