import { NextRequest, NextResponse } from "next/server";
import { verifyDiagnosticTemporaryToken } from "@/lib/diagnostic-token";
import { getDiagnosticResult } from "@/lib/redis";

interface RouteParams {
  params: Promise<{ fileId: string }>;
}

/**
 * GET /api/diagnostic/[fileId]/result
 * Returns diagnostic results from Redis, authenticated by temporaryToken.
 * Token can be passed via Authorization header, `x-temporary-token` header,
 * or `temporaryToken` query param.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { fileId } = await params;

  if (!fileId) {
    return NextResponse.json(
      { error: "Identifiant de fichier manquant." },
      { status: 400 }
    );
  }

  // Extract token from Authorization header, dedicated header, or query param
  const authHeader = request.headers.get("authorization");
  const tokenFromHeader = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const tokenFromTemporaryHeader = request.headers.get("x-temporary-token");
  const url = new URL(request.url);
  const tokenFromQuery =
    url.searchParams.get("temporaryToken") || url.searchParams.get("token");
  const token = tokenFromHeader || tokenFromTemporaryHeader || tokenFromQuery;

  if (!token) {
    return NextResponse.json(
      { error: "Token d'accès manquant." },
      { status: 401 }
    );
  }

  // Verify token
  const payload = verifyDiagnosticTemporaryToken(token, fileId);
  if (!payload) {
    return NextResponse.json(
      { error: "Token invalide ou expiré." },
      { status: 401 }
    );
  }

  // Fetch from Redis
  const cached = await getDiagnosticResult(fileId);
  if (!cached) {
    return NextResponse.json(
      { error: "Résultat non trouvé ou expiré. Veuillez relancer un diagnostic." },
      { status: 404 }
    );
  }

  try {
    const data = JSON.parse(cached) as {
      fileId: string;
      score: { score: number; breakdown: Record<string, unknown> };
      topAlerts?: Array<{
        ruleCode: string;
        severity: string;
        message: string;
        count: number;
      }>;
      fileName: string;
      format: string;
      segmentCount: number;
      createdAt: string;
    };

    return NextResponse.json({
      fileId: data.fileId,
      score: data.score.score,
      breakdown: data.score.breakdown,
      topAlerts: Array.isArray(data.topAlerts) ? data.topAlerts.slice(0, 3) : [],
      fileName: data.fileName,
      format: data.format,
      segmentCount: data.segmentCount,
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur lors de la lecture des résultats." },
      { status: 500 }
    );
  }
}
