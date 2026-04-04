const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Dropping AssessmentResponse...");
        await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "AssessmentResponse" CASCADE');
        
        console.log("Dropping AssessmentQuestion...");
        await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "AssessmentQuestion" CASCADE');
        
        console.log("Dropping Assessment...");
        await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "Assessment" CASCADE');
        
        console.log("✅ Success: Assessment, AssessmentQuestion, and AssessmentResponse tables dropped.");
    } catch (error) {
        console.error("❌ Error dropping tables:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
