import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import redis from "@/lib/redis";

export async function POST() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("session")?.value;

        if (token && redis) {
            // Blacklist for 2h — that's the max token lifetime now
            await redis.set(`blacklist:${token}`, "1", "EX", 60 * 60 * 2);
        }
    } catch (e) {
        console.error("[LOGOUT_ERROR]", e);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set("session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
    });
    return response;
}
