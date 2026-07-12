import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ca = readFileSync("./certs/supabase-root-ca.pem", "utf8");
const dbUrl = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || "");
dbUrl.searchParams.set("uselibpqcompat", "true");
dbUrl.searchParams.delete("sslmode");
const adapter = new PrismaPg({ connectionString: dbUrl.toString(), ssl: { rejectUnauthorized: true, ca } });
const prisma = new PrismaClient({ adapter });

async function main() {
  const updated = await prisma.organizationDetails.update({
    where: { id: "org-lumoscale-8836" },
    data: { recordingKeepForDays: 7 },
    select: { recordingKeepForDays: true },
  });
  console.log("Restored:", updated);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
