import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const org = await prisma.organization.findUnique({
            where: { id: session.orgId as string },
            select: { 
                customDomain: true, 
                resendDomainId: true, 
                isDomainVerified: true,
                customSenderName: true,
                customSenderEmail: true
            }
        });

        if (!org?.customDomain) return NextResponse.json({ domain: null });

        if (org.resendDomainId) {
            try {
                const { data } = await resend.domains.get(org.resendDomainId);
                const records: any[] = (data as any)?.records || [];

                // Update DB if Resend now shows verified
                if (data?.status === "verified" && !org.isDomainVerified) {
                    await prisma.organization.update({
                        where: { id: session.orgId as string },
                        data: { isDomainVerified: true } as any
                    });
                    org.isDomainVerified = true;
                }

                return NextResponse.json({
                    ...org,
                    resendStatus: data?.status ?? (org.isDomainVerified ? "verified" : "pending"),
                    records
                });
            } catch {
                // Resend API unavailable — fall back to DB state
                return NextResponse.json({
                    ...org,
                    resendStatus: org.isDomainVerified ? "verified" : "pending",
                    records: []
                });
            }
        }

        return NextResponse.json(org);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

        const org = await prisma.organization.findUnique({
            where: { id: session.orgId as string },
            select: { resendDomainId: true }
        });

        // 1. Delete from Resend if exists
        if (org?.resendDomainId) {
            await resend.domains.remove(org.resendDomainId);
        }

        // 2. Clear from Prisma
        await prisma.organization.update({
            where: { id: session.orgId as string },
            data: {
                customDomain: null,
                resendDomainId: null,
                isDomainVerified: false,
                customSenderEmail: null,
                customSenderName: null
            } as any
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}