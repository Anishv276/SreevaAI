import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/slack-error-logger";
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
        return apiErrorResponse({
            route: "/api/health",
            method: "GET",
            error,
            body: {
                status: "DOWN",
                timestamp: new Date().toISOString(),
                services: {
                    database: "DISCONNECTED",
                },
            },
            status: 503,
            logLabel: "[HEALTH_CHECK_ERROR]:",
        });
    }
}
