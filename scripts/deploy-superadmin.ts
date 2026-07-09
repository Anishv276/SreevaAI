import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateId } from "../lib/ids";
import { normalizeEmail } from "../lib/email";
const prisma = new PrismaClient();
async function main() {
    const oldEmail = normalizeEmail("lumoscale@gmail.com");
    const newEmail = normalizeEmail("support@sreevaai.com");
    // Never hardcode the credential. Supply it at run time:
    //   SUPERADMIN_PASSWORD='...' npx tsx scripts/deploy-superadmin.ts
    const password = process.env.SUPERADMIN_PASSWORD?.trim();
    if (!password || password.length < 12) {
        console.error("❌ SUPERADMIN_PASSWORD env var is required (min 12 chars). Aborting.");
        process.exit(1);
    }
    const name = "Super Administrator";
    console.log(`\n🚀 Migrating Super Admin credentials from ${oldEmail} to ${newEmail}...`);
    const hashedPassword = await bcrypt.hash(password, 10);
    // 1. Resolve conflict & Update existing SuperAdmin record
    const existingOld = await prisma.superAdmin.findFirst({
        where: {
            email: {
                equals: oldEmail,
                mode: "insensitive",
            },
        },
    });
    const existingNew = await prisma.superAdmin.findFirst({
        where: {
            email: {
                equals: newEmail,
                mode: "insensitive",
            },
        },
    });
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
    const existingUserOld = await prisma.organizationCredentials.findFirst({
        where: {
            email: {
                equals: oldEmail,
                mode: "insensitive",
            },
        },
    });
    const existingUserNew = await prisma.organizationCredentials.findFirst({
        where: {
            email: {
                equals: newEmail,
                mode: "insensitive",
            },
        },
    });
    if (existingUserOld) {
        if (existingUserNew && existingUserOld.id !== existingUserNew.id) {
            await prisma.organizationCredentials.delete({ where: { id: existingUserNew.id } });
        }
        await prisma.organizationCredentials.update({
            where: { id: existingUserOld.id },
            data: {
                email: newEmail,
                name: name,
                password: hashedPassword,
                platformRole: "SUPER_ADMIN"
            }
        });
    } else {
        await prisma.organizationCredentials.upsert({
            where: { email: newEmail },
            update: { password: hashedPassword, platformRole: "SUPER_ADMIN", name },
            create: {
                id: generateId("usr", name),
                email: newEmail,
                password: hashedPassword,
                platformRole: "SUPER_ADMIN",
                name
            },
        });
    }
    console.log(`\n✅ SUCCESS: Super Admin Credentials Migrated!`);
    console.log(`📧 Email: ${newEmail}`);
    console.log(`🔐 Password: (set from SUPERADMIN_PASSWORD env var, stored as bcrypt hash)`);
    console.log(`\n👉 You can now log in at your deployment URL or https://sreevaai.com/login\n`);
}
main()
    .catch((e) => {
        console.error("❌ ERROR during deployment:", e.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
