import { formatOrgLimitValue, parseOrgLimitValue, type OrgLimitValue } from "./org-limits";
export const UNLIMITED_ACTIVE_JOBS = 0;
export const FIXED_INTERVIEW_DURATION_MINUTES = 20;
export type JobLike = {
};
export function isJobLimitEnabled(maxActiveJobs?: OrgLimitValue): boolean {
  return parseOrgLimitValue(maxActiveJobs) !== null;
}
export function getActiveJobCount(jobs: JobLike[]): number {
  return jobs.length;
}
export function isJobCreationLocked(maxActiveJobs?: OrgLimitValue, activeJobCount = 0): boolean {
  const limit = parseOrgLimitValue(maxActiveJobs);
  return limit !== null && activeJobCount >= limit;
}
export function getJobLimitRemaining(maxActiveJobs?: OrgLimitValue, activeJobCount = 0): number | null {
  const limit = parseOrgLimitValue(maxActiveJobs);
  if (limit === null) return null;
  return Math.max(0, limit - activeJobCount);
}
export function formatJobLimit(maxActiveJobs?: OrgLimitValue): string {
  return formatOrgLimitValue(maxActiveJobs);
}
