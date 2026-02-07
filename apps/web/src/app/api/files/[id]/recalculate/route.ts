import { NextRequest, NextResponse } from "next/server";
import { getDb, segments, files, alerts, eq } from "@sme-studio/db";
import { auth } from "@/lib/auth";
import {
  checkSpeed,
  checkLength,
  checkDuration,
  checkOverlap,
  calculateScore,
  type AlertSeverity,
  type RuleCode,
} from "@sme-studio/sme-engine";

type RouteParams = { params: Promise<{ id: string }> };

interface AlertToInsert {
  fileId: string;
  segmentId: string;
  ruleCode: RuleCode;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
}

/**
 * POST /api/files/[id]/recalculate
 * Recalculate SME score and alerts for a file
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: fileId } = await params;
    const db = getDb();

    // Get the file and verify ownership
    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all segments for this file, ordered by sequence
    const fileSegments = await db
      .select()
      .from(segments)
      .where(eq(segments.fileId, fileId))
      .orderBy(segments.sequenceNum);

    if (fileSegments.length === 0) {
      return NextResponse.json({
        success: true,
        score: 100,
        alerts: [],
      });
    }

    // Calculate alerts for each segment
    const alertsToInsert: AlertToInsert[] = [];

    for (let i = 0; i < fileSegments.length; i++) {
      const segment = fileSegments[i];
      if (!segment) continue;

      // Check speed
      const speedResult = checkSpeed({
        sequenceNum: segment.sequenceNum,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
      });
      if (speedResult.hasAlert && speedResult.severity) {
        alertsToInsert.push({
          fileId,
          segmentId: segment.id,
          ruleCode: "speed",
          severity: speedResult.severity,
          message: `Vitesse de lecture trop élevée (${speedResult.actual.toFixed(1)} car/s). Maximum recommandé : ${speedResult.max} car/s.`,
          details: {
            actual: speedResult.actual,
            max: speedResult.max,
            unit: "car/s",
          },
        });
      }

      // Check length
      const lengthResult = checkLength({
        sequenceNum: segment.sequenceNum,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
      });
      if (lengthResult.hasAlert && lengthResult.severity) {
        alertsToInsert.push({
          fileId,
          segmentId: segment.id,
          ruleCode: "length",
          severity: lengthResult.severity,
          message: `Segment trop long (${lengthResult.charCount.actual} caractères, ${lengthResult.lineCount.actual} lignes). Maximum recommandé : ${lengthResult.charCount.max} caractères sur ${lengthResult.lineCount.max} lignes.`,
          details: {
            actual: lengthResult.charCount.actual,
            max: lengthResult.charCount.max,
            lines: lengthResult.lineCount.actual,
            maxLines: lengthResult.lineCount.max,
          },
        });
      }

      // Check duration
      const durationResult = checkDuration({
        sequenceNum: segment.sequenceNum,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
      });
      if (durationResult.hasAlert && durationResult.severity) {
        alertsToInsert.push({
          fileId,
          segmentId: segment.id,
          ruleCode: "duration",
          severity: durationResult.severity,
          message: `Durée d'affichage trop courte (${durationResult.actual}ms). Minimum recommandé : ${durationResult.min}ms.`,
          details: {
            actual: durationResult.actual,
            min: durationResult.min,
            unit: "ms",
          },
        });
      }

      // Check overlap with next segment
      const nextSegment = fileSegments[i + 1];
      if (nextSegment) {
        const overlapResult = checkOverlap(
          { sequenceNum: segment.sequenceNum, startMs: segment.startMs, endMs: segment.endMs, text: segment.text },
          { sequenceNum: nextSegment.sequenceNum, startMs: nextSegment.startMs, endMs: nextSegment.endMs, text: nextSegment.text }
        );
        if (overlapResult.hasAlert && overlapResult.severity) {
          alertsToInsert.push({
            fileId,
            segmentId: segment.id,
            ruleCode: "overlap",
            severity: overlapResult.severity,
            message: `Chevauchement avec le segment suivant (${overlapResult.overlapMs}ms).`,
            details: {
              overlapMs: overlapResult.overlapMs,
            },
          });
        }
      }
    }

    // Calculate new score
    const scoreResult = calculateScore(
      alertsToInsert.map((a) => ({
        ruleCode: a.ruleCode,
        severity: a.severity,
      }))
    );

    // Delete old alerts for this file
    await db.delete(alerts).where(eq(alerts.fileId, fileId));

    // Insert new alerts
    if (alertsToInsert.length > 0) {
      await db.insert(alerts).values(
        alertsToInsert.map((a) => ({
          fileId: a.fileId,
          segmentId: a.segmentId,
          ruleCode: a.ruleCode,
          severity: a.severity,
          message: a.message,
          details: a.details,
        }))
      );
    }

    // Update file with new score
    await db
      .update(files)
      .set({
        smeScore: scoreResult.score,
        smeAnalyzedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(files.id, fileId));

    // Get the new alerts with segment info for response
    const newAlerts = await db
      .select()
      .from(alerts)
      .where(eq(alerts.fileId, fileId));

    return NextResponse.json({
      success: true,
      score: scoreResult.score,
      breakdown: scoreResult.breakdown,
      alerts: newAlerts,
    });
  } catch (error) {
    console.error("Error recalculating score:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
