import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, files, segments, alerts, jobs, eq, and } from "@sme-studio/db";
import type { NewSegment, NewAlert } from "@sme-studio/db";
import { enqueueSTTJob } from "@/lib/queue";
import { download } from "@/lib/storage";
import { parseSubtitle } from "@sme-studio/subtitle-parser";
import type { Segment as ParsedSegment } from "@sme-studio/subtitle-parser";
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
} from "@sme-studio/sme-engine";

// Extend Vercel function timeout to 60s (Pro) for larger files
export const maxDuration = 60;

type RouteParams = {
  params: Promise<{ id: string }>;
};

const BATCH_SIZE = 500;

const ALERT_MESSAGES: Record<RuleCode, (d: Record<string, unknown>) => string> = {
  speed: (d) => `Vitesse de lecture trop élevée (${Math.round(d.actual as number)} car/s). Maximum recommandé : ${d.max} car/s.`,
  length: (d) => {
    const parts: string[] = [];
    if (d.charExceeded) parts.push(`${d.charCount} caractères (max ${d.charMax})`);
    if (d.lineExceeded) parts.push(`${d.lineCount} lignes (max ${d.lineMax})`);
    return `Segment trop long : ${parts.join(", ")}.`;
  },
  overlap: (d) => `Chevauchement avec le segment suivant (${d.overlapMs} ms).`,
  duration: (d) => `Durée d'affichage trop courte (${d.actual} ms). Minimum recommandé : ${d.min} ms.`,
  proper_noun: (d) => `Nom propre potentiel détecté : "${d.term}". Vérifiez l'orthographe.`,
};

interface CollectedAlert {
  segmentIndex: number;
  ruleCode: RuleCode;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
}

function analyzeSegments(parsedSegments: ParsedSegment[]): {
  collectedAlerts: CollectedAlert[];
  scoreInputs: AlertInput[];
} {
  const collectedAlerts: CollectedAlert[] = [];
  const scoreInputs: AlertInput[] = [];

  for (let i = 0; i < parsedSegments.length; i++) {
    const segment = parsedSegments[i];
    if (!segment) continue;

    const speedResult = checkSpeed(segment);
    if (speedResult.hasAlert && speedResult.severity) {
      const details = { actual: speedResult.actual, max: speedResult.max, unit: "car/s" };
      collectedAlerts.push({ segmentIndex: i, ruleCode: "speed", severity: speedResult.severity, message: ALERT_MESSAGES.speed(details), details });
      scoreInputs.push({ ruleCode: "speed", severity: speedResult.severity });
    }

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
      collectedAlerts.push({ segmentIndex: i, ruleCode: "length", severity: lengthResult.severity, message: ALERT_MESSAGES.length(details), details });
      scoreInputs.push({ ruleCode: "length", severity: lengthResult.severity });
    }

    const durationResult = checkDuration(segment);
    if (durationResult.hasAlert && durationResult.severity) {
      const details = { actual: durationResult.actual, min: durationResult.min, unit: "ms" };
      collectedAlerts.push({ segmentIndex: i, ruleCode: "duration", severity: durationResult.severity, message: ALERT_MESSAGES.duration(details), details });
      scoreInputs.push({ ruleCode: "duration", severity: durationResult.severity });
    }

    const properNounResult = checkProperNouns(segment);
    if (properNounResult.hasAlert && properNounResult.severity) {
      for (const noun of properNounResult.detectedNouns) {
        const details = { term: noun.word, position: noun.position };
        collectedAlerts.push({ segmentIndex: i, ruleCode: "proper_noun", severity: properNounResult.severity, message: ALERT_MESSAGES.proper_noun(details), details });
        scoreInputs.push({ ruleCode: "proper_noun", severity: properNounResult.severity });
      }
    }

    const nextSegment = parsedSegments[i + 1];
    if (nextSegment) {
      const overlapResult = checkOverlap(segment, nextSegment);
      if (overlapResult.hasAlert && overlapResult.severity) {
        const details = { overlapMs: overlapResult.overlapMs };
        collectedAlerts.push({ segmentIndex: i, ruleCode: "overlap", severity: overlapResult.severity, message: ALERT_MESSAGES.overlap(details), details });
        scoreInputs.push({ ruleCode: "overlap", severity: overlapResult.severity });
      }
    }
  }

  return { collectedAlerts, scoreInputs };
}

/**
 * Run SME analysis inline for SRT/VTT files.
 * Parses, analyzes, saves segments/alerts, updates file to ready.
 */
