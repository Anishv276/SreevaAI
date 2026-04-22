import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateId } from "../lib/ids";

const prisma = new PrismaClient();

async function main() {
    const email = "admin@sreeva";
    const password = "123456";
    const name = "Organization Admin";
    const orgId = "hire-org-id";

    console.log(`\n🚀 Setting up HR Admin: ${email}...`);
    
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.superAdmin.deleteMany({ where: { email } });

    // 1. Create or update the user
    const user = await prisma.user.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            role: "ADMIN",
            orgId: orgId,
            name,
        },
        create: {
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
    console.log(`\n👉 You can now log in at http://localhost:3000/login\n`);
}

main()
    .catch((e) => {
        console.error("❌ ERROR during setup:", e.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
