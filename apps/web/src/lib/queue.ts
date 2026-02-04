import { Queue, type ConnectionOptions } from "bullmq";

// Queue names - must match workers/src/config.ts
const QUEUE_NAMES = {
  STT: "stt-transcription",
  SME: "sme-analysis",
  PDF: "pdf-generation",
  CLEANUP: "cleanup",
} as const;

// Job data types
export interface STTJobData {
  fileId: string;
  userId: string;
  storageKey: string;
  language?: string;
}

export interface SMEJobData {
  fileId: string;
  userId: string;
  storageKey: string;
}

// Parse Redis URL for connection options
function getRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is required");
  }

  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: parseInt(url.port || "6379", 10),
    password: url.password || undefined,
    username: url.username || "default",
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

// Lazy initialization of queues
let _sttQueue: Queue<STTJobData> | null = null;
let _smeQueue: Queue<SMEJobData> | null = null;

function getSTTQueue(): Queue<STTJobData> {
  if (!_sttQueue) {
    _sttQueue = new Queue<STTJobData>(QUEUE_NAMES.STT, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 30_000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _sttQueue;
}

function getSMEQueue(): Queue<SMEJobData> {
  if (!_smeQueue) {
    _smeQueue = new Queue<SMEJobData>(QUEUE_NAMES.SME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: "fixed",
          delay: 5_000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _smeQueue;
}

/**
 * Enqueue a STT transcription job for video/audio files
 */
export async function enqueueSTTJob(data: STTJobData): Promise<string> {
  const queue = getSTTQueue();
  const job = await queue.add("transcribe", data, {
    jobId: `stt-${data.fileId}`,
  });
  return job.id ?? `stt-${data.fileId}`;
}

/**
 * Enqueue a SME analysis job for subtitle files
 */
export async function enqueueSMEJob(data: SMEJobData): Promise<string> {
  const queue = getSMEQueue();
  const job = await queue.add("analyze", data, {
    jobId: `sme-${data.fileId}`,
  });
  return job.id ?? `sme-${data.fileId}`;
}
