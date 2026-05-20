import dotenv from "dotenv";
import { listObjects } from "../lib/s3";

dotenv.config();

async function run() {
  const bucket = process.env.R2_INTERVIEW_BUCKET || "interview";
  console.log("Bucket:", bucket);
  const prefix = "candidates/kotha_murali_krishna";
  const objs = await listObjects(bucket, prefix);
  console.log(`Found ${objs.length} objects:`);
  for (const obj of objs) {
    console.log(`- ${obj.key} (${obj.size} bytes)`);
  }
}

run().catch(console.error);
