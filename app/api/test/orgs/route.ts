import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTestAccessAuthorized } from "@/lib/test-key";
import { apiErrorResponse } from "@/lib/slack-error-logger";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        if (!(await isTestAccessAuthorized(searchParams.get("key")))) {
            return NextResponse.json({ error: "Invalid test key" }, { status: 403 });
        }

        const orgs = await prisma.organizationDetails.findMany({
            where: { isDeleted: false },
            select: { id: true, name: true, urlSlug: true, orgStatus: true },
            orderBy: { name: "asc" },
        });

        return NextResponse.json({ orgs });
    } catch (e) {
        return apiErrorResponse({
            route: "/api/test/orgs",
            method: "GET",
            error: e,
            body: { error: "Failed" },
            status: 500,
            logLabel: "[TEST_ORGS]",
        });
    }
}
