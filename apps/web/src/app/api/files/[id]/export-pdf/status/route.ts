import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, files, eq } from "@sme-studio/db";
import { getPDFJobStatus } from "@/lib/queue";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/files/[id]/export-pdf/status?jobId=xxx
 * Get PDF generation job status for polling
 *
 * Response:
 * - status: "waiting" | "active" | "completed" | "failed" | "unknown"
 * - progress?: number (0-100)
 * - pdfUrl?: string (signed URL when completed)
 * - zipUrl?: string (if combined export)
 * - error?: string (if failed)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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

    // 3. Get jobId from query params
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "jobId manquant" }, { status: 400 });
    }

    const db = getDb();

    // 4. Verify file ownership
    const [file] = await db
      .select({
        id: files.id,
        userId: files.userId,
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

    // 5. Get job status
    const jobStatus = await getPDFJobStatus(jobId);

    // 6. Format response based on status
    if (jobStatus.status === "completed" && jobStatus.result) {
      const response: {
        status: string;
        pdfUrl: string;
        zipUrl?: string;
      } = {
        status: "completed",
        pdfUrl: jobStatus.result.signedUrl,
      };

      // Include ZIP URL if combined export was requested
      if (jobStatus.result.zipSignedUrl) {
        response.zipUrl = jobStatus.result.zipSignedUrl;
      }

      return NextResponse.json(response);
    }

    if (jobStatus.status === "failed") {
      return NextResponse.json({
        status: "failed",
        error: jobStatus.error || "La génération du PDF a échoué",
      });
    }

    if (jobStatus.status === "unknown") {
      return NextResponse.json({
        status: "unknown",
        error: "Job non trouvé",
      });
    }

    // Still processing
    return NextResponse.json({
      status: "processing",
      progress: jobStatus.progress || 0,
    });
  } catch (error) {
    console.error("Error getting PDF status:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du statut" },
      { status: 500 }
    );
  }
}
