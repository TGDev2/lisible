import { NextRequest, NextResponse } from "next/server";
import { getDb, segments, files, alerts, eq, and, gt, asc } from "@sme-studio/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

// Schema for POST request body
const splitSegmentSchema = z.object({
  segmentId: z.string().uuid("Invalid segment ID"),
  cursorPosition: z.number().int().min(0, "Cursor position must be >= 0"),
});

/**
 * POST /api/segments/split
 * Split a segment into two at the cursor position
 *
 * Rules:
 * - Cursor must not be at position 0 (start) or at text.length (end)
 * - Text is split at cursor position
 * - Timecodes are interpolated proportionally based on text position
 * - New segment is inserted after the original
 * - All subsequent segments have their sequenceNum incremented
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
    const validationResult = splitSegmentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { segmentId, cursorPosition } = validationResult.data;
    const db = getDb();

    // Get the segment to split
    const [segmentToSplit] = await db
      .select()
      .from(segments)
      .where(eq(segments.id, segmentId))
      .limit(1);

    if (!segmentToSplit) {
      return NextResponse.json(
        { error: "Segment not found" },
        { status: 404 }
      );
    }

    // Verify user owns the file
    const [file] = await db
      .select({ userId: files.userId })
      .from(files)
      .where(eq(files.id, segmentToSplit.fileId))
      .limit(1);

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const text = segmentToSplit.text;
    const textLength = text.length;

    // Edge case: cursor at beginning or end - no split possible
    if (cursorPosition <= 0 || cursorPosition >= textLength) {
      return NextResponse.json(
        {
          error: "Cannot split at this position",
          details: "Cursor must not be at the beginning or end of the text"
        },
        { status: 400 }
      );
    }

    // Split the text at cursor position
    const firstText = text.slice(0, cursorPosition).trim();
    const secondText = text.slice(cursorPosition).trim();

    // Don't split if either part would be empty after trimming
    if (!firstText || !secondText) {
      return NextResponse.json(
        {
          error: "Cannot split at this position",
          details: "Both parts must contain non-whitespace text"
        },
        { status: 400 }
      );
    }

    // Calculate intermediate timecode proportionally
    // Formula: TC_mid = TC_start + (TC_end - TC_start) * (cursorPosition / textLength)
    const duration = segmentToSplit.endMs - segmentToSplit.startMs;
    const ratio = cursorPosition / textLength;
    const midMs = Math.round(segmentToSplit.startMs + duration * ratio);

    // Ensure midMs is between startMs and endMs (safety check)
    const clampedMidMs = Math.max(
      segmentToSplit.startMs + 1,
      Math.min(segmentToSplit.endMs - 1, midMs)
    );

    // Get all segments after this one to increment their sequenceNum
    const subsequentSegments = await db
      .select({ id: segments.id, sequenceNum: segments.sequenceNum })
      .from(segments)
      .where(
        and(
          eq(segments.fileId, segmentToSplit.fileId),
          gt(segments.sequenceNum, segmentToSplit.sequenceNum)
        )
      )
      .orderBy(asc(segments.sequenceNum));

    // Increment sequenceNum for all subsequent segments (in reverse order to avoid conflicts)
    for (const seg of subsequentSegments.reverse()) {
      await db
        .update(segments)
        .set({ sequenceNum: seg.sequenceNum + 1 })
        .where(eq(segments.id, seg.id));
    }

    // Update the original segment (first part)
    const [updatedFirstSegment] = await db
      .update(segments)
      .set({
        text: firstText,
        endMs: clampedMidMs,
        updatedAt: new Date(),
      })
      .where(eq(segments.id, segmentId))
      .returning();

    // Create the new segment (second part)
    const [newSegment] = await db
      .insert(segments)
      .values({
        fileId: segmentToSplit.fileId,
        sequenceNum: segmentToSplit.sequenceNum + 1,
        startMs: clampedMidMs,
        endMs: segmentToSplit.endMs,
        text: secondText,
        speaker: segmentToSplit.speaker, // Keep the same speaker
        isSoundInfo: segmentToSplit.isSoundInfo,
      })
      .returning();

    // Delete alerts for the original segment (they need to be recalculated)
    await db
      .delete(alerts)
      .where(eq(alerts.segmentId, segmentId));

    return NextResponse.json({
      success: true,
      firstSegment: updatedFirstSegment,
      newSegment: newSegment,
      message: "Segment split successfully",
    });
  } catch (error) {
    console.error("Error splitting segment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
