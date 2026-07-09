const { PrismaClient } = require('@prisma/client')
const fs = require('fs')

const prisma = new PrismaClient()

async function main() {
  const data = JSON.parse(fs.readFileSync('sqlite_backup.json', 'utf8'))
  
  console.log('Starting data import to Supabase...')

  // 1. Import Users
  console.log(`Importing ${data.users.length} users...`)
  for (const user of data.users) {
    // Omitting relations, just the core fields
    const { jobs, applications, ...userData } = user
    await prisma.user.upsert({
      where: { id: user.id },
      update: userData,
      create: userData
    })
  }

  // 2. Import Jobs
  console.log(`Importing ${data.jobs.length} jobs...`)
  for (const job of data.jobs) {
    const { applications, ...jobData } = job
    await prisma.job.upsert({
      where: { id: job.id },
      update: jobData,
      create: jobData
    })
  }

  // 3. Import Applications
  console.log(`Importing ${data.applications.length} applications...`)
  for (const app of data.applications) {
    await prisma.application.upsert({
      where: { id: app.id },
      update: app,
      create: app
    })
  }

  console.log('Data import completed successfully!')
}

main()
  .catch(e => {
    console.error('Import failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
