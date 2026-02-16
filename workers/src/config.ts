import type { ConnectionOptions, QueueOptions, WorkerOptions } from 'bullmq';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// Load environment variables
function loadEnvFile(filePath: string, override = false): void {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
}

const projectRoot = path.resolve(__dirname, '..', '..');
loadEnvFile(path.join(projectRoot, '.env'));
loadEnvFile(path.join(projectRoot, '.env.local'), true);
loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'), true);

// Redis connection configuration for Upstash
// Upstash requires TLS connection (rediss://)
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is required');
}

// Parse Redis URL for connection options
const url = new URL(redisUrl);

if (url.protocol !== 'rediss:') {
  throw new Error('REDIS_URL must use rediss:// (TLS is required)');
}

export const redisConnection: ConnectionOptions = {
  host: url.hostname,
  port: parseInt(url.port || '6379', 10),
  password: url.password || undefined,
  username: url.username || 'default',
  // TLS required for Upstash (rediss:// protocol)
  tls: {},
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

const WORKER_IDLE_TUNING: Pick<WorkerOptions, 'drainDelay' | 'stalledInterval'> = {
  // Reduce Redis command churn while queues are idle.
  // New jobs still wake workers immediately via blocking pop.
  drainDelay: 30,
  stalledInterval: 120_000,
};

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
    ...WORKER_IDLE_TUNING,
  },
  [QUEUE_NAMES.SME]: {
    concurrency: 5, // CPU-bound, fast
    lockDuration: 30 * 1000, // 30 seconds timeout
    ...WORKER_IDLE_TUNING,
  },
  [QUEUE_NAMES.PDF]: {
    concurrency: 3,
    lockDuration: 2 * 60 * 1000, // 2 minutes timeout
    ...WORKER_IDLE_TUNING,
  },
  [QUEUE_NAMES.CLEANUP]: {
    concurrency: 1,
    lockDuration: 5 * 60 * 1000, // 5 minutes timeout
    ...WORKER_IDLE_TUNING,
  },
};
