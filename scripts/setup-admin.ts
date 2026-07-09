import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateId } from "../lib/ids";
const prisma = new PrismaClient();
async function main() {
    const email = "superadmin@sreevaai.com";
    const password = "123456";
    const name = "System Administrator";
    console.log(`\n🚀 Initializing SaaS Super Admin...`);
    const hashedPassword = await bcrypt.hash(password, 10);
    const superAdmin = await prisma.superAdmin.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            name,
        },
        create: {
            email,
            password: hashedPassword,
            name,
        },
    });
    await prisma.organizationCredentials.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            name,
        },
        create: {
            id: generateId("usr", name),
            email,
            password: hashedPassword,
            name,
        },
    });
    console.log(`\n✅ SUCCESS: Super Admin Account is Ready!`);
    console.log(`📧 Email: ${superAdmin.email}`);
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
