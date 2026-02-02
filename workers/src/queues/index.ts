import { Queue } from 'bullmq';
import {
  redisConnection,
  QUEUE_NAMES,
  queueConfigs,
  type QueueName,
} from '../config';

// Job data types for each queue
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
}

export interface CleanupJobData {
  type: 'expired-files' | 'pending-deletions' | 'old-audit-logs';
  batchSize?: number;
}

// Job result types
export interface STTJobResult {
  segmentsCount: number;
  durationMs: number;
  provider: string;
}

export interface SMEJobResult {
  score: number;
  alertsCount: number;
}

export interface PDFJobResult {
  storageKey: string;
  signedUrl: string;
}

export interface CleanupJobResult {
  deletedCount: number;
}

// Create queue instances
function createQueue<TData>(name: QueueName): Queue<TData> {
  return new Queue<TData>(name, {
    connection: redisConnection,
    defaultJobOptions: queueConfigs[name],
  });
}

// Export queue instances
export const sttQueue = createQueue<STTJobData>(QUEUE_NAMES.STT);
export const smeQueue = createQueue<SMEJobData>(QUEUE_NAMES.SME);
export const pdfQueue = createQueue<PDFJobData>(QUEUE_NAMES.PDF);
export const cleanupQueue = createQueue<CleanupJobData>(QUEUE_NAMES.CLEANUP);

// Helper to get all queues for management
export const allQueues = [sttQueue, smeQueue, pdfQueue, cleanupQueue] as const;

// Graceful shutdown helper
export async function closeAllQueues(): Promise<void> {
  await Promise.all(allQueues.map((queue) => queue.close()));
}
