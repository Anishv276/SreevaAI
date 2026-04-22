import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateId } from "../lib/ids";

const prisma = new PrismaClient();

async function main() {
    const oldEmail = "lumoscale@gmail.com";
    const newEmail = "support@sreevaai.com";
    const password = "sreevaai@123";
    const name = "Super Administrator";

    console.log(`\n🚀 Migrating Super Admin credentials from ${oldEmail} to ${newEmail}...`);
    
    const hashedPassword = await bcrypt.hash(password, 10);

    // 1. Resolve conflict & Update existing SuperAdmin record
    const existingOld = await prisma.superAdmin.findUnique({ where: { email: oldEmail } });
    const existingNew = await prisma.superAdmin.findUnique({ where: { email: newEmail } });
    
    if (existingOld) {
        console.log(`Found legacy account ${oldEmail}. migrating...`);
        
        // If a new one was already created, delete it first to avoid unique constraint error
        if (existingNew && existingOld.id !== existingNew.id) {
            console.log(`Deleting temporary account ${newEmail} to resolve conflict...`);
            await prisma.superAdmin.delete({ where: { id: existingNew.id } });
        }

        await prisma.superAdmin.update({
            where: { id: existingOld.id },
            data: {
                email: newEmail,
                name: name,
                password: hashedPassword
            }
        });
    } else {
        await prisma.superAdmin.upsert({
            where: { email: newEmail },
            update: { password: hashedPassword, name },
            create: { email: newEmail, password: hashedPassword, name },
        });
    }

    // 2. Sync User record
    const existingUserOld = await prisma.user.findUnique({ where: { email: oldEmail } });
    const existingUserNew = await prisma.user.findUnique({ where: { email: newEmail } });

    if (existingUserOld) {
        if (existingUserNew && existingUserOld.id !== existingUserNew.id) {
            await prisma.user.delete({ where: { id: existingUserNew.id } });
        }

        await prisma.user.update({
            where: { id: existingUserOld.id },
            data: {
                email: newEmail,
                name: name,
                password: hashedPassword,
                role: "SUPER_ADMIN"
            }
        });
    } else {
        await prisma.user.upsert({
            where: { email: newEmail },
            update: { password: hashedPassword, role: "SUPER_ADMIN", name },
            create: { 
                id: generateId("usr", name),
                email: newEmail, 
                password: hashedPassword, 
                role: "SUPER_ADMIN", 
                name 
            },
        });
    }

    console.log(`\n✅ SUCCESS: Super Admin Credentials Migrated!`);
    console.log(`📧 Email: ${newEmail}`);
    console.log(`🔐 Password: ${password} (stored securely as hash)`);
    console.log(`\n👉 You can now log in at your deployment URL or localhost:3000/login\n`);
}

main()
    .catch((e) => {
        console.error("❌ ERROR during deployment:", e.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
