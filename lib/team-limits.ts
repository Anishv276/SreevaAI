export const UNLIMITED_TEAM_MEMBERS = 0;
export const TEAM_LIMIT_SUPPORT_EMAIL = "support@sreevaai.com";
export const TEAM_LIMIT_REACHED_MESSAGE =
  `Workspace has been filled up. Please contact ${TEAM_LIMIT_SUPPORT_EMAIL}.`;

export function isTeamLimitEnabled(maxTeamMembers?: number | null): boolean {
  return Number(maxTeamMembers ?? 0) > UNLIMITED_TEAM_MEMBERS;
}

export function isTeamLimitReached(maxTeamMembers?: number | null, currentTeamCount = 0): boolean {
  const limit = Number(maxTeamMembers ?? 0);
  return limit > UNLIMITED_TEAM_MEMBERS && currentTeamCount >= limit;
}

export function getTeamLimitRemaining(maxTeamMembers?: number | null, currentTeamCount = 0): number | null {
  const limit = Number(maxTeamMembers ?? 0);
  if (!isTeamLimitEnabled(limit)) return null;
  return Math.max(0, limit - currentTeamCount);
}

export function formatTeamLimit(maxTeamMembers?: number | null): string {
  const limit = Number(maxTeamMembers ?? 0);
  return isTeamLimitEnabled(limit) ? String(limit) : "Unlimited";
}
