import { formatOrgLimitValue, parseOrgLimitValue, type OrgLimitValue } from "./org-limits";

export const UNLIMITED_TEAM_MEMBERS = 0;
export const TEAM_LIMIT_SUPPORT_EMAIL = "support@sreevaai.com";
export const TEAM_LIMIT_REACHED_MESSAGE =
  `Workspace has been filled up. Please contact ${TEAM_LIMIT_SUPPORT_EMAIL}.`;

export function isTeamLimitEnabled(maxTeamMembers?: OrgLimitValue): boolean {
  return parseOrgLimitValue(maxTeamMembers) !== null;
}

export function isTeamLimitReached(maxTeamMembers?: OrgLimitValue, currentTeamCount = 0): boolean {
  const limit = parseOrgLimitValue(maxTeamMembers);
  return limit !== null && currentTeamCount >= limit;
}

export function getTeamLimitRemaining(maxTeamMembers?: OrgLimitValue, currentTeamCount = 0): number | null {
  const limit = parseOrgLimitValue(maxTeamMembers);
  if (limit === null) return null;
  return Math.max(0, limit - currentTeamCount);
}

export function formatTeamLimit(maxTeamMembers?: OrgLimitValue): string {
  return formatOrgLimitValue(maxTeamMembers);
}
