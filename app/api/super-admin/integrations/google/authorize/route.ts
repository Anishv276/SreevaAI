import { NextResponse } from "next/server";
import { getSuperAdminGoogleAuthUrl } from "@/lib/google-auth";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();

        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = getSuperAdminGoogleAuthUrl();

        return NextResponse.redirect(url);
    } catch (error) {
        console.error("[SUPER_ADMIN_GOOGLE_AUTH_AUTHORIZE]", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
