import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const driveId = searchParams.get("driveId");
        const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 100);

        const where: any = {};
        if (driveId) {
            where.driveId = driveId;
        }

        const imports = await prisma.bulkImport.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
                id: true,
                driveId: true,
                status: true,
                totalCount: true,
                processedCount: true,
                failedCount: true,
                errorMessage: true,
                createdAt: true,
                completedAt: true,
            },
        });

        return NextResponse.json(imports);

    } catch (error) {
        console.error("[BULK IMPORT HISTORY] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch history: " + (error as Error).message },
            { status: 500 }
        );
    }
}
