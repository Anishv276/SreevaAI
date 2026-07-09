import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdminRole } from "@/lib/auth";

const TEST_KEY = process.env.TEST_PAGE_KEY || process.env.NEXT_PUBLIC_TEST_KEY || "1285";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        if (searchParams.get("key") !== TEST_KEY) {
            return NextResponse.json({ error: "Invalid test key" }, { status: 403 });
        }

        const orgs = await prisma.organizationDetails.findMany({
            where: { isDeleted: false },
            select: { id: true, name: true, urlSlug: true, orgStatus: true },
            orderBy: { name: "asc" },
        });

        return NextResponse.json({ orgs });
    } catch (e) {
        console.error("[TEST_ORGS]", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
