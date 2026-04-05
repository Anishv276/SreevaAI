import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { phase, data } = body;

        console.log(`[ONBOARDING API] Phase: ${phase}`, data);

        switch (phase) {
            case "security":
                const { password } = data;
                if (!password || password.length < 8) {
                    return NextResponse.json({ error: "Invalid password" }, { status: 400 });
                }
                const hashedPassword = await bcrypt.hash(password, 10);
                await prisma.user.update({
                    where: { id: session.userId },
                    data: { password: hashedPassword }
                });
                break;

            case "branding":
                // PERSISTENCE FIX: Save Name, Industry, Size, Website, Location, and Logo
                await prisma.organization.update({
                    where: { id: session.orgId },
                    data: {
                        name: data.name || undefined,
                        industry: data.industry,
                        size: data.size,
                        website: data.website,
                        // @ts-ignore
                        location: data.location,
                        logoUrl: data.logoUrl
                    }
                });
                break;

            case "complete":
                // ACTIVATION FIX: Hard-stamp the initialization flag
                await prisma.organization.update({
                    where: { id: session.orgId },
                    data: { 
                        // @ts-ignore
                        onboardingComplete: true,
                        // @ts-ignore
                        onboardingStep: 5 
                    }
                });
                break;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Setup error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
