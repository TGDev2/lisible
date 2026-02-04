import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { upload, getSignedUrl } from "@/lib/storage";
import {
  getDb,
  users,
  projects,
  files,
  segments,
  alerts,
  auditLogs,
  eq,
} from "@sme-studio/db";

// 24 hours in seconds
const EXPORT_URL_EXPIRATION = 86400;

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Non authentifie" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const db = getDb();

    // E2-S6.2: Collect data from all tables

    // 1. User account data
    const [userData] = await db
      .select({
        email: users.email,
        emailVerified: users.emailVerified,
        plan: users.plan,
        creditsTotal: users.creditsTotal,
        creditsUsed: users.creditsUsed,
        creditsRollover: users.creditsRollover,
        creditsResetAt: users.creditsResetAt,
        dataRetentionDays: users.dataRetentionDays,
        lastActivityAt: users.lastActivityAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userData) {
      return NextResponse.json(
        { message: "Utilisateur non trouve" },
        { status: 404 }
      );
    }

    // 2. User projects
    const userProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        lastAccessedAt: projects.lastAccessedAt,
      })
      .from(projects)
      .where(eq(projects.userId, userId));

    // 3. User files with segments and alerts
    const userFiles = await db
      .select({
        id: files.id,
        projectId: files.projectId,
        originalName: files.originalName,
        fileType: files.fileType,
        mimeType: files.mimeType,
        fileSizeBytes: files.fileSizeBytes,
        durationSeconds: files.durationSeconds,
        status: files.status,
        smeScore: files.smeScore,
        smeAnalyzedAt: files.smeAnalyzedAt,
        creditsConsumed: files.creditsConsumed,
        expiresAt: files.expiresAt,
        createdAt: files.createdAt,
        updatedAt: files.updatedAt,
      })
      .from(files)
      .where(eq(files.userId, userId));

    // 4. Collect segments and alerts for each file
    const filesWithDetails = await Promise.all(
      userFiles.map(async (file) => {
        const fileSegments = await db
          .select({
            id: segments.id,
            sequenceNum: segments.sequenceNum,
            startMs: segments.startMs,
            endMs: segments.endMs,
            text: segments.text,
            speaker: segments.speaker,
            isSoundInfo: segments.isSoundInfo,
            createdAt: segments.createdAt,
            updatedAt: segments.updatedAt,
          })
          .from(segments)
          .where(eq(segments.fileId, file.id));

        const fileAlerts = await db
          .select({
            id: alerts.id,
            segmentId: alerts.segmentId,
            ruleCode: alerts.ruleCode,
            severity: alerts.severity,
            message: alerts.message,
            details: alerts.details,
            resolved: alerts.resolved,
            resolvedAt: alerts.resolvedAt,
            createdAt: alerts.createdAt,
          })
          .from(alerts)
          .where(eq(alerts.fileId, file.id));

        return {
          ...file,
          segments: fileSegments,
          alerts: fileAlerts,
        };
      })
    );

    // E2-S6.3: Generate structured JSON
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        formatVersion: "1.0",
        description:
          "Export des donnees personnelles conformement au RGPD (Art. 15 & 20)",
      },
      account: {
        email: userData.email,
        emailVerified: userData.emailVerified,
        plan: userData.plan,
        credits: {
          total: userData.creditsTotal,
          used: userData.creditsUsed,
          rollover: userData.creditsRollover,
          resetAt: userData.creditsResetAt?.toISOString() || null,
        },
        dataRetentionDays: userData.dataRetentionDays,
        lastActivityAt: userData.lastActivityAt?.toISOString() || null,
        createdAt: userData.createdAt?.toISOString() || null,
        updatedAt: userData.updatedAt?.toISOString() || null,
      },
      projects: userProjects.map((project) => ({
        id: project.id,
        name: project.name,
        createdAt: project.createdAt?.toISOString() || null,
        updatedAt: project.updatedAt?.toISOString() || null,
        lastAccessedAt: project.lastAccessedAt?.toISOString() || null,
      })),
      files: filesWithDetails.map((file) => ({
        id: file.id,
        projectId: file.projectId,
        originalName: file.originalName,
        fileType: file.fileType,
        mimeType: file.mimeType,
        fileSizeBytes: file.fileSizeBytes,
        durationSeconds: file.durationSeconds,
        status: file.status,
        smeScore: file.smeScore,
        smeAnalyzedAt: file.smeAnalyzedAt?.toISOString() || null,
        creditsConsumed: file.creditsConsumed,
        expiresAt: file.expiresAt?.toISOString() || null,
        createdAt: file.createdAt?.toISOString() || null,
        updatedAt: file.updatedAt?.toISOString() || null,
        segments: file.segments.map((segment) => ({
          id: segment.id,
          sequenceNum: segment.sequenceNum,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
          speaker: segment.speaker,
          isSoundInfo: segment.isSoundInfo,
          createdAt: segment.createdAt?.toISOString() || null,
          updatedAt: segment.updatedAt?.toISOString() || null,
        })),
        alerts: file.alerts.map((alert) => ({
          id: alert.id,
          segmentId: alert.segmentId,
          ruleCode: alert.ruleCode,
          severity: alert.severity,
          message: alert.message,
          details: alert.details,
          resolved: alert.resolved,
          resolvedAt: alert.resolvedAt?.toISOString() || null,
          createdAt: alert.createdAt?.toISOString() || null,
        })),
      })),
      // Note: glossary and transactions tables will be implemented in future stories
      glossary: [],
      transactions: [],
    };

    // E2-S6.3: Generate JSON string
    const exportJson = JSON.stringify(exportData, null, 2);

    // E2-S6.4: Upload to S3 with 24h expiration key
    const timestamp = Date.now();
    const storageKey = `exports/${userId}/${timestamp}.json`;

    await upload(storageKey, exportJson, {
      contentType: "application/json",
      metadata: {
        userId: userId,
        exportedAt: new Date().toISOString(),
      },
    });

    // E2-S6.5: Generate signed URL with 24h expiration
    const downloadUrl = await getSignedUrl(storageKey, {
      expiresIn: EXPORT_URL_EXPIRATION,
    });

    // E2-S6.6: Log to audit_logs
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                      request.headers.get("x-real-ip") ||
                      null;
    const userAgent = request.headers.get("user-agent") || null;

    await db.insert(auditLogs).values({
      userId: userId,
      action: "data_export",
      resourceType: "user",
      resourceId: userId,
      ipAddress: ipAddress,
      userAgent: userAgent,
      metadata: {
        storageKey: storageKey,
        projectsCount: userProjects.length,
        filesCount: userFiles.length,
        expiresAt: new Date(Date.now() + EXPORT_URL_EXPIRATION * 1000).toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      downloadUrl: downloadUrl,
      expiresIn: EXPORT_URL_EXPIRATION,
      expiresAt: new Date(Date.now() + EXPORT_URL_EXPIRATION * 1000).toISOString(),
      message: "Export genere avec succes. Le lien est valide pendant 24 heures.",
    });
  } catch (error) {
    console.error("Error generating data export:", error);
    return NextResponse.json(
      { message: "Erreur lors de la generation de l'export" },
      { status: 500 }
    );
  }
}
