const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Verifying Supabase data...')
  const users = await prisma.user.count()
  const drives = await prisma.drive.count()
  const applications = await prisma.application.count()

  console.log(`Supabase Stats:`)
  console.log(`- Users: ${users}`)
  console.log(`- Drives: ${drives}`)
  console.log(`- Applications: ${applications}`)

  if (users > 0 && drives > 0) {
    console.log('✅ Migration verified: Data is present in Supabase!')
  } else {
    console.log('❌ Migration issue: Data might be missing.')
  }
}

main()
  .catch(e => {
    console.error('Verification failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
