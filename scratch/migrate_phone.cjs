const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function migratePhone() {
    try {
        console.log("--- Migrating Phone Number from Org to User ---");
        
        const user = await prisma.user.findUnique({
            where: { email: "education16414@gmail.com" },
            include: { organization: true }
        });

        if (user && user.organization && user.organization.phone && !user.phone) {
            console.log(`Found Org Phone: ${user.organization.phone}. Migrating to User...`);
            
            await prisma.user.update({
                where: { id: user.id },
                data: { phone: user.organization.phone }
            });

            console.log("Migration successful.");
        } else {
            console.log("No migration needed or user/org not found.");
        }
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

migratePhone();
