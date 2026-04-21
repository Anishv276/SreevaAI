import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, createSession, isAdminRole } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { validatePasswordStrength } from "@/lib/validation";

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized: administrator access required" }, { status: 403 });
        }

        const body = await req.json();
        const { phase, data } = body;

        console.log(`[ONBOARDING API] Phase: ${phase}`, data);

        const response = NextResponse.json({ success: true });

        switch (phase) {
            case "profile": {
                // Now handled in bulk at the final step. 
                // We just return success to allow frontend to advance to next step.
                break;
            }

            case "security": {
                const { password, currentPassword } = data;
                const { isValid, error: strengthError } = validatePasswordStrength(password || "");
                if (!isValid) return NextResponse.json({ error: strengthError }, { status: 400 });

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
                break;
            }

            case "branding":
                // Handled in bulk at completion
                break;

            case "team":
                break;

            case "complete": {
                const { profile, company, passwords } = data;

                // VALIDATION
                if (!profile?.name || !profile?.jobTitle) {
                    return NextResponse.json({ error: "Profile name and job title are required." }, { status: 400 });
                }
                if (!company?.name || !company?.industry || !company?.size || !company?.website || !company?.location) {
                    return NextResponse.json({ error: "All company details are required." }, { status: 400 });
                }

                const org = await prisma.organization.findUnique({
                    where: { id: session.orgId as string },
                    select: { googleAccessToken: true, googleEmail: true }
                });

                if (!org?.googleAccessToken || !org.googleEmail) {
                    return NextResponse.json({ error: "Connect Gmail in step 3 before finishing onboarding." }, { status: 400 });
                }

                await prisma.$transaction(async (tx) => {
                    // 1. Update User Profile
                    const userUpdate: any = {
                        name: profile.name,
                        phone: profile.phone || null,
                        jobTitle: profile.jobTitle || null,
                    };

                    if (passwords?.next) {
                        const { isValid, error: strengthError } = validatePasswordStrength(passwords.next);
                        if (!isValid) throw new Error(strengthError);

                        const user = await tx.user.findUnique({
                            where: { id: session.userId },
                            select: { password: true }
                        });

                        if (user?.password) {
                            if (!passwords.current) throw new Error("Current password is required to update security credentials.");
                            const isMatch = await bcrypt.compare(passwords.current, user.password);
                            if (!isMatch) throw new Error("Verification failed: Current password is incorrect.");
                        }

                        userUpdate.password = await bcrypt.hash(passwords.next, 10);
                    }

                    await tx.user.update({
                        where: { id: session.userId },
                        data: userUpdate
                    });

                    // 2. Update Organization
                    await tx.organization.update({
                        where: { id: session.orgId as string },
                        data: {
                            name: company.name,
                            industry: company.industry,
                            size: company.size,
                            website: company.website,
                            location: company.location,
                            logoUrl: company.logoUrl,
                            onboardingComplete: true
                        }
                    });
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
