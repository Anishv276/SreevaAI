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
    topup: "$4.50/interview",
    cta: "Book Demo",
    featured: false,
    features: [
      "30 interviews included",
      "Up to 20 min per interview",
      "Top-up: $4.50/interview",
    ],
  },
  {
    id: "GROWTH",
    name: "Growth",
    price: "$299",
    suffix: "/mo",
    interviewsIncluded: "100 interviews included",
    pricePerInterview: "$2.99",
    topup: "$3.50/interview",
    cta: "Book Demo",
    featured: true,
    features: [
      "100 interviews included",
      "Up to 20 min per interview",
      "Top-up: $3.50/interview",
    ],
  },
  {
    id: "SCALE",
    name: "Scale",
    price: "$699",
    suffix: "/mo",
    interviewsIncluded: "300 interviews included",
    pricePerInterview: "$2.33",
    topup: "$2.80/interview",
    cta: "Book Demo",
    featured: false,
    features: [
      "300 interviews included",
      "Up to 20 min per interview",
      "Top-up: $2.80/interview",
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
      "600+ interviews",
      "Custom interview duration",
      "Top-ups included or custom",
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
