import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function GET() {
    try {
        // Perform a lightweight database query to verify connection
        await prisma.$queryRaw`SELECT 1`;
        return NextResponse.json({
            status: "UP",
            timestamp: new Date().toISOString(),
            services: {
                database: "CONNECTED",
                uptime_monitoring: "ACTIVE"
            }
        });
    } catch (error: any) {
        console.error("[HEALTH_CHECK_ERROR]:", error);
        return NextResponse.json({
            status: "DOWN",
            timestamp: new Date().toISOString(),
            error: error.message || "Unknown error connecting to database"
        }, { status: 503 });
    }
}
