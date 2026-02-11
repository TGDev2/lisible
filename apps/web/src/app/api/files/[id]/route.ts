import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, files, segments, alerts, jobs, eq, and, asc } from "@sme-studio/db";
import { deleteObject, getSignedUrl } from "@/lib/storage";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/files/[id]
 * Get file with segments and alerts for the editor
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    // Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const userId = session.user.id;
    const { id: fileId } = await params;

    // Validate fileId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(fileId)) {
      return NextResponse.json({ error: "ID de fichier invalide" }, { status: 400 });
    }

    const db = getDb();

    // Get file record
    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    if (!file) {
      return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
    }

    // Check ownership
    if (file.userId !== userId) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    // Get all segments ordered by sequence
    const fileSegments = await db
      .select()
      .from(segments)
      .where(eq(segments.fileId, fileId))
      .orderBy(asc(segments.sequenceNum));

    // Get all alerts for this file
    const fileAlerts = await db
      .select()
      .from(alerts)
      .where(eq(alerts.fileId, fileId));

    // Group alerts by segment
    const alertsBySegment = new Map<string, typeof fileAlerts>();
    for (const alert of fileAlerts) {
      if (!alert.segmentId) continue;
      const existing = alertsBySegment.get(alert.segmentId) ?? [];
      existing.push(alert);
      alertsBySegment.set(alert.segmentId, existing);
    }

    // Combine segments with their alerts
    const segmentsWithAlerts = fileSegments.map((segment) => ({
      ...segment,
      alerts: alertsBySegment.get(segment.id) ?? [],
    }));

    // Generate signed URL for video/audio files
    let videoUrl: string | null = null;
    if (
      file.storageKey &&
      (file.fileType === "video" || file.fileType === "audio")
    ) {
      try {
        // Generate signed URL with 2 hour expiration for video playback
        videoUrl = await getSignedUrl(file.storageKey, { expiresIn: 7200 });
      } catch (err) {
        console.warn("Failed to generate signed URL for video:", err);
        // Continue without video URL - player will show "unavailable" state
      }
    }

    return NextResponse.json({
      id: file.id,
      projectId: file.projectId,
      originalName: file.originalName,
      fileType: file.fileType,
      status: file.status,
      smeScore: file.smeScore,
      smeAnalyzedAt: file.smeAnalyzedAt,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      durationSeconds: file.durationSeconds,
      videoUrl,
      segments: segmentsWithAlerts,
    });
  } catch (error) {
    console.error("Error fetching file:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * DELETE /api/files/[id]
 * Cancel upload and delete file (including S3 cleanup)
 * Used when user cancels an ongoing upload
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { id: fileId } = await params;

    // 2. Validate fileId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(fileId)) {
      return NextResponse.json(
        { error: "ID de fichier invalide" },
        { status: 400 }
      );
    }

    // 3. Get file record
    const db = getDb();
    const [file] = await db
      .select({
        id: files.id,
        userId: files.userId,
        status: files.status,
        storageKey: files.storageKey,
      })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    // 4. Check file exists
    if (!file) {
      return NextResponse.json(
        { error: "Fichier non trouvé" },
        { status: 404 }
      );
    }

    // 5. Check ownership
    if (file.userId !== userId) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    // 6. Check if file can be cancelled
    // Only allow cancellation for pending, uploading, or cancelled status
    const cancellableStatuses = ["pending", "uploading", "cancelled"];
    if (!file.status || !cancellableStatuses.includes(file.status)) {
      // If file is already processed (processing_stt, processing_sme, ready)
      // or failed, return appropriate error
      if (file.status === "ready") {
        return NextResponse.json(
          { error: "Le fichier a déjà été traité et ne peut pas être annulé" },
          { status: 400 }
        );
      }
      if (file.status === "processing_stt" || file.status === "processing_sme") {
        return NextResponse.json(
          { error: "Le traitement est en cours, annulation impossible" },
          { status: 400 }
        );
      }
    }

    // 7. Delete from S3 if storage key exists (partial upload cleanup)
    if (file.storageKey) {
      try {
        await deleteObject(file.storageKey);
      } catch (s3Error) {
        // Log S3 error but don't fail the request
        // File might not exist in S3 if upload was cancelled early
        console.warn("S3 deletion failed (file may not exist):", s3Error);
      }
    }

    // 8. Delete any pending jobs for this file
    await db
      .delete(jobs)
      .where(
        and(
          eq(jobs.fileId, fileId),
          eq(jobs.status, "pending")
        )
      );

    // 9. Update file status to cancelled (or delete record)
    // Marking as cancelled preserves audit trail
    await db
      .update(files)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(files.id, fileId),
          eq(files.userId, userId)
        )
      );

    // 10. Return success response
    return NextResponse.json(
      {
        message: "Upload annulé",
        fileId,
        status: "cancelled",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error cancelling upload:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'annulation de l'upload" },
      { status: 500 }
    );
  }
}
