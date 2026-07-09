import { formatOrgLimitValue, parseOrgLimitValue, type OrgLimitValue } from "./org-limits";
export const UNLIMITED_ACTIVE_DRIVES = 0;
export const FIXED_INTERVIEW_DURATION_MINUTES = 20;
export type DriveLike = {
};
export function isDriveLimitEnabled(maxActiveDrives?: OrgLimitValue): boolean {
  return parseOrgLimitValue(maxActiveDrives) !== null;
}
export function getActiveDriveCount(drives: DriveLike[]): number {
  return drives.length;
}
export function isDriveCreationLocked(maxActiveDrives?: OrgLimitValue, activeDriveCount = 0): boolean {
  const limit = parseOrgLimitValue(maxActiveDrives);
  return limit !== null && activeDriveCount >= limit;
}
export function getDriveLimitRemaining(maxActiveDrives?: OrgLimitValue, activeDriveCount = 0): number | null {
  const limit = parseOrgLimitValue(maxActiveDrives);
  if (limit === null) return null;
  return Math.max(0, limit - activeDriveCount);
}
export function formatDriveLimit(maxActiveDrives?: OrgLimitValue): string {
  return formatOrgLimitValue(maxActiveDrives);
}
