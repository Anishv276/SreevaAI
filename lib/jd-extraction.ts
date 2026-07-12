import { Queue } from "bullmq";
import redisConnection, { getBullPrefix } from "./redis";
export const JD_EXTRACTION_QUEUE_NAME = "jd-extraction";
export type JdExtractionJobData =
  | {
    kind: "file";
    fileName: string;
    buffer: Buffer | { type?: string; data?: number[] };
    orgOpenAIModel: string;
    orgId?: string;
  }
  | {
    kind: "url";
    url: string;
    orgOpenAIModel: string;
    orgId?: string;
  }
  | {
    kind: "text";
    text: string;
    orgOpenAIModel: string;
    orgId?: string;
  };
export type JdExtractionJobResult = {
  data: Record<string, any>;
  text?: string;
  usage?: any;
};
const defaultJobOptions = {
  removeOnComplete: { age: 600 }, // keep 20 min so frontend polling can read the result
  removeOnFail: { age: 600 },
};
let _queue: Queue | null = null;
function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(JD_EXTRACTION_QUEUE_NAME, {
      connection: redisConnection,
      prefix: getBullPrefix(),
      defaultJobOptions,
    });
  }
  return _queue;
}
/** Fire-and-forget: enqueues job and returns its ID immediately. */
export async function enqueueJdExtraction(jobData: JdExtractionJobData): Promise<string> {
  const job = await getQueue().add("extract", jobData, defaultJobOptions);
  return job.id!;
}
