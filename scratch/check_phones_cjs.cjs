const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkData() {
    try {
        console.log("--- Checking Admin User and Org Data ---");
        
        const user = await prisma.user.findUnique({
            where: { email: "education16414@gmail.com" },
            include: { organization: true }
        });

        if (user) {
            console.log("User found:");
            console.log(JSON.stringify({
                id: user.id,
                email: user.email,
                name: user.name,
                phone: user.phone,
                orgName: user.organization?.name,
                orgPhone: user.organization?.phone
            }, null, 2));
        } else {
            console.log("User Durga not found.");
        }
    } catch (error) {
        console.error("Error checking data:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkData();
