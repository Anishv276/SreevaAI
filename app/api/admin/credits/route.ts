import { NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/auth";
import { getOrgCreditStatus } from "@/lib/credits";

export async function GET() {
    try {
        const session = await getSession();
        if (!session || !isAdminRole(session.role) || !session.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const status = await getOrgCreditStatus(session.orgId);
        return NextResponse.json(status);
    } catch (error) {
        console.error("[CREDITS] GET error:", error);
        return NextResponse.json({ error: "Failed to fetch credits" }, { status: 500 });
    }
}
