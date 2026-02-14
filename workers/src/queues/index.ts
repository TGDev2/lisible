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
  /** Optional subtitle format for combined ZIP export */
  subtitleFormat?: 'srt' | 'vtt';
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
  /** ZIP storage key if combined export was requested */
  zipStorageKey?: string;
  /** ZIP signed URL if combined export was requested */
  zipSignedUrl?: string;
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

let _sttQueue: Queue<STTJobData> | null = null;
let _smeQueue: Queue<SMEJobData> | null = null;
let _pdfQueue: Queue<PDFJobData> | null = null;
let _cleanupQueue: Queue<CleanupJobData> | null = null;

export function getSTTQueue(): Queue<STTJobData> {
  if (!_sttQueue) {
    _sttQueue = createQueue<STTJobData>(QUEUE_NAMES.STT);
  }
  return _sttQueue;
}

export function getSMEQueue(): Queue<SMEJobData> {
  if (!_smeQueue) {
    _smeQueue = createQueue<SMEJobData>(QUEUE_NAMES.SME);
  }
  return _smeQueue;
}

export function getPDFQueue(): Queue<PDFJobData> {
  if (!_pdfQueue) {
    _pdfQueue = createQueue<PDFJobData>(QUEUE_NAMES.PDF);
  }
  return _pdfQueue;
}

export function getCleanupQueue(): Queue<CleanupJobData> {
  if (!_cleanupQueue) {
    _cleanupQueue = createQueue<CleanupJobData>(QUEUE_NAMES.CLEANUP);
  }
  return _cleanupQueue;
}

function getOpenQueues() {
  const queues = [_sttQueue, _smeQueue, _pdfQueue, _cleanupQueue] as Array<
    Queue<STTJobData> | Queue<SMEJobData> | Queue<PDFJobData> | Queue<CleanupJobData> | null
  >;

  return queues.filter(
    (queue): queue is Exclude<(typeof queues)[number], null> => queue !== null
  );
}

// Graceful shutdown helper
export async function closeAllQueues(): Promise<void> {
  await Promise.all(getOpenQueues().map((queue) => queue.close()));
  _sttQueue = null;
  _smeQueue = null;
  _pdfQueue = null;
  _cleanupQueue = null;
}
