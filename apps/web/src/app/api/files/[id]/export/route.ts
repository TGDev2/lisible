import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, files, segments, eq, asc } from "@sme-studio/db";
import { generateSRT, generateVTT } from "@sme-studio/subtitle-parser";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/files/[id]/export?format=srt|vtt
 * Download subtitle file in SRT or VTT format
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

    // 3. Get format from query params
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get("format")?.toLowerCase();

    if (!format || (format !== "srt" && format !== "vtt")) {
      return NextResponse.json(
        { error: "Format invalide. Utilisez format=srt ou format=vtt" },
        { status: 400 }
      );
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

    // 8. Fetch segments from DB
    const dbSegments = await db
      .select({
        sequenceNum: segments.sequenceNum,
        startMs: segments.startMs,
        endMs: segments.endMs,
        text: segments.text,
        speaker: segments.speaker,
        isSoundInfo: segments.isSoundInfo,
      })
      .from(segments)
      .where(eq(segments.fileId, fileId))
      .orderBy(asc(segments.sequenceNum));

    // Map DB segments to subtitle-parser format (null -> undefined)
    const fileSegments = dbSegments.map((seg) => ({
      sequenceNum: seg.sequenceNum,
      startMs: seg.startMs,
      endMs: seg.endMs,
      text: seg.text,
      speaker: seg.speaker ?? undefined,
      isSoundInfo: seg.isSoundInfo ?? undefined,
    }));

    // 9. Generate content using subtitle-parser
    const content = format === "srt"
      ? generateSRT(fileSegments)
      : generateVTT(fileSegments);

    // 10. Prepare filename - preserve original name with new extension
    const originalBaseName = file.originalName.replace(/\.[^/.]+$/, "");
    const exportFileName = `${originalBaseName}.${format}`;

    // 11. Set response headers for download
    const headers = new Headers();
    headers.set("Content-Type", format === "srt" ? "text/srt; charset=utf-8" : "text/vtt; charset=utf-8");
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(exportFileName)}"`);
    headers.set("Content-Length", Buffer.byteLength(content, "utf-8").toString());

    // 12. Return file as response
    return new Response(content, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Error exporting file:", error);
    return NextResponse.json({ error: "Erreur lors de l'export" }, { status: 500 });
  }
}
