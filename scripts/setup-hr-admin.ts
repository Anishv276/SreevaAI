import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateId } from "../lib/ids";
import { normalizeEmail } from "../lib/email";
const prisma = new PrismaClient();
async function main() {
    const email = normalizeEmail("admin@sreeva");
    const password = "123456";
    const name = "Organization Admin";
    const orgId = "hire-org-id";
    console.log(`\n🚀 Setting up HR Admin: ${email}...`);
    const hashedPassword = await bcrypt.hash(password, 10);
    const legacySuperAdmins = await prisma.superAdmin.findMany({
        where: {
            email: {
                equals: email,
                mode: "insensitive",
            },
        },
        select: { id: true },
    });
    for (const legacy of legacySuperAdmins) {
        await prisma.superAdmin.delete({ where: { id: legacy.id } });
    }
    const existingUser = await prisma.user.findFirst({
        where: {
            email: {
                equals: email,
                mode: "insensitive",
            },
        },
    });
    // 1. Create or update the user
    const user = existingUser
        ? await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                email,
                password: hashedPassword,
                role: "ADMIN",
                orgId: orgId,
                name,
            },
        })
        : await prisma.user.create({
            data: {
                id: generateId("usr", name),
                email,
                password: hashedPassword,
                role: "ADMIN",
                orgId: orgId,
                name,
            },
        });
    console.log(`\n✅ SUCCESS: Admin Account is Ready!`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`🔐 Role: ${user.role}`);
    console.log(`🏢 Org ID: ${user.orgId}`);
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
