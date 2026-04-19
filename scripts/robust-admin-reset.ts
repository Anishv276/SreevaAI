import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateId } from "../lib/ids";

const prisma = new PrismaClient();

async function main() {
    const email1 = "admin@lumoscale";
    const email2 = "admin@lumoscale.ai";
    const password = "123456";
    const name = "Organization Admin";
    const orgId = "hire-org-id";

    console.log(`\n🚀 Finalizing HR Admin setup...`);
    
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.superAdmin.deleteMany({ where: { email: { in: [email1, email2] } } });

    const u1 = await prisma.user.upsert({
        where: { email: email1 },
        update: { password: hashedPassword, role: "ADMIN", orgId: orgId, name },
        create: { id: generateId("usr", name), email: email1, password: hashedPassword, role: "ADMIN", orgId: orgId, name },
    });

    const u2 = await prisma.user.upsert({
        where: { email: email2 },
        update: { password: hashedPassword, role: "ADMIN", orgId: orgId, name },
        create: { id: generateId("usr", name), email: email2, password: hashedPassword, role: "ADMIN", orgId: orgId, name },
    });

    console.log(`\n✅ SUCCESS: Admin Accounts are Ready!`);
    console.log(`📧 Emails: ${u1.email}, ${u2.email}`);
    console.log(`🔐 Role: ${u1.role}`);
    console.log(`🏢 Organization ID: ${orgId}`);
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
