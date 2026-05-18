const { listObjects } = require("../lib/s3");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  const bucket = process.env.R2_INTERVIEW_BUCKET || "hyring-interview-rec";
  const prefix = "candidates/vadla_vamsi_krishna_-_growth_engineer_gtm_automation_engineer_recruitment_drive/recordings";
  
  console.log(`Listing objects in bucket "${bucket}" with prefix "${prefix}"...`);
  try {
    const objects = await listObjects(bucket, prefix);
    console.log(`Found ${objects.length} objects:`);
    for (const obj of objects) {
      console.log(`- Key: ${obj.key}`);
      console.log(`  Size: ${(Number(obj.size || 0) / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Last Modified: ${obj.lastModified}`);
    }
  } catch (err) {
    console.error("Error listing objects:", err);
  }
}

main();
