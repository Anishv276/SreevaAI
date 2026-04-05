import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const session = await getSession();
        if (!session || !session.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const team = await prisma.user.findMany({
            where: {
                orgId: session.orgId,
                role: { not: "CANDIDATE" }
            },
            orderBy: { createdAt: "desc" }
        });

        return NextResponse.json(team);
    } catch (error) {
        console.error("Fetch team error:", error);
        return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || !session.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { email, role } = await request.json();

        if (!email) {
            return NextResponse.json({ error: "Email required" }, { status: 400 });
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: "User already registered" }, { status: 400 });
        }

        const newUser = await prisma.user.create({
            data: {
                email,
                role: role || "RECRUITER",
                orgId: session.orgId,
                // In a real scenario, we'd send an invite email here
            }
        });

        return NextResponse.json(newUser);
    } catch (error) {
        console.error("Invite team error:", error);
        return NextResponse.json({ error: "Failed to invite member" }, { status: 500 });
    }
}
