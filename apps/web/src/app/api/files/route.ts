import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, users, projects, files, eq, desc, ne, and } from "@sme-studio/db";
import { getSignedUploadUrl } from "@/lib/storage";
import {
  createFileSchema,
  validateFileSize,
  validateMimeType,
  validateDuration,
  type FileType,
} from "@/lib/validations/files";

/**
 * GET /api/files
 * List all files for the authenticated user (excluding deleted)
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    const db = getDb();
    const userFiles = await db
      .select({
        id: files.id,
        originalName: files.originalName,
        fileType: files.fileType,
        fileSizeBytes: files.fileSizeBytes,
        status: files.status,
        smeScore: files.smeScore,
        createdAt: files.createdAt,
        updatedAt: files.updatedAt,
        durationSeconds: files.durationSeconds,
      })
      .from(files)
      .where(
        and(
          eq(files.userId, session.user.id),
          ne(files.status, "deleted")
        )
      )
      .orderBy(desc(files.createdAt));

    return NextResponse.json(userFiles);
  } catch (error) {
    console.error("Error listing files:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des fichiers" },
      { status: 500 }
    );
  }
}

// Presigned URL expiration: 15 minutes (900 seconds)
const PRESIGNED_URL_EXPIRATION = 15 * 60;

// Default project name when auto-creating
const DEFAULT_PROJECT_NAME = "Mon projet";

interface QuotaCheckResult {
  hasQuota: boolean;
  available: number;
  message?: string;
}

/**
 * Check if user has sufficient quota for upload
 * For video/audio, estimates based on file size (rough heuristic)
 * For SRT/VTT, no quota deduction needed
 */
async function checkUserQuota(
  userId: string,
  fileType: FileType,
  estimatedDuration?: number
): Promise<QuotaCheckResult> {
  const db = getDb();

  const [user] = await db
    .select({
      creditsTotal: users.creditsTotal,
      creditsUsed: users.creditsUsed,
      creditsRollover: users.creditsRollover,
      plan: users.plan,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { hasQuota: false, available: 0, message: "Utilisateur non trouvé" };
  }

  // SRT/VTT files don't consume quota
  if (fileType === "srt" || fileType === "vtt") {
    return { hasQuota: true, available: Infinity };
  }

  // Calculate available credits
  const creditsTotal = user.creditsTotal ?? 30;
  const creditsUsed = user.creditsUsed ?? 0;
  const creditsRollover = user.creditsRollover ?? 0;
  const available = creditsTotal - creditsUsed + creditsRollover;

  // If no estimated duration, allow upload (will check actual duration after STT)
  if (!estimatedDuration) {
    // Just check if user has any credits remaining
    if (available <= 0) {
      return {
        hasQuota: false,
        available: 0,
        message: "Quota épuisé. Passez à l'offre Pro pour continuer.",
      };
    }
    return { hasQuota: true, available };
  }

  // Convert estimated duration from seconds to minutes (rounded up)
  const estimatedMinutes = Math.ceil(estimatedDuration / 60);

  // Add 10% safety margin
  const requiredMinutes = Math.ceil(estimatedMinutes * 1.1);

  if (requiredMinutes > available) {
    return {
      hasQuota: false,
      available,
      message: `Quota insuffisant. Vous avez ${available} minutes disponibles, mais ce fichier nécessite environ ${estimatedMinutes} minutes.`,
    };
  }

  return { hasQuota: true, available };
}

/**
 * Get or create a default project for the user
 */
async function getOrCreateDefaultProject(userId: string): Promise<string> {
  const db = getDb();

  // Check if user has any existing project
  const [existingProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(projects.lastAccessedAt)
    .limit(1);

  if (existingProject) {
    // Update last accessed timestamp
    await db
      .update(projects)
      .set({ lastAccessedAt: new Date() })
      .where(eq(projects.id, existingProject.id));

    return existingProject.id;
  }

  // Create new default project
  const [newProject] = await db
    .insert(projects)
    .values({
      userId,
      name: DEFAULT_PROJECT_NAME,
    })
    .returning({ id: projects.id });

  if (!newProject) {
    throw new Error("Failed to create project");
  }

  return newProject.id;
}

/**
 * Generate unique storage key for the file
 */
function generateStorageKey(
  userId: string,
  fileId: string,
  originalName: string
): string {
  // Format: users/{userId}/files/{fileId}/{original_name}
  // This ensures uniqueness while preserving original filename for reference
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `users/${userId}/files/${fileId}/${sanitizedName}`;
}

/**
 * POST /api/files
 * Create a new file record and return presigned upload URL
 */
export async function POST(request: NextRequest) {
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

    // 2. Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Corps de requête invalide" },
        { status: 400 }
      );
    }

    const parseResult = createFileSchema.safeParse(body);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => issue.message).join(", ");
      return NextResponse.json(
        { error: errors },
        { status: 400 }
      );
    }

    const { name, type, size, mimeType, estimatedDuration } = parseResult.data;

    // 3. Validate file size
    const sizeValidation = validateFileSize(type, size);
    if (!sizeValidation.valid) {
      return NextResponse.json(
        { error: sizeValidation.message },
        { status: 400 }
      );
    }

    // 4. Validate MIME type
    const mimeValidation = validateMimeType(type, mimeType);
    if (!mimeValidation.valid) {
      return NextResponse.json(
        { error: mimeValidation.message },
        { status: 400 }
      );
    }

    // 5. Validate duration for video/audio
    const durationValidation = validateDuration(type, estimatedDuration);
    if (!durationValidation.valid) {
      return NextResponse.json(
        { error: durationValidation.message },
        { status: 400 }
      );
    }

    // 6. Check user quota
    const quotaResult = await checkUserQuota(userId, type, estimatedDuration);
    if (!quotaResult.hasQuota) {
      return NextResponse.json(
        {
          error: quotaResult.message || "Quota insuffisant",
          code: "QUOTA_EXCEEDED",
          available: quotaResult.available,
        },
        { status: 402 }
      );
    }

    // 7. Get or create default project
    const projectId = await getOrCreateDefaultProject(userId);

    // 8. Create file record with status=pending
    const db = getDb();
    const [newFile] = await db
      .insert(files)
      .values({
        projectId,
        userId,
        originalName: name,
        fileType: type,
        mimeType: mimeType || null,
        fileSizeBytes: size,
        status: "pending",
        progressPercent: 0,
      })
      .returning({
        id: files.id,
        createdAt: files.createdAt,
      });

    if (!newFile) {
      throw new Error("Failed to create file record");
    }

    // 9. Generate storage key
    const storageKey = generateStorageKey(userId, newFile.id, name);

    // 10. Update file record with storage key
    await db
      .update(files)
      .set({ storageKey })
      .where(eq(files.id, newFile.id));

    // 11. Generate presigned upload URL (expires in 15 minutes)
    const uploadUrl = await getSignedUploadUrl(
      storageKey,
      mimeType,
      { expiresIn: PRESIGNED_URL_EXPIRATION }
    );

    // 12. Return response
    return NextResponse.json(
      {
        fileId: newFile.id,
        uploadUrl,
        storageKey,
        expiresIn: PRESIGNED_URL_EXPIRATION,
        projectId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating file:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du fichier" },
      { status: 500 }
    );
  }
}
