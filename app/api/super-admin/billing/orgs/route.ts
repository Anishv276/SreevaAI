import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/slack-error-logger";
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }
    const orgs = await prisma.organizationDetails.findMany({
      orderBy: { orgCreatedAt: "desc" },
        select: {
            id: true,
            name: true,
            urlSlug: true,
            billingPlan: true,
            orgStatus: true,
            totalInterviewsAllowed: true,
            totalInterviewsUsed: true,
            billingCreditsUsed: true,
            orgCreatedAt: true,
        },
    });
    return NextResponse.json({
        // Map DB column names to the shape the billing page's OrgSummary expects
        // (slug/plan/status). Previously the page read org.slug/plan/status which
        // were undefined because the raw columns are urlSlug/billingPlan/orgStatus.
        orgs: orgs.map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.urlSlug,
        plan: org.billingPlan,
        status: org.orgStatus,
        totalInterviewsAllowed: Number(org.totalInterviewsAllowed || 0),
        totalInterviewsUsed: Number(org.totalInterviewsUsed || 0),
        billingCreditsUsed: Number(org.billingCreditsUsed || 0),
        orgCreatedAt: org.orgCreatedAt,
      })),
    });
  } catch (error) {
    return apiErrorResponse({
      route: "/api/super-admin/billing/orgs",
      method: "GET",
      error,
      body: { error: "Failed to fetch organizations" },
      status: 500,
      logLabel: "[SUPER_ADMIN_BILLING_ORGS] GET error:",
    });
  }
}
