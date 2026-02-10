import { NextRequest, NextResponse } from "next/server";
import { getDb, segments, files, alerts, eq, and, inArray, asc, gt } from "@sme-studio/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

// Schema for POST request body
const mergeSegmentsSchema = z.object({
  segmentIds: z
    .array(z.string().uuid())
    .length(2, "Exactly 2 segment IDs are required"),
});

/**
 * POST /api/segments/merge
 * Merge two consecutive segments into one
 *
 * Rules:
 * - Segments must be consecutive (sequenceNum differ by 1)
 * - Text is concatenated with a space
 * - Start time from first segment, end time from second
 * - Speaker from first segment (if any)
 * - Second segment is deleted
 * - All subsequent segments have their sequenceNum decremented
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = mergeSegmentsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { segmentIds } = validationResult.data;
    const db = getDb();

    // Get both segments
    const segmentsToMerge = await db
      .select()
      .from(segments)
      .where(inArray(segments.id, segmentIds))
      .orderBy(asc(segments.sequenceNum));

    const firstSegment = segmentsToMerge[0];
    const secondSegment = segmentsToMerge[1];

    if (!firstSegment || !secondSegment) {
      return NextResponse.json(
        { error: "One or both segments not found" },
        { status: 404 }
      );
    }

    // Verify both segments belong to the same file
    if (firstSegment.fileId !== secondSegment.fileId) {
      return NextResponse.json(
        { error: "Segments must belong to the same file" },
        { status: 400 }
      );
    }

    // Verify user owns the file
    const [file] = await db
      .select({ userId: files.userId })
      .from(files)
      .where(eq(files.id, firstSegment.fileId))
      .limit(1);

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify segments are consecutive
    if (secondSegment.sequenceNum - firstSegment.sequenceNum !== 1) {
      return NextResponse.json(
        { error: "Segments must be consecutive" },
        { status: 400 }
      );
    }

    // Merge the segments:
    // - Text: concatenate with space (or newline for better readability)
    // - TC: start from first, end from second
    // - Speaker: keep from first
    // - isSoundInfo: only if both are sound info
    const mergedText = `${firstSegment.text} ${secondSegment.text}`.trim();
    const mergedStartMs = firstSegment.startMs;
    const mergedEndMs = secondSegment.endMs;
    const mergedSpeaker = firstSegment.speaker;
    const mergedIsSoundInfo =
      firstSegment.isSoundInfo && secondSegment.isSoundInfo;

    // Update first segment with merged data
    const [updatedSegment] = await db
      .update(segments)
      .set({
        text: mergedText,
        startMs: mergedStartMs,
        endMs: mergedEndMs,
        speaker: mergedSpeaker,
        isSoundInfo: mergedIsSoundInfo,
        updatedAt: new Date(),
      })
      .where(eq(segments.id, firstSegment.id))
      .returning();

    // Delete alerts for the second segment
    await db
      .delete(alerts)
      .where(eq(alerts.segmentId, secondSegment.id));

    // Delete the second segment
    await db.delete(segments).where(eq(segments.id, secondSegment.id));

    // Get all segments after the deleted one and decrement their sequenceNum
    const subsequentSegments = await db
      .select({ id: segments.id, sequenceNum: segments.sequenceNum })
      .from(segments)
      .where(
        and(
          eq(segments.fileId, firstSegment.fileId),
          gt(segments.sequenceNum, secondSegment.sequenceNum)
        )
      );

    // Update sequenceNum for segments after the deleted one
    for (const seg of subsequentSegments) {
      await db
        .update(segments)
        .set({ sequenceNum: seg.sequenceNum - 1 })
        .where(eq(segments.id, seg.id));
    }

    return NextResponse.json({
      success: true,
      segment: updatedSegment,
      deletedSegmentId: secondSegment.id,
      message: "Segments merged successfully",
    });
  } catch (error) {
    console.error("Error merging segments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
