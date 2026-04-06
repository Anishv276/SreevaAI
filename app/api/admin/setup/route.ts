import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, createSession } from "@/lib/auth";
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

        let response = NextResponse.json({ success: true });

        switch (phase) {
            case "security":
                const { password, currentPassword } = data;
                if (!password || password.length < 8) {
                    return NextResponse.json({ error: "Invalid password format." }, { status: 400 });
                }

                // SECURITY HANDSHAKE: Verify current password
                const user = await prisma.user.findUnique({
                    where: { id: session.userId },
                    select: { password: true }
                });

                if (user?.password) {
                    if (!currentPassword) {
                        return NextResponse.json({ error: "Current password is required for security verification." }, { status: 400 });
                    }
                    const isMatch = await bcrypt.compare(currentPassword, user.password);
                    if (!isMatch) {
                        return NextResponse.json({ error: "Security violation: Current password does not match original signature." }, { status: 403 });
                    }
                }

                const hashedPassword = await bcrypt.hash(password, 10);
                await prisma.user.update({
                    where: { id: session.userId },
                    data: { password: hashedPassword }
                });
                // PROGRESS TRACKING
                await prisma.organization.update({
                    where: { id: session.orgId },
                    data: { onboardingStep: 1 }
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
                        logoUrl: data.logoUrl,
                        onboardingStep: 2
                    }
                });
                break;

            case "email":
                await prisma.organization.update({
                    where: { id: session.orgId },
                    data: {
                        customSenderEmail: data.senderEmail,
                        customSenderName: data.senderName,
                        onboardingStep: 4
                    } as any
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
                        onboardingStep: 6 
                    }
                });

                // Update the JWT session so middleware reflects completion
                const newToken = await createSession({
                    ...session,
                    onboardingComplete: true
                });

                response.cookies.set("session", newToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: "lax",
                    maxAge: 60 * 60 * 24 * 7,
                    path: "/",
                });
                break;
        }

        return response;
    } catch (error: any) {
        console.error("[ONBOARDING_API_ERROR]", error);
        return NextResponse.json({ 
            error: error.message || "Protocol Failure in onboarding handshake.",
            details: error.code
        }, { status: 500 });
    }
}
