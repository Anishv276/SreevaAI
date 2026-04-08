
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  try {
    const drive = await prisma.drive.findFirst();
    console.log('Sample Drive:', JSON.stringify(drive, null, 2));
  } catch (err) {
    console.error('Fetch failed:', err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
