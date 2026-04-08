import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const candidateId = process.argv[2]
  if (!candidateId) {
    console.log("Please provide a candidate ID")
    process.exit(1)
  }

  const candidate = await prisma.application.findUnique({
    where: { id: candidateId },
    include: { interview: true }
  })

  console.log("CANDIDATE_DATA_JSON_START")
  console.log(JSON.stringify(candidate, null, 2))
  console.log("CANDIDATE_DATA_JSON_END")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
