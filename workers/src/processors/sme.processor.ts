import { type Job, Worker } from 'bullmq';
import { redisConnection, QUEUE_NAMES, workerConfigs } from '../config';
import type { SMEJobData, SMEJobResult } from '../queues';
import { downloadObject } from '../lib/storage';

// Database
import {
  getDb,
  files,
  segments,
  alerts,
  eq,
} from '@sme-studio/db';
import type { NewSegment, NewAlert } from '@sme-studio/db';

// Subtitle parser
import { parseSubtitle } from '@sme-studio/subtitle-parser';
import type { Segment as ParsedSegment } from '@sme-studio/subtitle-parser';

// SME Engine
import {
  checkSpeed,
  checkLength,
  checkOverlap,
  checkDuration,
  checkProperNouns,
  calculateScore,
  type AlertInput,
  type AlertSeverity,
  type RuleCode,
} from '@sme-studio/sme-engine';

// Batch size for bulk inserts (handles large files with 10k+ segments)
const BATCH_SIZE = 500;

/**
 * Alert message templates for each rule
 */
const ALERT_MESSAGES: Record<RuleCode, (details: Record<string, unknown>) => string> = {
  speed: (d) => `Vitesse de lecture trop élevée (${Math.round(d.actual as number)} car/s). Maximum recommandé : ${d.max} car/s.`,
  length: (d) => {
    const parts: string[] = [];
    if (d.charExceeded) {
      parts.push(`${d.charCount} caractères (max ${d.charMax})`);
    }
    if (d.lineExceeded) {
      parts.push(`${d.lineCount} lignes (max ${d.lineMax})`);
    }
    return `Segment trop long : ${parts.join(', ')}.`;
  },
  overlap: (d) => `Chevauchement avec le segment suivant (${d.overlapMs} ms).`,
  duration: (d) => `Durée d'affichage trop courte (${d.actual} ms). Minimum recommandé : ${d.min} ms.`,
  proper_noun: (d) => `Nom propre potentiel détecté : "${d.term}". Vérifiez l'orthographe.`,
};

/**
 * Interface for collected alerts during analysis
 */
interface CollectedAlert {
  segmentIndex: number;
  ruleCode: RuleCode;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
}

/**
 * Analyzes all segments with SME rules
 */
function analyzeSegments(parsedSegments: ParsedSegment[]): {
  alerts: CollectedAlert[];
  scoreInputs: AlertInput[];
} {
  const collectedAlerts: CollectedAlert[] = [];
  const scoreInputs: AlertInput[] = [];

  for (let i = 0; i < parsedSegments.length; i++) {
    const segment = parsedSegments[i];
    if (!segment) continue;

    // Check speed
    const speedResult = checkSpeed(segment);
    if (speedResult.hasAlert && speedResult.severity) {
      const details = {
        actual: speedResult.actual,
        max: speedResult.max,
        unit: 'car/s',
      };
      collectedAlerts.push({
        segmentIndex: i,
        ruleCode: 'speed',
        severity: speedResult.severity,
        message: ALERT_MESSAGES.speed(details),
        details,
      });
      scoreInputs.push({ ruleCode: 'speed', severity: speedResult.severity });
    }

    // Check length
    const lengthResult = checkLength(segment);
    if (lengthResult.hasAlert && lengthResult.severity) {
      const details = {
        charCount: lengthResult.charCount.actual,
        charMax: lengthResult.charCount.max,
        charExceeded: lengthResult.charCount.exceeded,
        lineCount: lengthResult.lineCount.actual,
        lineMax: lengthResult.lineCount.max,
        lineExceeded: lengthResult.lineCount.exceeded,
      };
      collectedAlerts.push({
        segmentIndex: i,
        ruleCode: 'length',
        severity: lengthResult.severity,
        message: ALERT_MESSAGES.length(details),
        details,
      });
      scoreInputs.push({ ruleCode: 'length', severity: lengthResult.severity });
    }

    // Check duration
    const durationResult = checkDuration(segment);
    if (durationResult.hasAlert && durationResult.severity) {
      const details = {
        actual: durationResult.actual,
        min: durationResult.min,
        unit: 'ms',
      };
      collectedAlerts.push({
        segmentIndex: i,
        ruleCode: 'duration',
        severity: durationResult.severity,
        message: ALERT_MESSAGES.duration(details),
        details,
      });
      scoreInputs.push({ ruleCode: 'duration', severity: durationResult.severity });
    }

    // Check proper nouns
    const properNounResult = checkProperNouns(segment);
    if (properNounResult.hasAlert && properNounResult.severity) {
      for (const noun of properNounResult.detectedNouns) {
        const details = {
          term: noun.word,
          position: noun.position,
        };
        collectedAlerts.push({
          segmentIndex: i,
          ruleCode: 'proper_noun',
          severity: properNounResult.severity,
          message: ALERT_MESSAGES.proper_noun(details),
          details,
        });
        scoreInputs.push({ ruleCode: 'proper_noun', severity: properNounResult.severity });
      }
    }

    // Check overlap with next segment
    const nextSegment = parsedSegments[i + 1];
    if (nextSegment) {
      const overlapResult = checkOverlap(segment, nextSegment);
      if (overlapResult.hasAlert && overlapResult.severity) {
        const details = {
          overlapMs: overlapResult.overlapMs,
        };
        collectedAlerts.push({
          segmentIndex: i,
          ruleCode: 'overlap',
          severity: overlapResult.severity,
          message: ALERT_MESSAGES.overlap(details),
          details,
        });
        scoreInputs.push({ ruleCode: 'overlap', severity: overlapResult.severity });
      }
    }
  }

  return { alerts: collectedAlerts, scoreInputs };
}

