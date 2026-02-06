import { NextRequest, NextResponse } from "next/server";
import { getDb, segments, files, eq } from "@sme-studio/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

// Schema for PATCH request body
const updateSegmentSchema = z.object({
  text: z.string().min(1, "Text cannot be empty").optional(),
  startMs: z.number().int().min(0).optional(),
  endMs: z.number().int().min(0).optional(),
  speaker: z.string().nullable().optional(),
  isSoundInfo: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/segments/[id]
 * Update a segment's text or other properties
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: segmentId } = await params;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = updateSegmentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const updates = validationResult.data;

    // Ensure at least one field is being updated
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Get the existing segment
    const [existingSegment] = await db
      .select()
      .from(segments)
      .where(eq(segments.id, segmentId))
      .limit(1);

    if (!existingSegment) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }

    // Get the file to verify ownership
    const [file] = await db
      .select({ userId: files.userId })
      .from(files)
      .where(eq(files.id, existingSegment.fileId))
      .limit(1);

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Verify user owns this segment's file
    if (file.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update the segment
    const [updatedSegment] = await db
      .update(segments)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(segments.id, segmentId))
      .returning();

    return NextResponse.json({
      success: true,
      segment: updatedSegment,
    });
  } catch (error) {
    console.error("Error updating segment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
