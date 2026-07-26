-- AlterTable
ALTER TABLE "Interview"
  DROP COLUMN "aiInterviewBrief";

-- AlterTable
ALTER TABLE "OrgUsageSummary"
  RENAME COLUMN "interviewBriefCostUsd" TO "questionBankCostUsd";
