import { resumeQueue } from "../lib/queue";

async function main() {
  const counts = await resumeQueue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
  console.log("COUNTS", JSON.stringify(counts));

  for (const state of ["waiting", "active", "delayed", "failed", "completed"] as const) {
    const jobs = await resumeQueue.getJobs([state], 0, 20, true);
    console.log(
      "STATE",
      state,
      jobs.map((job) => ({
        id: job.id,
        name: job.name,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        data: job.data,
      }))
    );
  }

  await resumeQueue.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
