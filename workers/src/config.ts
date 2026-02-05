import { ConnectionOptions, QueueOptions, WorkerOptions } from 'bullmq';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../.env' });
dotenv.config({ path: '.env' });

// Redis connection configuration for Upstash
// Upstash requires TLS connection (rediss://)
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is required');
}

// Parse Redis URL for connection options
const url = new URL(redisUrl);

export const redisConnection: ConnectionOptions = {
  host: url.hostname,
  port: parseInt(url.port || '6379', 10),
  password: url.password || undefined,
  username: url.username || 'default',
  // TLS required for Upstash (rediss:// protocol)
  tls: url.protocol === 'rediss:' ? {} : undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
};

// Queue names
export const QUEUE_NAMES = {
  STT: 'stt-transcription',
  SME: 'sme-analysis',
  PDF: 'pdf-generation',
  CLEANUP: 'cleanup',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Queue configurations with retry and backoff settings
export const queueConfigs: Record<QueueName, QueueOptions['defaultJobOptions']> = {
  [QUEUE_NAMES.STT]: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30_000, // 30s, 60s, 120s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
  [QUEUE_NAMES.SME]: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5_000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
  [QUEUE_NAMES.PDF]: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10_000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
  [QUEUE_NAMES.CLEANUP]: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 60_000,
    },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
};

// Worker configurations with concurrency and timeouts
export const workerConfigs: Record<QueueName, Partial<WorkerOptions>> = {
  [QUEUE_NAMES.STT]: {
    concurrency: 2, // Limited by STT API cost
    lockDuration: 15 * 60 * 1000, // 15 minutes timeout
  },
  [QUEUE_NAMES.SME]: {
    concurrency: 5, // CPU-bound, fast
    lockDuration: 30 * 1000, // 30 seconds timeout
  },
  [QUEUE_NAMES.PDF]: {
    concurrency: 3,
    lockDuration: 2 * 60 * 1000, // 2 minutes timeout
  },
  [QUEUE_NAMES.CLEANUP]: {
    concurrency: 1,
    lockDuration: 5 * 60 * 1000, // 5 minutes timeout
  },
};
