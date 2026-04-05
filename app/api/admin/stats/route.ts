import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const orgId = session.orgId;
        const now = new Date();
        
        // Native JavaScript start of month: Year, Month, 1st day at midnight
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // 1. Active Drives
        const activeDrives = await prisma.drive.count({
            where: {
                orgId,
                status: { in: ['ACTIVE', 'Active'] }
            }
        });

        // 2. Total Candidates
        const totalCandidates = await prisma.application.count({
            where: {
                drive: { orgId }
            }
        });

        // 3. AI Interviews (Completed)
        const aiInterviews = await prisma.interview.count({
            where: {
                status: 'COMPLETED',
                application: {
                    drive: { orgId }
                }
            }
        });

        // 4. Hired This Month
        const hiredThisMonth = await prisma.application.count({
            where: {
                status: 'Hired',
                updatedAt: { gte: monthStart },
                drive: { orgId }
            }
        });

        return NextResponse.json({
            activeDrives,
            totalCandidates,
            aiInterviews,
            hiredThisMonth
        });
    } catch (error) {
        console.error("Dashboard stats error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
