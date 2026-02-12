import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, files, eq } from "@sme-studio/db";
import { enqueuePDFJob } from "@/lib/queue";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/files/[id]/export-pdf
 * Trigger async PDF proof document generation
 *
 * Request body:
 * - subtitleFormat?: "srt" | "vtt" (optional, for combined export)
 *
 * Response:
 * - jobId: string (for polling status)
 * - status: "processing"
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const userId = session.user.id;
    const { id: fileId } = await params;

    // 2. Validate fileId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(fileId)) {
      return NextResponse.json({ error: "ID de fichier invalide" }, { status: 400 });
    }

    // 3. Parse request body
    let subtitleFormat: "srt" | "vtt" | undefined;
    try {
      const body = await request.json();
      if (body.subtitleFormat && ["srt", "vtt"].includes(body.subtitleFormat)) {
        subtitleFormat = body.subtitleFormat;
      }
    } catch {
      // Body is optional
    }

    const db = getDb();

    // 4. Get file record
    const [file] = await db
      .select({
        id: files.id,
        userId: files.userId,
        originalName: files.originalName,
        status: files.status,
      })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);

    // 5. Check file exists
    if (!file) {
      return NextResponse.json({ error: "Fichier non trouvé" }, { status: 404 });
    }

    // 6. Check ownership
    if (file.userId !== userId) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    // 7. Check file is ready
    if (file.status !== "ready") {
      return NextResponse.json(
        { error: "Le fichier n'est pas prêt pour l'export" },
        { status: 400 }
      );
    }

    // 8. Enqueue PDF generation job
    const jobId = await enqueuePDFJob({
      fileId,
      userId,
      subtitleFormat,
    });

    // 9. Return job info for polling
    return NextResponse.json({
      jobId,
      status: "processing",
      message: "Génération du PDF en cours...",
    });
  } catch (error) {
    console.error("Error starting PDF export:", error);
    return NextResponse.json(
      { error: "Erreur lors du démarrage de la génération" },
      { status: 500 }
    );
  }
}
