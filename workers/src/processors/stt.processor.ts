import { Job, Worker } from 'bullmq';
import { redisConnection, QUEUE_NAMES, workerConfigs } from '../config';
import type { STTJobData, STTJobResult } from '../queues';
import { smeQueue } from '../queues';

// Storage
import { downloadObjectAsBuffer, uploadObject, deleteObject } from '../lib/storage';

// FFmpeg utilities
import { prepareForSTT, isVideoFile } from '../lib/ffmpeg';

// SRT generation
import { generateSRT, generateSrtStorageKey } from '../lib/srt-generator';

// Credits
import { deductCredits, InsufficientCreditsError } from '../lib/credits';

// STT Orchestrator
import { STTOrchestrator, type STTProgress } from '@sme-studio/stt';

// Database
import { getDb, files, eq } from '@sme-studio/db';

/**
 * Update file status and progress in database
 */
async function updateFileStatus(
  fileId: string,
  status: string,
  progressPercent: number,
  errorMessage?: string | null
): Promise<void> {
  const db = getDb();
  await db
    .update(files)
    .set({
      status,
      progressPercent,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(files.id, fileId));
}

/**
 * STT Transcription Worker
 * Processes video/audio files through STT providers (Whisper, Deepgram)
 *
 * Flow:
 * 1. Download file from S3
 * 2. Extract audio if video (ffmpeg)
 * 3. Call STT Orchestrator (Whisper -> Deepgram fallback)
 * 4. Generate SRT from segments
 * 5. Upload SRT to S3
 * 6. Update file record (storage_key_srt, duration)
 * 7. Deduct credits (rounded up to minute)
 * 8. Enqueue SME analysis job
 */
async function processSTTJob(job: Job<STTJobData>): Promise<STTJobResult> {
  const { fileId, userId, storageKey, language = 'fr' } = job.data;
  const db = getDb();
  let srtStorageKey: string | null = null;

  console.log(`[STT] Processing job ${job.id}`, {
    fileId,
    userId,
    storageKey,
    language,
  });

  try {
    // Step 1: Update status to processing_stt
    await updateFileStatus(fileId, 'processing_stt', 0);
    await job.updateProgress(5);

    // Step 2: Download file from S3
    console.log(`[STT] Downloading file from S3: ${storageKey}`);
    const fileBuffer = await downloadObjectAsBuffer(storageKey);
    console.log(`[STT] Downloaded ${fileBuffer.length} bytes`);
    await job.updateProgress(10);

    // Step 3: Get original filename for format detection
    const [fileRecord] = await db
      .select({ originalName: files.originalName })
      .from(files)
      .where(eq(files.id, fileId));

    if (!fileRecord) {
      throw new Error(`File record not found: ${fileId}`);
    }

    const originalFilename = fileRecord.originalName;
    const isVideo = isVideoFile(originalFilename);
    console.log(`[STT] File type: ${isVideo ? 'video' : 'audio'}, name: ${originalFilename}`);

    // Step 4: Extract audio if video, get duration
    console.log(`[STT] Preparing file for STT...`);
    const { audioBuffer, durationSeconds, wasVideo } = await prepareForSTT(
      fileBuffer,
      originalFilename,
      (percent) => {
        // Map ffmpeg progress (0-100) to job progress (10-30)
        const jobProgress = 10 + Math.round(percent * 0.2);
        job.updateProgress(jobProgress).catch(() => {});
      }
    );

    console.log(`[STT] Duration: ${durationSeconds}s, was video: ${wasVideo}`);
    await job.updateProgress(30);

    // Step 5: Check credits before processing
    // Note: We check but don't deduct yet, will deduct after successful transcription

    // Step 6: Call STT Orchestrator
    console.log(`[STT] Starting transcription with orchestrator...`);
    const orchestrator = new STTOrchestrator();

    const sttResult = await orchestrator.transcribe(
      audioBuffer,
      wasVideo ? originalFilename.replace(/\.[^.]+$/, '.mp3') : originalFilename,
      { language },
      (progress: STTProgress) => {
        // Map STT progress (0-100) to job progress (30-70)
        const jobProgress = 30 + Math.round(progress.percent * 0.4);
        job.updateProgress(jobProgress).catch(() => {});
        console.log(`[STT] Transcription progress: ${progress.percent}% (${progress.stage})`);
      }
    );

    console.log(`[STT] Transcription complete: ${sttResult.segments.length} segments, provider: ${sttResult.provider}`);
    await job.updateProgress(70);

    // Step 7: Generate SRT from segments
    console.log(`[STT] Generating SRT file...`);
    const srtContent = generateSRT(sttResult.segments);
    srtStorageKey = generateSrtStorageKey(storageKey);
    await job.updateProgress(75);

    // Step 8: Upload SRT to S3
    console.log(`[STT] Uploading SRT to S3: ${srtStorageKey}`);
    await uploadObject(srtStorageKey, srtContent, 'text/plain; charset=utf-8');
    await job.updateProgress(80);

    // Step 9: Update file record with SRT key and duration
    const durationSecondsInt = Math.round(durationSeconds);
    await db
      .update(files)
      .set({
        storageKeySrt: srtStorageKey,
        durationSeconds: durationSecondsInt,
        status: 'processing_stt', // Still processing until credits deducted
        progressPercent: 85,
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId));
    await job.updateProgress(85);

    // Step 10: Deduct credits (rounded up to minute)
    console.log(`[STT] Deducting credits for ${durationSeconds}s...`);
    const { minutesDeducted, creditsRemaining } = await deductCredits(
      userId,
      fileId,
      durationSeconds
    );
    console.log(`[STT] Deducted ${minutesDeducted} minutes, ${creditsRemaining} remaining`);
    await job.updateProgress(90);

    // Step 11: Enqueue SME analysis job
    console.log(`[STT] Enqueuing SME analysis job...`);
    await smeQueue.add(
      'analyze',
      {
        fileId,
        userId,
        storageKey: srtStorageKey,
      },
      {
        jobId: `sme-${fileId}`,
      }
    );
    await job.updateProgress(95);

    // Step 12: Update final status
    await updateFileStatus(fileId, 'processing_sme', 95);
    await job.updateProgress(100);

    console.log(`[STT] Completed job ${job.id}`);

    return {
      segmentsCount: sttResult.segments.length,
      durationMs: sttResult.durationMs,
      provider: sttResult.provider,
    };
  } catch (error) {
    // Handle specific error types
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[STT] Job ${job.id} failed:`, errorMessage);

    // Determine if error is retryable
    const isRetryable = !(error instanceof InsufficientCreditsError);

    // Update file status to failed
    await updateFileStatus(fileId, 'failed', 0, errorMessage);

    // Cleanup: delete uploaded SRT if it exists and we failed after upload
    if (srtStorageKey) {
      try {
        await deleteObject(srtStorageKey);
        console.log(`[STT] Cleaned up SRT file: ${srtStorageKey}`);
      } catch (cleanupError) {
        console.error(`[STT] Failed to cleanup SRT:`, cleanupError);
      }
    }

    // Re-throw to let BullMQ handle retries (if retryable)
    if (!isRetryable) {
      // Mark job as not retryable by throwing with specific pattern
      const finalError = new Error(`Non-retryable: ${errorMessage}`);
      (finalError as Error & { unrecoverable: boolean }).unrecoverable = true;
      throw finalError;
    }

    throw error;
  }
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
