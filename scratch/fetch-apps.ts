import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const ids = ["cmnrmo79n0005dhirs9x93adb", "cmnqc855k00011d0eht2yjtq9"];
    
    for (const id of ids) {
        const app = await prisma.application.findUnique({
            where: { id },
            include: {
                drive: true,
                interview: true
            }
        });
        
        if (app) {
            console.log(`\nAPPLICATION ID: ${app.id}`);
            console.log(`Candidate: ${app.fullName}`);
            console.log(`Email: ${app.email}`);
            console.log(`Role: ${app.drive.title}`);
            console.log(`Status: ${app.status}`);
            console.log(`Interview Status: ${app.interview?.status || "N/A"}`);
            // console.log(`AI Score: ${app.aiScore}`);
        } else {
            console.log(`\nAPPLICATION ID: ${id} - NOT FOUND`);
        }
    }
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
