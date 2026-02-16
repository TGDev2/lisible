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

export interface PDFJobData {
  fileId: string;
  userId: string;
  subtitleFormat?: "srt" | "vtt";
}

// Parse Redis URL for connection options
function getRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is required");
  }

  const url = new URL(redisUrl);

  if (url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use rediss:// (TLS is required)");
  }

  return {
    host: url.hostname,
    port: parseInt(url.port || "6379", 10),
    password: url.password || undefined,
    username: url.username || "default",
    tls: {},
    maxRetriesPerRequest: null,
  };
}

// Lazy initialization of queues
let _sttQueue: Queue<STTJobData> | null = null;
let _smeQueue: Queue<SMEJobData> | null = null;
let _pdfQueue: Queue<PDFJobData> | null = null;
const RECENT_PDF_JOB_REUSE_MS = 2 * 60 * 1000;

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

function getPDFQueue(): Queue<PDFJobData> {
  if (!_pdfQueue) {
    _pdfQueue = new Queue<PDFJobData>(QUEUE_NAMES.PDF, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 10_000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _pdfQueue;
}

function isSamePDFPayload(a: PDFJobData, b: PDFJobData): boolean {
  return (
    a.fileId === b.fileId &&
    a.userId === b.userId &&
    (a.subtitleFormat ?? null) === (b.subtitleFormat ?? null)
  );
}

async function findExistingPDFJob(
  queue: Queue<PDFJobData>,
  data: PDFJobData
): Promise<string | null> {
  const [activeJobs, waitingJobs, delayedJobs, prioritizedJobs] = await Promise.all([
    queue.getActive(0, 50),
    queue.getWaiting(0, 50),
    queue.getDelayed(0, 50),
    queue.getPrioritized(0, 50),
  ]);

  const inFlightJobs = [...activeJobs, ...waitingJobs, ...delayedJobs, ...prioritizedJobs];
  const existingInFlight = inFlightJobs.find((job) => isSamePDFPayload(job.data, data));
  if (existingInFlight?.id) {
    return String(existingInFlight.id);
  }

  // Reuse a very recent completed job to avoid duplicate exports from quick re-clicks/retries.
  const completedJobs = await queue.getCompleted(0, 20);
  const existingRecentCompleted = completedJobs.find((job) => {
    if (!isSamePDFPayload(job.data, data)) return false;
    if (!job.finishedOn) return false;
    return Date.now() - job.finishedOn <= RECENT_PDF_JOB_REUSE_MS;
  });

  return existingRecentCompleted?.id ? String(existingRecentCompleted.id) : null;
}

/**
 * Enqueue a PDF generation job
 */
export async function enqueuePDFJob(data: PDFJobData): Promise<string> {
  const queue = getPDFQueue();
  const existingJobId = await findExistingPDFJob(queue, data);
  if (existingJobId) {
    return existingJobId;
  }

  const jobId = `pdf-${data.fileId}-${Date.now()}`;
  const job = await queue.add("generate", data, {
    jobId,
  });
  return job.id ?? jobId;
}

/**
 * Get PDF job status
 */
export async function getPDFJobStatus(jobId: string): Promise<{
  status: "waiting" | "active" | "completed" | "failed" | "unknown";
  progress?: number;
  result?: {
    storageKey: string;
    signedUrl: string;
    zipStorageKey?: string;
    zipSignedUrl?: string;
  };
  error?: string;
}> {
  const queue = getPDFQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    return { status: "unknown" };
  }

  const state = await job.getState();

  if (state === "completed") {
    return {
      status: "completed",
      progress: 100,
      result: job.returnvalue as {
        storageKey: string;
        signedUrl: string;
        zipStorageKey?: string;
        zipSignedUrl?: string;
      },
    };
  }

  if (state === "failed") {
    return {
      status: "failed",
      error: job.failedReason || "Erreur inconnue",
    };
  }

  return {
    status: state as "waiting" | "active",
    progress: job.progress as number | undefined,
  };
}
