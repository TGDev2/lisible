import { NextRequest, NextResponse } from "next/server";
import { getDb, segments, files, eq } from "@sme-studio/db";
import { auth } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

interface SegmentUpdate {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  speaker: string | null;
  isSoundInfo: boolean;
  sequenceNum: number;
}

interface BulkUpdateRequest {
  segments: SegmentUpdate[];
}

/**
 * PUT /api/files/[id]/segments/bulk
 * Bulk update segments for a file (used by undo/redo)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    // Parse request body
    const body: BulkUpdateRequest = await request.json();

    if (!body.segments || !Array.isArray(body.segments)) {
      return NextResponse.json(
        { error: "Invalid request: segments array required" },
        { status: 400 }
      );
    }

    // Get current segments for this file
    const currentSegments = await db
      .select({ id: segments.id })
      .from(segments)
      .where(eq(segments.fileId, fileId));

    const currentIds = new Set(currentSegments.map((s) => s.id));
    const newIds = new Set(body.segments.map((s) => s.id));

    // Find segments to delete (in current but not in new)
    const idsToDelete = [...currentIds].filter((id) => !newIds.has(id));

    // Find segments to insert (in new but not in current)
    const segmentsToInsert = body.segments.filter((s) => !currentIds.has(s.id));

    // Find segments to update (in both)
    const segmentsToUpdate = body.segments.filter((s) => currentIds.has(s.id));

    // Perform deletions
    for (const id of idsToDelete) {
      await db.delete(segments).where(eq(segments.id, id));
    }

    // Perform insertions
    for (const seg of segmentsToInsert) {
      await db.insert(segments).values({
        id: seg.id,
        fileId,
        sequenceNum: seg.sequenceNum,
        startMs: seg.startMs,
        endMs: seg.endMs,
        text: seg.text,
        speaker: seg.speaker,
        isSoundInfo: seg.isSoundInfo,
      });
    }

    // Perform updates
    for (const seg of segmentsToUpdate) {
      await db
        .update(segments)
        .set({
          text: seg.text,
          startMs: seg.startMs,
          endMs: seg.endMs,
          speaker: seg.speaker,
          isSoundInfo: seg.isSoundInfo,
          sequenceNum: seg.sequenceNum,
          updatedAt: new Date(),
        })
        .where(eq(segments.id, seg.id));
    }

    // Update file's updatedAt
    await db
      .update(files)
      .set({ updatedAt: new Date() })
      .where(eq(files.id, fileId));

    return NextResponse.json({
      success: true,
      deleted: idsToDelete.length,
      inserted: segmentsToInsert.length,
      updated: segmentsToUpdate.length,
    });
  } catch (error) {
    console.error("Error in bulk segment update:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
