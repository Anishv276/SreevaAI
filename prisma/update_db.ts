import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting database migration...')
  
  try {
    // Add aiSummary column if it doesn't exist
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview" 
      ADD COLUMN IF NOT EXISTS "aiSummary" TEXT;
    `)
    console.log('✅ Column "aiSummary" ensured.')

    // Add aiScore column if it doesn't exist
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview" 
      ADD COLUMN IF NOT EXISTS "aiScore" INTEGER;
    `)
    console.log('✅ Column "aiScore" ensured.')

    console.log('🎉 Database migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
