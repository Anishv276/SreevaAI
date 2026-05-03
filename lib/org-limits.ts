export const UNLIMITED_ORG_LIMIT_LABEL = "Unlimited";

export type OrgLimitValue = string | number | null | undefined;

function normalizeLimitString(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isUnlimitedOrgLimit(value: OrgLimitValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return value <= 0;

  const normalized = normalizeLimitString(value).toLowerCase();
  return (
    normalized === "" ||
    normalized === "0" ||
    normalized === "unlimited" ||
    normalized === "null" ||
    normalized === "none"
  );
}

export function parseOrgLimitValue(value: OrgLimitValue): number | null {
  if (isUnlimitedOrgLimit(value)) return null;

  const numeric = typeof value === "number" ? value : Number(normalizeLimitString(String(value)));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

export function formatOrgLimitValue(value: OrgLimitValue): string {
  const parsed = parseOrgLimitValue(value);
  return parsed === null ? UNLIMITED_ORG_LIMIT_LABEL : String(parsed);
}

export function normalizeOrgLimitInput(value: OrgLimitValue): string {
  return formatOrgLimitValue(value);
}
