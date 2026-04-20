import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// POST /api/super-admin/setup/domain - register platform domain
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== "SUPER_ADMIN") {
            return NextResponse.json({ error: "Not authorized" }, { status: 401 });
        }

        const { domain: rawDomain } = await request.json();
        if (!rawDomain) return NextResponse.json({ error: "Domain is required" }, { status: 400 });
        const domain = rawDomain.trim().toLowerCase().replace(/^www\./, "");

        // 0. Check if this domain is already registered by ANY organization
        const existingOrg = await prisma.organization.findFirst({
            where: { customDomain: domain },
            select: { id: true, name: true }
        });

        if (existingOrg) {
            return NextResponse.json({ 
                error: `This domain is already registered by a workspace (${existingOrg.name}). Please use a different platform domain.` 
            }, { status: 400 });
        }

        // 1. Check if domain already exists in SuperAdmin
        const adminEmail = session.email;
        if (!adminEmail) return NextResponse.json({ error: "Context email not found" }, { status: 400 });

        const config = await prisma.superAdmin.findUnique({
            where: { email: adminEmail }
        });

        if (!config) return NextResponse.json({ error: "Super Admin record not found" }, { status: 404 });

        if (config.customDomain === domain && config.isDomainVerified) {
            return NextResponse.json({
                registeredOnPlatform: true,
                isVerified: true,
                alreadyVerified: true
            });
        }

        // 2. Check Resend
        const { data: listData } = await resend.domains.list();
        const existing = (listData as any)?.data?.find((d: any) => d.name === domain);

        if (existing) {
            const isVerified = existing.status === "verified";
            await prisma.superAdmin.update({
                where: { id: config.id },
                data: {
                    customDomain: domain,
                    resendDomainId: existing.id,
                    isDomainVerified: isVerified,
                    // If already verified, instantly hook up the default sender to bypass step 3
                    ...(isVerified && {
                        customSenderEmail: `security@${domain}`,
                        customSenderName: "Lumoscale Platform"
                    })
                }
            });
            return NextResponse.json({ fresh: true });
        }

        // 3. Create in Resend
        const { data, error } = await resend.domains.create({ name: domain });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        await prisma.superAdmin.update({
            where: { id: config.id },
            data: {
                customDomain: domain,
                resendDomainId: data!.id,
                isDomainVerified: false
            }
        });

        return NextResponse.json({ fresh: true });
    } catch (err: any) {
        console.error("[SuperAdmin Domain POST Error]:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// GET /api/super-admin/setup/domain - get platform domain registration status
export async function GET() {
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
            return NextResponse.json({ error: "No platform domain configured." }, { status: 404 });
        }

        const { data, error } = await resend.domains.get(config.resendDomainId);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        if (data?.status === "verified") {
            if (!config.isDomainVerified) {
                await prisma.superAdmin.update({
                    where: { id: config.id },
                    data: { 
                        isDomainVerified: true,
                        // Auto-fill sender on first successful verify to bypass step 3 setup
                        customSenderEmail: `security@${config.customDomain}`,
                        customSenderName: "Lumoscale Platform"
                    }
                });
            }
        } else if (config.isDomainVerified) {
            await prisma.superAdmin.update({
                where: { id: config.id },
                data: { isDomainVerified: false }
            });
        }

        return NextResponse.json({ 
            status: data?.status, 
            records: data?.records,
            customDomain: config.customDomain 
        });
    } catch (err: any) {
        console.error("[SuperAdmin Domain GET Error]:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
