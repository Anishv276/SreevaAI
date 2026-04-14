import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  try {
    console.log('Attempting to connect to database...')
    const result = await prisma.$queryRaw`SELECT 1 as result`
    console.log('Successfully connected:', result)
  } catch (err) {
    console.error('Connection failed:', err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
