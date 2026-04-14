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
            // Do NOT call verify() here — it resets all record statuses to "pending"
            // while its async process runs, so get() immediately after always reads pending.
            // get() alone returns the real current status from Resend.

            try {
                const { data, error } = await resend.domains.get(org.resendDomainId);

                if (error) {
                    console.error("Resend get domain error:", error);
                }

                const records: any[] = (data as any)?.records || [];

                // Update DB if Resend now shows verified
                if (data?.status === "verified" && !org.isDomainVerified) {
                    await prisma.organization.update({
                        where: { id: session.orgId as string },
                        data: { isDomainVerified: true }
                    });
                    org.isDomainVerified = true;
                }

                return NextResponse.json({
                    ...org,
                    resendStatus: data?.status ?? (org.isDomainVerified ? "verified" : "pending"),
                    records
                });
            } catch (err) {
                console.error("Resend get domain failed:", err);
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

// POST /api/admin/organization/domain — trigger Resend to re-verify DNS records
export async function POST() {
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

        if (!org?.resendDomainId) {
            return NextResponse.json({ error: "No domain configured" }, { status: 400 });
        }

        // Trigger Resend to re-check DNS records
        await resend.domains.verify(org.resendDomainId);

        // Wait briefly for Resend to process, then read latest status
        await new Promise(r => setTimeout(r, 3000));

        const { data, error } = await resend.domains.get(org.resendDomainId);
        if (error) {
            console.error("Resend get after verify error:", error);
        }

        const records: any[] = (data as any)?.records || [];
        const isVerified = data?.status === "verified";

        if (isVerified && !org.isDomainVerified) {
            await prisma.organization.update({
                where: { id: session.orgId as string },
                data: { isDomainVerified: true }
            });
            org.isDomainVerified = true;
        }

        return NextResponse.json({
            ...org,
            resendStatus: data?.status ?? (org.isDomainVerified ? "verified" : "pending"),
            records
        });
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
            }
        });

        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}