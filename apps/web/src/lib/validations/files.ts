import { z } from "zod";

// Allowed file types
export const FILE_TYPES = ["srt", "vtt", "video", "audio"] as const;
export type FileType = (typeof FILE_TYPES)[number];

// Allowed MIME types per file type
export const ALLOWED_MIME_TYPES: Record<FileType, string[]> = {
  srt: ["application/x-subrip", "text/plain", "text/srt"],
  vtt: ["text/vtt", "text/plain"],
  video: ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"],
  audio: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/webm"],
};

// Max file sizes in bytes
export const MAX_FILE_SIZE: Record<FileType, number> = {
  srt: 10 * 1024 * 1024, // 10 MB
  vtt: 10 * 1024 * 1024, // 10 MB
  video: 500 * 1024 * 1024, // 500 MB
  audio: 500 * 1024 * 1024, // 500 MB
};

// Max video/audio duration in minutes (for MVP)
export const MAX_DURATION_MINUTES = 30;

// Validation schema for file upload request
export const createFileSchema = z.object({
  name: z
    .string()
    .min(1, "Le nom du fichier est requis")
    .max(255, "Le nom du fichier est trop long"),
  type: z.enum(FILE_TYPES, {
    message: "Type de fichier non supporté",
  }),
  size: z
    .number()
    .int()
    .positive("La taille du fichier doit être positive"),
  mimeType: z.string().optional(),
  // Optional: estimated duration for video/audio in seconds
  estimatedDuration: z.number().int().positive().optional(),
});

export type CreateFileInput = z.infer<typeof createFileSchema>;

// Validate file size against type limits
export function validateFileSize(
  type: FileType,
  size: number
): { valid: boolean; message?: string } {
  const maxSize = MAX_FILE_SIZE[type];
  if (size > maxSize) {
    const maxSizeMB = maxSize / (1024 * 1024);
    return {
      valid: false,
      message: `Fichier trop volumineux. Taille maximum : ${maxSizeMB} MB`,
    };
  }
  return { valid: true };
}

// Validate MIME type against allowed types
export function validateMimeType(
  type: FileType,
  mimeType?: string
): { valid: boolean; message?: string } {
  if (!mimeType) {
    return { valid: true }; // Allow if no MIME type provided
  }

  const allowedTypes = ALLOWED_MIME_TYPES[type];
  if (!allowedTypes.includes(mimeType)) {
    return {
      valid: false,
      message: `Type MIME non supporté pour ce type de fichier`,
    };
  }
  return { valid: true };
}

// Validate estimated duration for video/audio
export function validateDuration(
  type: FileType,
  estimatedDuration?: number
): { valid: boolean; message?: string } {
  if (type !== "video" && type !== "audio") {
    return { valid: true };
  }

  if (estimatedDuration && estimatedDuration > MAX_DURATION_MINUTES * 60) {
    return {
      valid: false,
      message: `Durée trop longue. Maximum : ${MAX_DURATION_MINUTES} minutes`,
    };
  }
  return { valid: true };
}

// Get file extension from filename
export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  const lastPart = parts[parts.length - 1];
  return parts.length > 1 && lastPart ? lastPart.toLowerCase() : "";
}

// Determine file type from filename and MIME type
export function determineFileType(
  filename: string,
  mimeType?: string
): FileType | null {
  const extension = getFileExtension(filename);

  // Check by extension first
  if (extension === "srt") return "srt";
  if (extension === "vtt") return "vtt";
  if (["mp4", "mov", "avi", "webm"].includes(extension)) return "video";
  if (["mp3", "wav", "m4a", "ogg"].includes(extension)) return "audio";

  // Fallback to MIME type
  if (mimeType) {
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.includes("subrip") || mimeType === "text/srt") return "srt";
    if (mimeType === "text/vtt") return "vtt";
  }

  return null;
}
