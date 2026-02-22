import { NextRequest, NextResponse } from "next/server";
import { parseSubtitle } from "@sme-studio/subtitle-parser";
import type { Segment } from "@sme-studio/subtitle-parser";
import {
  checkSpeed,
  checkLength,
  checkOverlap,
  checkDuration,
  checkProperNouns,
  calculateScore,
  type AlertInput,
  type AlertSeverity,
  type RuleCode,
  type ScoreResult,
} from "@sme-studio/sme-engine";
import { checkAndRecordDiagnosticRateLimit } from "@/lib/rate-limit";
import { createDiagnosticTemporaryToken } from "@/lib/diagnostic-token";

const ACCEPTED_EXTENSIONS = [".srt", ".vtt"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface DiagnosticAlert {
  ruleCode: RuleCode;
  severity: AlertSeverity;
  message: string;
  count: number;
}

const RULE_LABELS: Record<RuleCode, string> = {
  speed: "Vitesse de lecture excessive",
  length: "Segments trop longs",
  overlap: "Chevauchements temporels",
  duration: "Durée d'affichage insuffisante",
  proper_noun: "Noms propres à vérifier",
};

const SEVERITY_WEIGHT: Record<AlertSeverity, number> = {
  critical: 10,
  warning: 5,
  info: 1,
};

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

interface AnalysisResult {
  scoreResult: ScoreResult;
  topAlerts: DiagnosticAlert[];
}

function analyzeSegments(segments: Segment[]): AnalysisResult {
  const alerts: AlertInput[] = [];

  for (const segment of segments) {
    const speedResult = checkSpeed(segment);
    if (speedResult.hasAlert && speedResult.severity) {
      alerts.push({ ruleCode: "speed", severity: speedResult.severity });
    }

    const lengthResult = checkLength(segment);
    if (lengthResult.hasAlert && lengthResult.severity) {
      alerts.push({ ruleCode: "length", severity: lengthResult.severity });
    }

    const durationResult = checkDuration(segment);
    if (durationResult.hasAlert && durationResult.severity) {
      alerts.push({ ruleCode: "duration", severity: durationResult.severity });
    }

    const properNounResult = checkProperNouns(segment);
    if (properNounResult.hasAlert && properNounResult.severity) {
      alerts.push({
        ruleCode: "proper_noun",
        severity: properNounResult.severity,
      });
    }
  }

  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < sorted.length - 1; i++) {
    const overlapResult = checkOverlap(sorted[i]!, sorted[i + 1]!);
    if (overlapResult.hasAlert && overlapResult.severity) {
      alerts.push({ ruleCode: "overlap", severity: overlapResult.severity });
    }
  }

  const scoreResult = calculateScore(alerts);

  // Build top alerts: aggregate by rule, pick highest severity per rule, sort by impact
  const ruleAggregation = new Map<
    RuleCode,
    { severity: AlertSeverity; count: number; impact: number }
  >();
  for (const alert of alerts) {
    const existing = ruleAggregation.get(alert.ruleCode);
    if (!existing) {
      ruleAggregation.set(alert.ruleCode, {
        severity: alert.severity,
        count: 1,
        impact: SEVERITY_WEIGHT[alert.severity],
      });
    } else {
      existing.count++;
      existing.impact += SEVERITY_WEIGHT[alert.severity];
      if (SEVERITY_WEIGHT[alert.severity] > SEVERITY_WEIGHT[existing.severity]) {
        existing.severity = alert.severity;
      }
    }
  }

  const topAlerts: DiagnosticAlert[] = Array.from(ruleAggregation.entries())
    .map(([ruleCode, { severity, count, impact }]) => ({
      ruleCode,
      severity,
      message: RULE_LABELS[ruleCode],
      count,
      impact,
    }))
    .sort(
      (a, b) =>
        b.impact - a.impact ||
        SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] ||
        b.count - a.count
    )
    .slice(0, 3)
    .map(({ ruleCode, severity, message, count }) => ({
      ruleCode,
      severity,
      message,
      count,
    }));

  return { scoreResult, topAlerts };
}

async function storeInRedis(
  fileId: string,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    const { setDiagnosticResult } = await import("@/lib/redis");
    return await setDiagnosticResult(fileId, JSON.stringify(data));
  } catch {
    return false;
  }
}

/**
 * POST /api/diagnostic/upload
 * Anonymous endpoint for instant SME diagnostic.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkAndRecordDiagnosticRateLimit(ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Trop de diagnostics effectués. Réessayez dans ${Math.ceil(rateLimit.resetIn / 60)} minute(s).`,
          code: "RATE_LIMITED",
          resetIn: rateLimit.resetIn,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.resetIn) },
        }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Requête invalide. Envoyez un fichier via FormData." },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Aucun fichier fourni." },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const dotIndex = fileName.lastIndexOf(".");
    const extension = dotIndex >= 0 ? fileName.slice(dotIndex) : "";
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      return NextResponse.json(
        { error: "Formats acceptés : SRT, VTT" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Fichier trop volumineux. Taille maximale : 10 MB." },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "Le fichier est vide." },
        { status: 400 }
      );
    }

    const content = await file.text();
    const parseResult = parseSubtitle(content);

    if (parseResult.segments.length === 0) {
      return NextResponse.json(
        {
          error:
            "Aucun segment trouvé dans le fichier. Vérifiez le format du fichier.",
        },
        { status: 400 }
      );
    }

    const { scoreResult, topAlerts } = analyzeSegments(parseResult.segments);
    const fileId = crypto.randomUUID();
    const temporaryToken = createDiagnosticTemporaryToken(fileId);

    const stored = await storeInRedis(fileId, {
      fileId,
      score: scoreResult,
      topAlerts,
      fileName: file.name,
      format: parseResult.format,
      segmentCount: parseResult.segments.length,
      createdAt: new Date().toISOString(),
    });
    if (!stored) {
      return NextResponse.json(
        {
          error:
            "Service temporairement indisponible. Veuillez réessayer dans quelques secondes.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      fileId,
      temporaryToken,
      score: scoreResult.score,
      breakdown: scoreResult.breakdown,
      topAlerts,
      fileName: file.name,
      format: parseResult.format,
      segmentCount: parseResult.segments.length,
    });
  } catch (error) {
    console.error("Diagnostic upload error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse du fichier." },
      { status: 500 }
    );
  }
}
