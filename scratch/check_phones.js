import { prisma } from "./lib/prisma.js";

async function checkData() {
    try {
        console.log("--- Checking Admin User and Org Data ---");
        
        // Find the user Durga (email: education16414@gmail.com)
        const user = await prisma.user.findUnique({
            where: { email: "education16414@gmail.com" },
            include: { organization: true }
        });

        if (user) {
            console.log("User found:");
            console.log(`- ID: ${user.id}`);
            console.log(`- Email: ${user.email}`);
            console.log(`- Name: ${user.name}`);
            console.log(`- Phone (Personal): ${user.phone}`);
            
            if (user.organization) {
                console.log("\nOrganization found:");
                console.log(`- Org ID: ${user.organization.id}`);
                console.log(`- Org Name: ${user.organization.name}`);
                console.log(`- Phone (Company): ${user.organization.phone}`);
            } else {
                console.log("\nNo organization linked to this user.");
            }
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
