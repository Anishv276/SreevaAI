import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateId } from "../lib/ids";
import { normalizeEmail } from "../lib/email";

const prisma = new PrismaClient();

async function main() {
    const email1 = normalizeEmail("admin@sreeva");
    const email2 = normalizeEmail("admin@sreevaai.com");
    const password = "123456";
    const name = "Organization Admin";
    const orgId = "hire-org-id";

    console.log(`\n🚀 Finalizing HR Admin setup...`);
    
    const hashedPassword = await bcrypt.hash(password, 10);

    const legacySuperAdmins = await prisma.superAdmin.findMany({
        where: {
            OR: [
                {
                    email: {
                        equals: email1,
                        mode: "insensitive",
                    },
                },
                {
                    email: {
                        equals: email2,
                        mode: "insensitive",
                    },
                },
            ],
        },
        select: { id: true },
    });

    for (const legacy of legacySuperAdmins) {
        await prisma.superAdmin.delete({ where: { id: legacy.id } });
    }

    const existingUser1 = await prisma.user.findFirst({
        where: {
            email: {
                equals: email1,
                mode: "insensitive",
            },
        },
    });
    const u1 = existingUser1
        ? await prisma.user.update({
            where: { id: existingUser1.id },
            data: { email: email1, password: hashedPassword, role: "ADMIN", orgId: orgId, name },
        })
        : await prisma.user.create({
            data: { id: generateId("usr", name), email: email1, password: hashedPassword, role: "ADMIN", orgId: orgId, name },
        });

    const existingUser2 = await prisma.user.findFirst({
        where: {
            email: {
                equals: email2,
                mode: "insensitive",
            },
        },
    });
    const u2 = existingUser2
        ? await prisma.user.update({
            where: { id: existingUser2.id },
            data: { email: email2, password: hashedPassword, role: "ADMIN", orgId: orgId, name },
        })
        : await prisma.user.create({
            data: { id: generateId("usr", name), email: email2, password: hashedPassword, role: "ADMIN", orgId: orgId, name },
        });

    console.log(`\n✅ SUCCESS: Admin Accounts are Ready!`);
    console.log(`📧 Emails: ${u1.email}, ${u2.email}`);
    console.log(`🔐 Role: ${u1.role}`);
    console.log(`🏢 Organization ID: ${orgId}`);
    console.log(`\n👉 You can now log in at https://sreevaai.com/login\n`);
}

main()
    .catch((e) => {
        console.error("❌ ERROR during setup:", e.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
