
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  try {
    console.log('Checking for slug column...')
    const result = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Drive' AND column_name = 'slug';
    `
    console.log('Query result:', result)

    if (Array.isArray(result) && result.length === 0) {
      console.log('Slug column missing. Adding it...')
      await prisma.$executeRawUnsafe('ALTER TABLE "Drive" ADD COLUMN IF NOT EXISTS "slug" TEXT;')
      await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Drive_slug_key" ON "Drive"("slug");')
      console.log('Slug column added successfully.')
    } else {
      console.log('Slug column already exists.')
    }
  } catch (err) {
    console.error('Migration failed:', err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
