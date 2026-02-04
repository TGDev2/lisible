import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, files, eq, and } from "@sme-studio/db";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * Determine next processing status based on file type
 */
function getProcessingStatus(fileType: string): string {
  // Video and audio files need STT processing first
  if (fileType === "video" || fileType === "audio") {
    return "processing_stt";
  }
  // SRT and VTT files go directly to SME analysis
  return "processing_sme";
}

/**
 * POST /api/files/[id]/confirm
 * Confirm that file upload to S3 is complete
 * Updates file status from pending to processing
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
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
        fileType: files.fileType,
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

    // 6. Check current status (should be pending or uploading)
    if (file.status !== "pending" && file.status !== "uploading") {
      // File already processed or in error state
      if (file.status === "failed") {
        return NextResponse.json(
          { error: "L'upload du fichier a échoué. Veuillez réessayer." },
          { status: 400 }
        );
      }
      // File is already being processed or ready
      return NextResponse.json(
        {
          message: "Fichier déjà confirmé",
          status: file.status,
          fileId: file.id,
        },
        { status: 200 }
      );
    }

    // 7. Check storage key exists (file should have been set up)
    if (!file.storageKey) {
      return NextResponse.json(
        { error: "Configuration du fichier incomplète" },
        { status: 400 }
      );
    }

    // 8. Determine next status based on file type
    const nextStatus = getProcessingStatus(file.fileType);

    // 9. Update file status to processing
    const [updatedFile] = await db
      .update(files)
      .set({
        status: nextStatus,
        progressPercent: 0,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(files.id, fileId),
          eq(files.userId, userId)
        )
      )
      .returning({
        id: files.id,
        status: files.status,
        fileType: files.fileType,
      });

    if (!updatedFile) {
      return NextResponse.json(
        { error: "Échec de la mise à jour du fichier" },
        { status: 500 }
      );
    }

    // TODO: E3-S4 - Enqueue job for processing (STT or SME)
    // This will be implemented in the next story:
    // - If video/audio: enqueue STT job
    // - If srt/vtt: enqueue SME job

    // 10. Return success response
    return NextResponse.json(
      {
        message: "Upload confirmé",
        fileId: updatedFile.id,
        status: updatedFile.status,
        fileType: updatedFile.fileType,
        nextStep: updatedFile.status === "processing_stt"
          ? "Transcription en cours"
          : "Analyse SME en cours",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error confirming upload:", error);
    return NextResponse.json(
      { error: "Erreur lors de la confirmation de l'upload" },
      { status: 500 }
    );
  }
}
