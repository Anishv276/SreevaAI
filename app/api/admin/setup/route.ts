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
            case "profile": {
                const { name, phone, jobTitle, password, currentPassword } = data;

                // Handle password update (stays on User — it's an auth concern)
                if (password) {
                    if (password.length < 8) {
                        return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
                    }
                    const user = await prisma.user.findUnique({
                        where: { id: session.userId },
                        select: { password: true }
                    });
                    if (user?.password) {
                        if (!currentPassword) {
                            return NextResponse.json({ error: "Current password is required." }, { status: 400 });
                        }
                        const isMatch = await bcrypt.compare(currentPassword, user.password);
                        if (!isMatch) {
                            return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
                        }
                    }
                    const hashed = await bcrypt.hash(password, 10);
                    await prisma.user.update({
                        where: { id: session.userId },
                        data: { password: hashed }
                    });
                }

                // Save name/phone/jobTitle to Organization table
                await prisma.organization.update({
                    where: { id: session.orgId },
                    data: {
                        ...(name !== undefined && { name }),
                        ...(phone !== undefined && { phone: phone || null }),
                        ...(jobTitle !== undefined && { jobTitle: jobTitle || null }),
                        onboardingStep: 1
                    }
                });
                break;
            }

            case "security": {
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
                await prisma.organization.update({
                    where: { id: session.orgId },
                    data: { onboardingStep: 1 }
                });
                break;
            }

            case "branding":
                // PERSISTENCE FIX: Save Name, Industry, Size, Website, Location, and Logo
                await prisma.organization.update({
                    where: { id: session.orgId },
                    data: {
                        name: data.name || undefined,
                        industry: data.industry,
                        size: data.size,
                        website: data.website,
                        location: data.location,
                        logoUrl: data.logoUrl,
                        onboardingStep: 3
                    }
                });
                break;

            case "goals":
                await prisma.organization.update({
                    where: { id: session.orgId },
                    data: {
                        expectedDrives: data.expectedDrives ? parseInt(data.expectedDrives) : null,
                        expectedCandidates: data.expectedCandidates ? parseInt(data.expectedCandidates) : null,
                        expectedInterviews: data.expectedInterviews ? parseInt(data.expectedInterviews) : null,
                        onboardingStep: 4
                    }
                });
                break;

            case "team":
                await prisma.organization.update({
                    where: { id: session.orgId },
                    data: {
                        onboardingStep: 3
                    }
                });
                break;

            case "email":
                // Legacy compatibility or fallback
                await prisma.organization.update({
                    where: { id: session.orgId },
                    data: {
                        customSenderEmail: data.senderEmail,
                        customSenderName: data.senderName
                    }
                });
                break;

            case "complete":
                // ACTIVATION FIX: Hard-stamp the initialization flag
                await prisma.organization.update({
                    where: { id: session.orgId },
                    data: { 
                        onboardingComplete: true,
                        onboardingStep: 5
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
