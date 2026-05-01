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
  askSreevaAI: boolean;
  cta: string;
  featured: boolean;
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
    topup: "$4.5/interview",
    askSreevaAI: false,
    cta: "Book Demo",
    featured: false,
    features: ["30 interviews included", "Price per interview: $3.30", "Topup: $4.5/interview"],
  },
  {
    id: "GROWTH",
    name: "Growth",
    price: "$299",
    suffix: "/mo",
    interviewsIncluded: "100 interviews included",
    pricePerInterview: "$2.99",
    topup: "$3.5/interview",
    askSreevaAI: true,
    cta: "Book Demo",
    featured: true,
    features: ["100 interviews included", "Price per interview: $2.99", "Topup: $3.5/interview", "Ask Sreeva AI"],
  },
  {
    id: "SCALE",
    name: "Scale",
    price: "$699",
    suffix: "/mo",
    interviewsIncluded: "300 interviews included",
    pricePerInterview: "$2.33",
    topup: "$2.8/interview",
    askSreevaAI: true,
    cta: "Book Demo",
    featured: false,
    features: ["300 interviews included", "Price per interview: $2.33", "Topup: $2.8/interview", "Ask Sreeva AI"],
  },
  {
    id: "BUSINESS",
    name: "Business",
    price: "Custom",
    suffix: "",
    interviewsIncluded: "600+ interviews",
    pricePerInterview: "Custom",
    topup: "Included",
    askSreevaAI: true,
    cta: "Talk to Us",
    featured: false,
    features: ["600+ interviews", "Price per interview: Custom", "Topup: Included", "Ask Sreeva AI"],
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