/**
 * Insert segments in batches
 */
async function bulkInsertSegments(
  db: ReturnType<typeof getDb>,
  fileId: string,
  parsedSegments: ParsedSegment[]
): Promise<Map<number, string>> {
  const segmentIdMap = new Map<number, string>();

  for (let i = 0; i < parsedSegments.length; i += BATCH_SIZE) {
    const batch = parsedSegments.slice(i, i + BATCH_SIZE);
    const newSegments: NewSegment[] = batch.map((seg) => ({
      fileId,
      sequenceNum: seg.sequenceNum,
      startMs: seg.startMs,
      endMs: seg.endMs,
      text: seg.text,
      speaker: seg.speaker ?? null,
      isSoundInfo: seg.isSoundInfo ?? false,
    }));

    const insertedSegments = await db
      .insert(segments)
      .values(newSegments)
      .returning({ id: segments.id, sequenceNum: segments.sequenceNum });

    for (const inserted of insertedSegments) {
      // Map sequenceNum-1 to get array index (sequenceNum is 1-indexed)
      segmentIdMap.set(inserted.sequenceNum - 1, inserted.id);
    }
  }

  return segmentIdMap;
}

/**
 * Insert alerts in batches
 */
async function bulkInsertAlerts(
  db: ReturnType<typeof getDb>,
  fileId: string,
  collectedAlerts: CollectedAlert[],
  segmentIdMap: Map<number, string>
): Promise<number> {
  let insertedCount = 0;

  for (let i = 0; i < collectedAlerts.length; i += BATCH_SIZE) {
    const batch = collectedAlerts.slice(i, i + BATCH_SIZE);
    const newAlerts: NewAlert[] = batch.map((alert) => ({
      fileId,
      segmentId: segmentIdMap.get(alert.segmentIndex) ?? null,
      ruleCode: alert.ruleCode,
      severity: alert.severity,
      message: alert.message,
      details: alert.details,
      resolved: false,
    }));

    await db.insert(alerts).values(newAlerts);
    insertedCount += batch.length;
  }

  return insertedCount;
}

/**
 * Update progress in DB (for polling)
 */
async function updateProgress(
  db: ReturnType<typeof getDb>,
  fileId: string,
  progressPercent: number
): Promise<void> {
  await db
    .update(files)
    .set({
      progressPercent,
      updatedAt: new Date(),
    })
    .where(eq(files.id, fileId));
}

