import { type Job, Worker } from 'bullmq';
import archiver from 'archiver';
import { redisConnection, QUEUE_NAMES, workerConfigs } from '../config';
import type { PDFJobData, PDFJobResult } from '../queues';
import { uploadObject, getSignedUrl } from '../lib/storage';
import { getDb, files, alerts, users, segments, eq, asc } from '@sme-studio/db';
import {
  generateProofDocument,
  type ProofDocumentData,
  type AlertData,
  type ScoreBreakdown,
  type RuleCode,
  type AlertSeverity,
} from '@sme-studio/pdf-generator';
import { generateSRT, generateVTT } from '@sme-studio/subtitle-parser';

/**
 * PDF Generation Worker
 * Generates proof document PDFs with SME score and alerts
 */
async function processPDFJob(job: Job<PDFJobData>): Promise<PDFJobResult> {
  const { fileId, userId, subtitleFormat } = job.data;

  console.log(`[PDF] Processing job ${job.id}`, {
    fileId,
    userId,
  });

  const db = getDb();

  // Update progress
  await job.updateProgress(5);

  // 1. Fetch file data from DB
  const [file] = await db
    .select({
      id: files.id,
      originalName: files.originalName,
      fileType: files.fileType,
      durationSeconds: files.durationSeconds,
      smeScore: files.smeScore,
      smeAnalyzedAt: files.smeAnalyzedAt,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);

  if (!file) {
    throw new Error(`File not found: ${fileId}`);
  }

  await job.updateProgress(15);

  // 2. Fetch user plan for watermark decision
  const [user] = await db
    .select({
      plan: users.plan,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const userPlan = (user?.plan || 'free') as 'free' | 'pro';

  await job.updateProgress(20);

  // 3. Count segments
  const segmentCountResult = await db
    .select({ count: segments.id })
    .from(segments)
    .where(eq(segments.fileId, fileId));

  const segmentCount = segmentCountResult.length;

  await job.updateProgress(30);

  // 4. Fetch alerts from DB
  const dbAlerts = await db
    .select({
      ruleCode: alerts.ruleCode,
      severity: alerts.severity,
      message: alerts.message,
      details: alerts.details,
      resolved: alerts.resolved,
      segmentId: alerts.segmentId,
    })
    .from(alerts)
    .where(eq(alerts.fileId, fileId))
    .orderBy(asc(alerts.createdAt));

  await job.updateProgress(40);

  // 5. Build alert data for PDF
  const alertDataList: AlertData[] = dbAlerts.map((alert, index) => ({
    ruleCode: alert.ruleCode as RuleCode,
    severity: alert.severity as AlertSeverity,
    message: alert.message,
    segmentNum: index + 1,
    details: alert.details as AlertData['details'],
    resolved: alert.resolved ?? false,
  }));

  // 6. Calculate score breakdown
  const breakdown = calculateBreakdown(alertDataList);

  await job.updateProgress(50);

  // 7. Prepare document data
  const documentData: ProofDocumentData = {
    file: {
      id: file.id,
      originalName: file.originalName,
      fileType: file.fileType,
      durationSeconds: file.durationSeconds ?? undefined,
      segmentCount,
      analyzedAt: file.smeAnalyzedAt ?? new Date(),
      createdAt: file.createdAt ?? new Date(),
    },
    score: file.smeScore ?? 0,
    breakdown,
    alerts: alertDataList,
    userPlan,
  };

  await job.updateProgress(55);

  // 7b. Fetch segments if ZIP export requested
  let fileSegments: Array<{
    sequenceNum: number;
    startMs: number;
    endMs: number;
    text: string;
    speaker?: string;
    isSoundInfo?: boolean;
  }> = [];

  if (subtitleFormat) {
    const dbSegments = await db
      .select({
        sequenceNum: segments.sequenceNum,
        startMs: segments.startMs,
        endMs: segments.endMs,
        text: segments.text,
        speaker: segments.speaker,
        isSoundInfo: segments.isSoundInfo,
      })
      .from(segments)
      .where(eq(segments.fileId, fileId))
      .orderBy(asc(segments.sequenceNum));

    fileSegments = dbSegments.map((seg) => ({
      sequenceNum: seg.sequenceNum,
      startMs: seg.startMs,
      endMs: seg.endMs,
      text: seg.text,
      speaker: seg.speaker ?? undefined,
      isSoundInfo: seg.isSoundInfo ?? undefined,
    }));
  }

  await job.updateProgress(60);

  // 8. Generate PDF
  console.log(`[PDF] Generating PDF for file ${fileId}`);
  const pdfBuffer = await generateProofDocument(documentData);

  await job.updateProgress(70);

  const baseName = file.originalName.replace(/\.[^/.]+$/, '');

  // 9. Upload PDF to S3
  // Stable key by file: overwrite previous proof file instead of creating timestamped duplicates.
  const storageKey = `pdfs/${userId}/${fileId}/${baseName}_preuves.pdf`;
  console.log(`[PDF] Uploading PDF to S3: ${storageKey}`);
  await uploadObject(storageKey, pdfBuffer, 'application/pdf');

  await job.updateProgress(80);

  // 10. Generate signed URL (24 hours expiration)
  const signedUrl = await getSignedUrl(storageKey, 24 * 60 * 60);

  // 11. If subtitle format requested, create ZIP with PDF + subtitles
  let zipStorageKey: string | undefined;
  let zipSignedUrl: string | undefined;

  if (subtitleFormat && fileSegments.length > 0) {
    console.log(`[PDF] Creating ZIP with ${subtitleFormat.toUpperCase()} subtitles`);

    // Generate subtitle content
    const subtitleContent =
      subtitleFormat === 'srt'
        ? generateSRT(fileSegments)
        : generateVTT(fileSegments);

    // Create ZIP archive
    const zipBuffer = await createZipArchive(
      pdfBuffer,
      `${baseName}_preuves.pdf`,
      subtitleContent,
      `${baseName}.${subtitleFormat}`
    );

    await job.updateProgress(90);

    // Upload ZIP to S3
    // Keep one ZIP per subtitle format to avoid duplicate objects for the same export type.
    zipStorageKey = `exports/${userId}/${fileId}/${baseName}_${subtitleFormat}_export.zip`;
    console.log(`[PDF] Uploading ZIP to S3: ${zipStorageKey}`);
    await uploadObject(zipStorageKey, zipBuffer, 'application/zip');

    // Generate signed URL for ZIP (24 hours)
    zipSignedUrl = await getSignedUrl(zipStorageKey, 24 * 60 * 60);
  }

  await job.updateProgress(100);

  console.log(`[PDF] Completed job ${job.id}`);

  return {
    storageKey,
    signedUrl,
    zipStorageKey,
    zipSignedUrl,
  };
}

/**
 * Create a ZIP archive containing PDF and subtitle file
 */
async function createZipArchive(
  pdfBuffer: Buffer,
  pdfFilename: string,
  subtitleContent: string,
  subtitleFilename: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    // Add PDF file
    archive.append(pdfBuffer, { name: pdfFilename });

    // Add subtitle file
    archive.append(subtitleContent, { name: subtitleFilename });

    archive.finalize();
  });
}

/**
 * Calculate score breakdown from alerts
 */
function calculateBreakdown(alertsList: AlertData[]): ScoreBreakdown {
  const bySeverity = {
    critical: 0,
    warning: 0,
    info: 0,
  };

  const byRule = {
    speed: { count: 0, penalty: 0 },
    length: { count: 0, penalty: 0 },
    overlap: { count: 0, penalty: 0 },
    duration: { count: 0, penalty: 0 },
    proper_noun: { count: 0, penalty: 0 },
  };

  for (const alert of alertsList) {
    // Skip resolved alerts
    if (alert.resolved) continue;

    // Count by severity with penalty calculation
    let penalty = 0;
    switch (alert.severity) {
      case 'critical':
        bySeverity.critical++;
        penalty = 10;
        break;
      case 'warning':
        bySeverity.warning++;
        penalty = 5;
        break;
      case 'info':
        bySeverity.info++;
        penalty = 1;
        break;
    }

    // Count by rule
    switch (alert.ruleCode) {
      case 'speed':
        byRule.speed.count++;
        byRule.speed.penalty += penalty;
        break;
      case 'length':
        byRule.length.count++;
        byRule.length.penalty += penalty;
        break;
      case 'overlap':
        byRule.overlap.count++;
        byRule.overlap.penalty += penalty;
        break;
      case 'duration':
        byRule.duration.count++;
        byRule.duration.penalty += penalty;
        break;
      case 'proper_noun':
        byRule.proper_noun.count++;
        byRule.proper_noun.penalty += penalty;
        break;
    }
  }

  const totalAlerts = bySeverity.critical + bySeverity.warning + bySeverity.info;

  return {
    totalAlerts,
    bySeverity,
    byRule,
  };
}

export function createPDFWorker(): Worker<PDFJobData, PDFJobResult> {
  const worker = new Worker<PDFJobData, PDFJobResult>(
    QUEUE_NAMES.PDF,
    processPDFJob,
    {
      connection: redisConnection,
      ...workerConfigs[QUEUE_NAMES.PDF],
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[PDF] Job ${job.id} completed`, {
      storageKey: result.storageKey,
    });
  });

  worker.on('failed', (job, error) => {
    console.error(`[PDF] Job ${job?.id} failed`, error.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[PDF] Job ${job.id} progress: ${progress}%`);
  });

  return worker;
}
