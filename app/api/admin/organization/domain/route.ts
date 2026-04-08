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

        // Refresh status from Resend if not verified yet
        if (org.resendDomainId && !org.isDomainVerified) {
            const { data } = await resend.domains.get(org.resendDomainId);
            const records: any[] = (data as any)?.records || [];
            if (data?.status === "verified") {
                await prisma.organization.update({
                    where: { id: session.orgId as string },
                    data: { isDomainVerified: true } as any
                });
                org.isDomainVerified = true;
            }
            return NextResponse.json({ 
                ...org, 
                resendStatus: data?.status, 
                records
            });
        }

        // If already verified or no ID, just return what we have
        if (org.resendDomainId) {
            const { data } = await resend.domains.get(org.resendDomainId);
            const records: any[] = (data as any)?.records || [];
            return NextResponse.json({ 
                ...org, 
                resendStatus: data?.status, 
                records
            });
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