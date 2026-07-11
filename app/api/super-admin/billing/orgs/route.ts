import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
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
        orgs: orgs.map((org) => ({
        ...org,
        totalInterviewsAllowed: Number(org.totalInterviewsAllowed || 0),
        totalInterviewsUsed: Number(org.totalInterviewsUsed || 0),
        billingCreditsUsed: Number(org.billingCreditsUsed || 0),
      })),
    });
  } catch (error) {
    console.error("[SUPER_ADMIN_BILLING_ORGS] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
  }
}