/**
 * SME Analysis Worker
 * Analyzes subtitle files and calculates SME score with alerts
 */
async function processSMEJob(job: Job<SMEJobData>): Promise<SMEJobResult> {
  const { fileId, userId, storageKey } = job.data;

  console.log(`[SME] Processing job ${job.id}`, {
    fileId,
    userId,
    storageKey,
  });

  const db = getDb();

  try {
    // Step 1: Update status to processing_sme
    await db
      .update(files)
      .set({
        status: 'processing_sme',
        progressPercent: 0,
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId));

    await job.updateProgress(5);

    // Step 2: Download SRT file from S3
    console.log(`[SME] Downloading file from S3: ${storageKey}`);
    const fileContent = await downloadObject(storageKey);
    await updateProgress(db, fileId, 15);
    await job.updateProgress(15);

    // Step 3: Parse with subtitle-parser
    console.log(`[SME] Parsing subtitle file`);
    const parseResult = parseSubtitle(fileContent);

    if (parseResult.segments.length === 0) {
      const firstError = parseResult.errors[0];
      throw new Error(
        firstError
          ? `Parse failed: ${firstError.message}`
          : 'No segments found in file'
      );
    }

    console.log(`[SME] Parsed ${parseResult.segments.length} segments`);
    await updateProgress(db, fileId, 25);
    await job.updateProgress(25);

    // Step 4: Analyze with sme-engine (all rules)
    console.log(`[SME] Analyzing segments with SME rules`);
    const { alerts: collectedAlerts, scoreInputs } = analyzeSegments(parseResult.segments);
    await updateProgress(db, fileId, 40);
    await job.updateProgress(40);

    // Step 5: Calculate score
    const scoreResult = calculateScore(scoreInputs);
    console.log(`[SME] Score calculated: ${scoreResult.score}`, scoreResult.breakdown);
    await updateProgress(db, fileId, 50);
    await job.updateProgress(50);

    // Step 6: Delete existing segments and alerts for this file (for re-analysis)
    await db.delete(alerts).where(eq(alerts.fileId, fileId));
    await db.delete(segments).where(eq(segments.fileId, fileId));
    await job.updateProgress(55);

    // Step 7: Bulk insert segments
    console.log(`[SME] Inserting ${parseResult.segments.length} segments`);
    const segmentIdMap = await bulkInsertSegments(db, fileId, parseResult.segments);
    await updateProgress(db, fileId, 75);
    await job.updateProgress(75);

    // Step 8: Bulk insert alerts
    console.log(`[SME] Inserting ${collectedAlerts.length} alerts`);
    await bulkInsertAlerts(db, fileId, collectedAlerts, segmentIdMap);
    await updateProgress(db, fileId, 90);
    await job.updateProgress(90);

    // Step 9: Update file with score and status=ready
    await db
      .update(files)
      .set({
        smeScore: scoreResult.score,
        smeAnalyzedAt: new Date(),
        status: 'ready',
        progressPercent: 100,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId));

    await job.updateProgress(100);
    console.log(`[SME] Completed job ${job.id} - Score: ${scoreResult.score}`);

    return {
      score: scoreResult.score,
      alertsCount: collectedAlerts.length,
    };
  } catch (error) {
    // Handle errors: update file status to failed
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SME] Job ${job.id} failed:`, errorMessage);

    await db
      .update(files)
      .set({
        status: 'failed',
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId));

    throw error;
  }
}

export function createSMEWorker(): Worker<SMEJobData, SMEJobResult> {
  const worker = new Worker<SMEJobData, SMEJobResult>(
    QUEUE_NAMES.SME,
    processSMEJob,
    {
      connection: redisConnection,
      ...workerConfigs[QUEUE_NAMES.SME],
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[SME] Job ${job.id} completed`, result);
  });

  worker.on('failed', (job, error) => {
    console.error(`[SME] Job ${job?.id} failed`, error.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[SME] Job ${job.id} progress: ${progress}%`);
  });

  return worker;
}
