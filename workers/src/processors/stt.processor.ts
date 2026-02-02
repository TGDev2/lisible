import { Job, Worker } from 'bullmq';
import { redisConnection, QUEUE_NAMES, workerConfigs } from '../config';
import type { STTJobData, STTJobResult } from '../queues';

/**
 * STT Transcription Worker
 * Processes video/audio files through STT providers (Whisper, Deepgram)
 *
 * Full implementation in E5-S4
 */
async function processSTTJob(job: Job<STTJobData>): Promise<STTJobResult> {
  const { fileId, userId, storageKey, language = 'fr' } = job.data;

  console.log(`[STT] Processing job ${job.id}`, {
    fileId,
    userId,
    storageKey,
    language,
  });

  // Update progress
  await job.updateProgress(10);

  // TODO E5-S4: Implement full STT processing
  // 1. Download file from S3
  // 2. Extract audio if video
  // 3. Call STT Orchestrator
  // 4. Generate SRT from segments
  // 5. Upload SRT to S3
  // 6. Update file record
  // 7. Deduct credits
  // 8. Enqueue SME job

  // Simulate processing for now
  await new Promise((resolve) => setTimeout(resolve, 100));
  await job.updateProgress(100);

  console.log(`[STT] Completed job ${job.id}`);

  return {
    segmentsCount: 0,
    durationMs: 0,
    provider: 'skeleton',
  };
}

export function createSTTWorker(): Worker<STTJobData, STTJobResult> {
  const worker = new Worker<STTJobData, STTJobResult>(
    QUEUE_NAMES.STT,
    processSTTJob,
    {
      connection: redisConnection,
      ...workerConfigs[QUEUE_NAMES.STT],
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[STT] Job ${job.id} completed`, result);
  });

  worker.on('failed', (job, error) => {
    console.error(`[STT] Job ${job?.id} failed`, error.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[STT] Job ${job.id} progress: ${progress}%`);
  });

  return worker;
}
