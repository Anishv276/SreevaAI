import { normalizeOrgPlan, type OrgPlanId } from "@/lib/org-plans";
export type LandingPackageId = "STARTER" | "GROWTH" | "SCALE" | "BUSINESS";
export type LandingPackage = {
  id: LandingPackageId;
  name: string;
  price: string;
  suffix: string;
  interviewsIncluded: string;
  pricePerInterview: string;
  topup: string;
  cta: string;
  featured: boolean;
  description?: string;
  features: string[];
};
export const LANDING_PACKAGES: LandingPackage[] = [
  {
    id: "STARTER",
    name: "Starter",
    price: "$99",
    suffix: "/mo",
    interviewsIncluded: "30 interviews included",
    pricePerInterview: "$3.30",
    topup: "$4.00/interview",
    cta: "Book Demo",
    featured: false,
    description: "For teams piloting AI screening on 1–2 roles.",
    features: [
      "30 Interviews / month",
      "1 Active drive",
      "Resume screening",
      "Adaptive AI Interview",
      "Smart follow-ups",
      "AI Interview Report",
      "7 days Recording storage",
      "Email Support",
      "ATS integrations",
      "Multilingual interviews",
      "Top-up: $4.00/interview"
    ],
  },
  {
    id: "GROWTH",
    name: "Growth",
    price: "$299",
    suffix: "/mo",
    interviewsIncluded: "100 interviews included",
    pricePerInterview: "$2.99",
    topup: "$3.00/interview",
    cta: "Book Demo",
    featured: true,
    description: "For teams hiring across multiple roles each month.",
    features: [
      "100 Interviews / month",
      "5 Active drives",
      "Resume screening",
      "Adaptive AI Interview",
      "Smart follow-ups",
      "AI Interview Report",
      "Basic Integrity & proctoring",
      "14 days Recording storage",
      "Priority email Support",
      "ATS integrations",
      "Multilingual interviews",
      "Top-up: $3.00/interview"
    ],
  },
  {
    id: "SCALE",
    name: "Scale",
    price: "$699",
    suffix: "/mo",
    interviewsIncluded: "300 interviews included",
    pricePerInterview: "$2.33",
    topup: "$2.50/interview",
    cta: "Book Demo",
    featured: false,
    description: "For high-volume hiring or agencies.",
    features: [
      "300 Interviews / month",
      "10 Active drives",
      "Resume screening",
      "Adaptive AI Interview",
      "Smart follow-ups",
      "AI Interview Report",
      "Advanced Integrity & proctoring",
      "30 days Recording storage",
      "Priority + onboarding assist",
      "ATS integrations",
      "Multilingual interviews",
      "Top-up: $2.50/interview"
    ],
  },
  {
    id: "BUSINESS",
    name: "Business",
    price: "Custom",
    suffix: "",
    interviewsIncluded: "600+ interviews",
    pricePerInterview: "Custom",
    topup: "Custom",
    cta: "Talk to Us",
    featured: false,
    features: [
      "600+ Interviews / month",
      "Unlimited Active drives",
      "Resume screening",
      "Adaptive AI Interview",
      "Smart follow-ups",
      "AI Interview Report",
      "Advanced + custom policies",
      "Custom Recording storage",
      "Dedicated CSM Support",
      "ATS integrations (priority access)",
      "Multilingual interviews (early pilots)",
      "Top-up: Custom"
    ],
  },
];
const ORG_PLAN_TO_LANDING_PACKAGE: Record<OrgPlanId, LandingPackageId> = {
  STARTER: "STARTER",
  PRO: "GROWTH",
  BUSINESS: "SCALE",
  ENTERPRISE: "BUSINESS",
};
export function getLandingPackageById(id?: LandingPackageId | null): LandingPackage | null {
  if (!id) return null;
  return LANDING_PACKAGES.find((pkg) => pkg.id === id) || null;
}
export function getLandingPackageByName(name?: string | null): LandingPackage | null {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return null;
  return LANDING_PACKAGES.find((pkg) => pkg.name.toLowerCase() === normalized) || null;
}
export function getLandingPackageForOrgPlan(plan?: string | null): LandingPackage | null {
  const normalized = normalizeOrgPlan(plan);
  if (!normalized) return null;
  return getLandingPackageById(ORG_PLAN_TO_LANDING_PACKAGE[normalized]);
}
export function formatLandingPackageForOrgPlan(plan?: string | null): string {
  return getLandingPackageForOrgPlan(plan)?.name || "";
}