async function runSMEAnalysisInline(
  fileId: string,
  storageKey: string
): Promise<{ score: number; alertsCount: number }> {
  const db = getDb();

  // Download file content from S3
  const buffer = await download(storageKey);
  const fileContent = buffer.toString("utf-8");

  // Parse subtitles
  const parseResult = parseSubtitle(fileContent);
  if (parseResult.segments.length === 0) {
    const firstError = parseResult.errors[0];
    throw new Error(firstError ? `Parse failed: ${firstError.message}` : "No segments found in file");
  }

  // Analyze with SME rules
  const { collectedAlerts, scoreInputs } = analyzeSegments(parseResult.segments);

  // Calculate score
  const scoreResult = calculateScore(scoreInputs);

  // Clear previous data (for re-analysis support)
  await db.delete(alerts).where(eq(alerts.fileId, fileId));
  await db.delete(segments).where(eq(segments.fileId, fileId));

  // Bulk insert segments
  const segmentIdMap = new Map<number, string>();
  for (let i = 0; i < parseResult.segments.length; i += BATCH_SIZE) {
    const batch = parseResult.segments.slice(i, i + BATCH_SIZE);
    const newSegments: NewSegment[] = batch.map((seg) => ({
      fileId,
      sequenceNum: seg.sequenceNum,
      startMs: seg.startMs,
      endMs: seg.endMs,
      text: seg.text,
      speaker: seg.speaker ?? null,
      isSoundInfo: seg.isSoundInfo ?? false,
    }));
    const inserted = await db.insert(segments).values(newSegments).returning({ id: segments.id, sequenceNum: segments.sequenceNum });
    for (const s of inserted) {
      segmentIdMap.set(s.sequenceNum - 1, s.id);
    }
  }

  // Bulk insert alerts
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
  }

  // Update file: score + status ready
  await db
    .update(files)
    .set({
      smeScore: scoreResult.score,
      smeAnalyzedAt: new Date(),
      status: "ready",
      progressPercent: 100,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(files.id, fileId));

  return { score: scoreResult.score, alertsCount: collectedAlerts.length };
}

/**
 * POST /api/files/[id]/confirm
 * Confirm that file upload to S3 is complete.
 * - SRT/VTT: runs SME analysis inline and returns immediately with score
 * - Video/Audio: enqueues STT job for async processing
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const userId = session.user.id;
    const { id: fileId } = await params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(fileId)) {
      return NextResponse.json({ error: "ID de fichier invalide" }, { status: 400 });
    }

    const db = getDb();
    const [file] = await db
      .select({
        id: files.id,
        userId: files.userId,
        status: files.status,
        fileType: files.fileType,
        storageKey: files.storageKey,
      })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    if (!file) {
      return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
    }

    if (file.userId !== userId) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    if (file.status !== "pending" && file.status !== "uploading") {
      if (file.status === "failed") {
        return NextResponse.json({ error: "L'upload du fichier a échoué. Veuillez réessayer." }, { status: 400 });
      }
      return NextResponse.json({ message: "Fichier déjà confirmé", status: file.status, fileId: file.id }, { status: 200 });
    }

    if (!file.storageKey) {
      return NextResponse.json({ error: "Configuration du fichier incomplète" }, { status: 400 });
    }

    // SRT/VTT: inline SME analysis (no worker needed)
    if (file.fileType === "srt" || file.fileType === "vtt") {
      await db
        .update(files)
        .set({ status: "processing_sme", progressPercent: 0, updatedAt: new Date() })
        .where(and(eq(files.id, fileId), eq(files.userId, userId)));

      try {
        const result = await runSMEAnalysisInline(fileId, file.storageKey);
        return NextResponse.json(
          {
            message: "Analyse terminée",
            fileId,
            status: "ready",
            fileType: file.fileType,
            score: result.score,
            alertsCount: result.alertsCount,
          },
          { status: 200 }
        );
      } catch (analysisError) {
        const errorMessage = analysisError instanceof Error ? analysisError.message : "Erreur d'analyse";
        console.error("SME inline analysis failed:", analysisError);
        await db
          .update(files)
          .set({ status: "failed", errorMessage, updatedAt: new Date() })
          .where(eq(files.id, fileId));
        return NextResponse.json({ error: "Erreur lors de l'analyse du fichier" }, { status: 500 });
      }
    }

    // Video/Audio: enqueue STT job for async processing
    await db
      .update(files)
      .set({ status: "processing_stt", progressPercent: 0, updatedAt: new Date() })
      .where(and(eq(files.id, fileId), eq(files.userId, userId)));

    const jobPayload = { fileId: file.id, userId, storageKey: file.storageKey };

    try {
      await db.insert(jobs).values({
        queueName: "stt",
        fileId: file.id,
        userId,
        status: "pending",
        payload: jobPayload,
      });
      await enqueueSTTJob(jobPayload);
    } catch (jobError) {
      console.error("Error enqueueing STT job:", jobError);
      await db
        .update(files)
        .set({ status: "pending", errorMessage: "Échec de la mise en queue" })
        .where(eq(files.id, fileId));
      return NextResponse.json({ error: "Erreur lors de la mise en queue du traitement" }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: "Upload confirmé",
        fileId,
        status: "processing_stt",
        fileType: file.fileType,
        nextStep: "Transcription en cours",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error confirming upload:", error);
    return NextResponse.json({ error: "Erreur lors de la confirmation de l'upload" }, { status: 500 });
  }
}
