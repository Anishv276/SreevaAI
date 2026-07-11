import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, createSession, isAdminRole, invalidateUserSessions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { validatePasswordStrength } from "@/lib/validation";
export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.orgId || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Unauthorized: administrator access required" }, { status: 403 });
        }
        const { phase, data } = await req.json();
        if (phase !== "complete") {
            return NextResponse.json({ success: true });
        }
        const { company, passwords } = data;
        if (!company?.name) {
            return NextResponse.json({ error: "Company name is required." }, { status: 400 });
        }
        await prisma.$transaction(async (tx) => {
            const userUpdate: any = {};
            if (passwords?.next) {
                const { isValid, error: strengthError } = validatePasswordStrength(passwords.next);
                if (!isValid) throw new Error(strengthError);
                const user = await tx.organizationCredentials.findUnique({
                    where: { id: session.userId },
                    select: { password: true }
                });
                if (user?.password) {
                    if (!passwords.current) throw new Error("Current password is required to update security credentials.");
                    const isMatch = await bcrypt.compare(passwords.current, user.password);
                    if (!isMatch) throw new Error("Verification failed: Current password is incorrect.");
                }
                userUpdate.password = await bcrypt.hash(passwords.next, 10);
                await invalidateUserSessions(session.userId);
            }
            if (Object.keys(userUpdate).length > 0) {
                await tx.organizationCredentials.update({ where: { id: session.userId }, data: userUpdate });
            }
            await tx.organizationDetails.update({
                where: { id: session.orgId as string },
                data: {
                    name: company.name,
                    isOnboardingComplete: true,
                }
            });
        });
        const newToken = await createSession({ ...session, onboardingComplete: true });
        const response = NextResponse.json({ success: true });
        response.cookies.set("session", newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 7,
            path: "/",
        });
        return response;
    } catch (error: any) {
        console.error("[ONBOARDING_API_ERROR]", error);
        return NextResponse.json({ error: "Onboarding failed." }, { status: 500 });
    }
}
