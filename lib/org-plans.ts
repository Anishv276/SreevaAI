export type OrgPlanId = "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE";
export const ORG_PLAN_OPTIONS: Array<{
  id: OrgPlanId;
  label: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
}> = [
  { id: "STARTER", label: "Starter", desc: "$99/mo • 30 Interviews", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100" },
  { id: "PRO", label: "Growth", desc: "$299/mo • 100 Interviews", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100" },
  { id: "BUSINESS", label: "Scale", desc: "$699/mo • 300 Interviews", color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100" },
  { id: "ENTERPRISE", label: "Business", desc: "Custom • 600+ Interviews", color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-100" },
];
const LEGACY_PLAN_MAP: Record<string, OrgPlanId> = {
  LAUNCH: "STARTER",
  BUILD: "PRO",
  EXPAND: "BUSINESS",
  PRIME: "ENTERPRISE",
  TRIAL: "STARTER",
  PROFESSIONAL: "PRO",
  BUSINESS_PLUS: "BUSINESS",
  ENTERPRISE_CUSTOM: "ENTERPRISE",
  BASIC: "STARTER",
};
const PLAN_LABELS: Record<OrgPlanId, string> = ORG_PLAN_OPTIONS.reduce((acc, plan) => {
  acc[plan.id] = plan.label;
  return acc;
}, {} as Record<OrgPlanId, string>);
export const DEFAULT_ORG_PLAN: OrgPlanId = ORG_PLAN_OPTIONS[0].id;
export function normalizeOrgPlan(plan?: string | null): OrgPlanId | null {
  const raw = String(plan || "").trim().toUpperCase();
  if (!raw) return null;
  if (raw in PLAN_LABELS) return raw as OrgPlanId;
  return LEGACY_PLAN_MAP[raw] || null;
}
export function getDefaultMaxActiveJobsForPlan(plan?: string | null): number {
  const normalized = normalizeOrgPlan(plan);
  if (normalized === "STARTER") return 1;
  if (normalized === "PRO") return 5;
  if (normalized === "BUSINESS") return 10;
  return 0;
}
export function canUseMultilingual(plan?: string | null): boolean {
  const normalized = normalizeOrgPlan(plan);
  return normalized !== "STARTER";
}
export function isOrgPlan(plan?: string | null): plan is OrgPlanId {
  return Boolean(normalizeOrgPlan(plan));
}
export function formatOrgPlan(plan?: string | null): string {
  const normalized = normalizeOrgPlan(plan);
  if (normalized) return PLAN_LABELS[normalized];
  return String(plan || "").trim() || "";
}

/**
 * Synthesized plan billing values used as a FALLBACK when an org has no stored
 * planPriceUsd / billingCycle / nextBillingDate (rows predating those columns).
 * Mirrors the historical behaviour of app/api/super-admin/billing/route.ts and
 * the backfill in the add_usage_event_ledger migration, so stored and
 * synthesized values reconcile. `now` is injectable for testability.
 */
export function synthesizedPlanBilling(
  billingPlan?: string | null,
  now: Date = new Date()
): { priceUsd: number; billingCycle: string; nextBillingDate: Date } {
  const isScale = String(billingPlan || "").toLowerCase().includes("scale")
    || normalizeOrgPlan(billingPlan) === "BUSINESS";
  return {
    priceUsd: isScale ? 699 : 0,
    billingCycle: "Monthly",
    nextBillingDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}
