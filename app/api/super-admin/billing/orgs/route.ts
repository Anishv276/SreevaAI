import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
    }
    const orgs = (await prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
        select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true,
            logoUrl: true,
            interviewQuotaTotal: true,
            interviewQuotaUsed: true,
            creditsUsed: true,
            createdAt: true,
        } as any,
    } as any)) as any[];
    return NextResponse.json({
        orgs: orgs.map((org) => ({
        ...org,
        interviewQuotaTotal: Number(org.interviewQuotaTotal || 0),
        interviewQuotaUsed: Number(org.interviewQuotaUsed || 0),
        creditsUsed: Number(org.creditsUsed || 0),
      })),
    });
  } catch (error) {
    console.error("[SUPER_ADMIN_BILLING_ORGS] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
  }
}
