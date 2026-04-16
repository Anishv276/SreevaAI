import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// GET /api/super-admin/domain — fetch platform domain info
export async function GET() {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        }

        const adminEmail = session.email;
        if (!adminEmail) return NextResponse.json({ error: "Context email not found" }, { status: 400 });

        const config = await prisma.superAdmin.findUnique({
            where: { email: adminEmail }
        });

        if (!config?.customDomain) return NextResponse.json({ domain: null });

        if (config.resendDomainId) {
            const { data, error } = await resend.domains.get(config.resendDomainId);
            if (error) console.error("Resend get platform domain error:", error);

            const isVerified = data?.status === "verified";
            if (isVerified && (!config.isDomainVerified || !config.customSenderEmail)) {
                await prisma.superAdmin.update({
                    where: { id: config.id },
                    data: {
                        isDomainVerified: true,
                        // Keep the sender aligned with the verified platform domain
                        customSenderEmail: config.customSenderEmail || `security@${config.customDomain}`,
                        customSenderName: config.customSenderName || "Lumoscale Platform"
                    }
                });
                config.isDomainVerified = true;
                if (!config.customSenderEmail) {
                    config.customSenderEmail = `security@${config.customDomain}`;
                    config.customSenderName = "Lumoscale Platform";
                }
            } else if (!isVerified && config.isDomainVerified) {
                await prisma.superAdmin.update({
                    where: { id: config.id },
                    data: { isDomainVerified: false }
                });
                config.isDomainVerified = false;
            }

            return NextResponse.json({
                ...config,
                resendStatus: data?.status ?? (config.isDomainVerified ? "verified" : "pending"),
                records: (data as any)?.records || []
            });
        }

        return NextResponse.json(config);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST /api/super-admin/domain — trigger DNS re-verification
export async function POST() {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        }

        const adminEmail = session.email;
        const config = await prisma.superAdmin.findUnique({
            where: { email: adminEmail }
        });

        if (!config?.resendDomainId) {
            return NextResponse.json({ error: "No platform domain configured" }, { status: 400 });
        }

        await resend.domains.verify(config.resendDomainId);
        await new Promise(r => setTimeout(r, 3000));

        const { data, error } = await resend.domains.get(config.resendDomainId);
        if (error) console.error("Resend verify check error:", error);

        const isVerified = data?.status === "verified";
        if (isVerified && (!config.isDomainVerified || !config.customSenderEmail)) {
            await prisma.superAdmin.update({
                where: { id: config.id },
                data: {
                    isDomainVerified: true,
                    // Keep the sender aligned with the verified platform domain
                    customSenderEmail: config.customSenderEmail || `security@${config.customDomain}`,
                    customSenderName: config.customSenderName || "Lumoscale Platform"
                }
            });
            config.isDomainVerified = true;
            if (!config.customSenderEmail) {
                config.customSenderEmail = `security@${config.customDomain}`;
                config.customSenderName = "Lumoscale Platform";
            }
        } else if (!isVerified && config.isDomainVerified) {
            await prisma.superAdmin.update({
                where: { id: config.id },
                data: { isDomainVerified: false }
            });
            config.isDomainVerified = false;
        }

        return NextResponse.json({
            ...config,
            resendStatus: data?.status ?? (config.isDomainVerified ? "verified" : "pending"),
            records: (data as any)?.records || []
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// PATCH /api/super-admin/domain — update sender details
export async function PATCH(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        }

        const body = await request.json();
        const { customSenderName, customSenderEmail } = body;

        const adminEmail = session.email;
        const updated = await prisma.superAdmin.update({
            where: { email: adminEmail },
            data: {
                customSenderName,
                customSenderEmail
            }
        });

        return NextResponse.json(updated);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// DELETE /api/super-admin/domain — remove platform domain
export async function DELETE() {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        }

        const adminEmail = session.email;
        const config = await prisma.superAdmin.findUnique({
            where: { email: adminEmail }
        });

        if (config?.resendDomainId) {
            await resend.domains.remove(config.resendDomainId);
        }

        await prisma.superAdmin.update({
            where: { id: config!.id },
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
