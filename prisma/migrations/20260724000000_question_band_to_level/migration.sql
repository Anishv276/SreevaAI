-- AlterTable
ALTER TABLE "Job" ADD COLUMN "level" INTEGER DEFAULT 2;

-- Backfill existing rows from the old 3-tier band into the 1-4 level scale
UPDATE "Job" SET "level" = CASE "questionBand"
  WHEN 'fresher' THEN 1
  WHEN 'mid' THEN 2
  WHEN 'senior' THEN 4
  ELSE 2
END;

ALTER TABLE "Job" DROP COLUMN "questionBand";
