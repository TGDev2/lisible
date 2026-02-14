import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, files, eq } from "@sme-studio/db";

/**
 * Processing stages for client display
 */
export type ProcessingStage =
  | "pending"
  | "uploading"
  | "processing"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed";

/**
 * File status response
 */
export interface FileStatusResponse {
  id: string;
  status: string;
  stage: ProcessingStage;
  progressPercent: number;
  smeScore: number | null;
  errorMessage: string | null;
  updatedAt: string;
}

/**
 * Map database status to client-friendly stage
 */
function mapStatusToStage(status: string | null): ProcessingStage {
  switch (status) {
    case "pending":
      return "pending";
    case "uploading":
      return "uploading";
    case "processing_stt":
      return "transcribing";
    case "processing_sme":
      return "analyzing";
    case "ready":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
    case "deleted":
      return "failed";
    default:
      return "pending";
  }
}

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/files/[id]/status
 * Get file processing status for real-time progress tracking
 * Designed for polling (5s interval recommended)
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
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
        progressPercent: files.progressPercent,
        smeScore: files.smeScore,
        errorMessage: files.errorMessage,
        updatedAt: files.updatedAt,
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

    // 6. Build response
    const response: FileStatusResponse = {
      id: file.id,
      status: file.status ?? "pending",
      stage: mapStatusToStage(file.status),
      progressPercent: file.progressPercent ?? 0,
      smeScore: file.smeScore,
      errorMessage: file.errorMessage,
      updatedAt: file.updatedAt?.toISOString() ?? new Date().toISOString(),
    };

    // 7. Return with cache headers for polling
    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      },
    });
  } catch (error) {
    console.error("Error fetching file status:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du statut" },
      { status: 500 }
    );
  }
}
