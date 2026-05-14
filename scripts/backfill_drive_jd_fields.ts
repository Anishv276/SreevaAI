/**
 * One-off script: backfill missing drive JD fields from description.
 * Run: npx tsx scripts/backfill_drive_jd_fields.ts
 * Optional: add --dry-run to preview updates without writing.
 */
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import { deriveDriveJdFieldsFromDescription } from "../lib/drive-jd";

dotenv.config();

const prisma = new PrismaClient();

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const drives = await prisma.drive.findMany({
    where: {},
    select: {
      id: true,
      title: true,
      description: true,
      skills: true,
      responsibilities: true,
      extractedDetails: true,
    },
    orderBy: { updatedAt: "asc" },
  });

  const targetDrives = drives.filter((drive) => {
    const description = asText(drive.description).trim();
    return Boolean(
      description &&
        (
          !asText(drive.skills).trim() ||
          !asText(drive.responsibilities).trim() ||
          !asText(drive.extractedDetails).trim()
        ),
    );
  });

  console.log(`Found ${targetDrives.length} drive(s) needing backfill${dryRun ? " (dry-run)" : ""}.`);

  let updated = 0;

  for (const drive of targetDrives) {
    const description = asText(drive.description).trim();
    if (!description) continue;

    const derived = await deriveDriveJdFieldsFromDescription(description);
    if (!derived) {
      console.log(`- Skipping "${drive.title}" (${drive.id}) - extraction returned nothing`);
      continue;
    }

    const patch: Record<string, any> = {};
    if (!asText(drive.skills).trim() && derived.skills) patch.skills = derived.skills;
    if (!asText(drive.responsibilities).trim() && derived.responsibilities) patch.responsibilities = derived.responsibilities;
    if (!asText(drive.extractedDetails).trim()) patch.extractedDetails = derived.extractedDetails;

    if (Object.keys(patch).length === 0) {
      console.log(`- Already filled "${drive.title}" (${drive.id})`);
      continue;
    }

    console.log(`- Backfilling "${drive.title}" (${drive.id})`, patch);
    if (!dryRun) {
      await prisma.drive.update({
        where: { id: drive.id },
        data: patch,
      });
      updated += 1;
    }
  }

  console.log(dryRun ? "Dry-run complete." : `Updated ${updated} drive(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
