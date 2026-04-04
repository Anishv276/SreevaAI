import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting database cleanup...')
  
  try {
    // Drop aiScore column
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Interview" 
      DROP COLUMN IF EXISTS "aiScore";
    `)
    console.log('✅ Column "aiScore" removed.')

    console.log('🎉 Database cleanup completed!')
  } catch (error) {
    console.error('❌ Cleanup failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
