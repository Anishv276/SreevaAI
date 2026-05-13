import { Queue, QueueEvents } from "bullmq";
import redisConnection from "./redis";

export const JD_EXTRACTION_QUEUE_NAME = "jd-extraction";

export type JdExtractionJobData =
  | {
      kind: "file";
      fileName: string;
      buffer: Buffer | { type?: string; data?: number[] };
      orgOpenAIModel: string;
    }
  | {
      kind: "url";
      url: string;
      orgOpenAIModel: string;
    }
  | {
      kind: "text";
      text: string;
      orgOpenAIModel: string;
    };

export type JdExtractionJobResult = {
  data: Record<string, any>;
  text?: string;
  usage?: any;
};

const defaultJobOptions = {
  removeOnComplete: true,
  removeOnFail: { count: 25 },
};

export async function queueJdExtraction(jobData: JdExtractionJobData): Promise<JdExtractionJobResult> {
  const queueConnection = redisConnection.duplicate();
  const eventsConnection = redisConnection.duplicate();
  const queue = new Queue(JD_EXTRACTION_QUEUE_NAME, {
    connection: queueConnection,
    defaultJobOptions,
  });
  const queueEvents = new QueueEvents(JD_EXTRACTION_QUEUE_NAME, {
    connection: eventsConnection,
  });

  try {
    await queueEvents.waitUntilReady();
    const job = await queue.add("extract", jobData, defaultJobOptions);
    return await job.waitUntilFinished(queueEvents);
  } finally {
    await queueEvents.close().catch(() => {});
    await queue.close().catch(() => {});
    queueConnection.disconnect();
    eventsConnection.disconnect();
  }
}
