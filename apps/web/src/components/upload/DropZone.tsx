"use client";

import { useCallback, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import { Upload, File, AlertCircle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// File type configurations
const FILE_CONFIGS = {
  subtitle: {
    extensions: [".srt", ".vtt"],
    mimeTypes: ["text/plain", "text/vtt", "application/x-subrip"],
    maxSize: 10 * 1024 * 1024, // 10MB
    magicBytes: null, // Text files don't have magic bytes
  },
  video: {
    extensions: [".mp4", ".mov"],
    mimeTypes: ["video/mp4", "video/quicktime"],
    maxSize: 500 * 1024 * 1024, // 500MB
    magicBytes: {
      mp4: [0x00, 0x00, 0x00], // ftyp signature starts at byte 4
      mov: [0x00, 0x00, 0x00],
    },
  },
} as const;

const ACCEPTED_EXTENSIONS = [
  ...FILE_CONFIGS.subtitle.extensions,
  ...FILE_CONFIGS.video.extensions,
];

const ACCEPTED_MIME_TYPES = {
  "text/plain": FILE_CONFIGS.subtitle.extensions,
  "text/vtt": [".vtt"],
  "application/x-subrip": [".srt"],
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
};

export type DropZoneState = "idle" | "dragover" | "uploading" | "error";

export interface AcceptedFile {
  file: File;
  type: "subtitle" | "video";
  preview: {
    name: string;
    size: string;
    extension: string;
  };
}

export interface DropZoneError {
  code: "invalid-extension" | "invalid-mime" | "file-too-large" | "invalid-file";
  message: string;
}

export interface UploadProgressInfo {
  percent: number;
  loaded: number;
  total: number;
}

export interface DropZoneProps {
  onFileAccepted: (file: AcceptedFile) => void;
  onError?: (error: DropZoneError) => void;
  onCancel?: () => void;
  state?: DropZoneState;
  uploadProgress?: UploadProgressInfo;
  disabled?: boolean;
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileExtension(filename: string): string {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  return ext || "";
}

function getFileType(extension: string): "subtitle" | "video" | null {
  if (FILE_CONFIGS.subtitle.extensions.includes(extension as any)) {
    return "subtitle";
  }
  if (FILE_CONFIGS.video.extensions.includes(extension as any)) {
    return "video";
  }
  return null;
}

async function validateMagicBytes(file: File): Promise<boolean> {
  const extension = getFileExtension(file.name);

  // Subtitle files are text-based, no magic bytes to check
  if (FILE_CONFIGS.subtitle.extensions.includes(extension as any)) {
    // For SRT/VTT, check if content looks like text
    const text = await file.slice(0, 100).text();
    // SRT starts with a number, VTT starts with "WEBVTT"
    const isSRT = /^\d+\s*\r?\n/.test(text) || /^\uFEFF?\d+\s*\r?\n/.test(text);
    const isVTT = text.startsWith("WEBVTT") || text.startsWith("\uFEFFWEBVTT");
    return isSRT || isVTT || extension === ".srt" || extension === ".vtt";
  }

  // For video files, check magic bytes
  if (FILE_CONFIGS.video.extensions.includes(extension as any)) {
    const buffer = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Check for 'ftyp' box (MP4/MOV container)
    // ftyp appears at byte 4 in most MP4/MOV files
    const hasFtyp = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;

    // Also check for moov atom which some files have at start
    const hasMoov = bytes[4] === 0x6D && bytes[5] === 0x6F && bytes[6] === 0x6F && bytes[7] === 0x76;

    // Check for mdat atom
    const hasMdat = bytes[4] === 0x6D && bytes[5] === 0x64 && bytes[6] === 0x61 && bytes[7] === 0x74;

    return hasFtyp || hasMoov || hasMdat;
  }

  return false;
}

export function DropZone({
  onFileAccepted,
  onError,
  onCancel,
  state: externalState,
  uploadProgress,
  disabled = false,
  className,
}: DropZoneProps) {
  const [internalState, setInternalState] = useState<DropZoneState>("idle");
  const [selectedFile, setSelectedFile] = useState<AcceptedFile | null>(null);
  const [error, setError] = useState<DropZoneError | null>(null);

  const currentState = externalState ?? internalState;

  const clearSelection = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    setInternalState("idle");
  }, []);

  const handleError = useCallback(
    (err: DropZoneError) => {
      setError(err);
      setInternalState("error");
      onError?.(err);
    },
    [onError]
  );

  const processFile = useCallback(
    async (file: File) => {
      const extension = getFileExtension(file.name);
      const fileType = getFileType(extension);

      // Validate extension
      if (!fileType) {
        handleError({
          code: "invalid-extension",
          message: `Format non supporté. Formats acceptés : ${ACCEPTED_EXTENSIONS.join(", ")}`,
        });
        return;
      }

      // Validate file size
      const config = FILE_CONFIGS[fileType];
      if (file.size > config.maxSize) {
        const maxSizeMB = config.maxSize / (1024 * 1024);
        handleError({
          code: "file-too-large",
          message: `Fichier trop volumineux (${formatFileSize(file.size)}). Taille maximum : ${maxSizeMB} MB pour les fichiers ${fileType === "subtitle" ? "SRT/VTT" : "vidéo"}.`,
        });
        return;
      }

      // Validate magic bytes (check for renamed files)
      const isValidContent = await validateMagicBytes(file);
      if (!isValidContent) {
        handleError({
          code: "invalid-file",
          message: `Le fichier ne semble pas être un vrai fichier ${extension.toUpperCase()}. Vérifiez que le fichier n'a pas été renommé avec une mauvaise extension.`,
        });
        return;
      }

      const acceptedFile: AcceptedFile = {
        file,
        type: fileType,
        preview: {
          name: file.name,
          size: formatFileSize(file.size),
          extension: extension.toUpperCase().slice(1),
        },
      };

      setSelectedFile(acceptedFile);
      setError(null);
      setInternalState("idle");
      onFileAccepted(acceptedFile);
    },
    [handleError, onFileAccepted]
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejections: FileRejection[]) => {
      // Handle rejections from react-dropzone
      if (rejections.length > 0) {
        const rejection = rejections[0];
        if (rejection) {
          const errorCode = rejection.errors[0]?.code;

          if (errorCode === "file-too-large") {
            handleError({
              code: "file-too-large",
              message: "Fichier trop volumineux.",
            });
          } else if (errorCode === "file-invalid-type") {
            handleError({
              code: "invalid-mime",
              message: `Format non supporté. Formats acceptés : ${ACCEPTED_EXTENSIONS.join(", ")}`,
            });
          }
        }
        return;
      }

      const file = acceptedFiles[0];
      if (file) {
        await processFile(file);
      }
    },
    [handleError, processFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME_TYPES,
    maxFiles: 1,
    disabled: disabled || currentState === "uploading",
    onDragEnter: () => setInternalState("dragover"),
    onDragLeave: () => setInternalState("idle"),
  });

  const stateClasses = {
    idle: "border-border hover:border-primary/50 hover:bg-muted/50",
    dragover: "border-primary bg-primary/5 scale-[1.02]",
    uploading: "border-primary/50 bg-muted/30 cursor-not-allowed",
    error: "border-destructive bg-destructive/5",
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "relative flex flex-col items-center justify-center",
          "min-h-[200px] rounded-lg border-2 border-dashed",
          "transition-all duration-200 ease-in-out",
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          stateClasses[currentState],
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />

        {currentState === "uploading" ? (
          <div className="flex flex-col items-center gap-4 text-muted-foreground px-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="flex flex-col items-center gap-2 w-full max-w-[250px]">
              <p className="text-sm font-medium">Envoi en cours...</p>
              {uploadProgress && (
                <>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress.percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {uploadProgress.percent}% ({formatFileSize(uploadProgress.loaded)} / {formatFileSize(uploadProgress.total)})
                  </p>
                </>
              )}
            </div>
            {onCancel && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                aria-label="Annuler l'upload"
              >
                <X className="h-3 w-3" />
                Annuler
              </button>
            )}
          </div>
        ) : selectedFile && !error ? (
          <div className="flex flex-col items-center gap-3 px-4">
            <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
              <File className="h-8 w-8 text-primary" />
              <div className="flex flex-col">
                <span className="text-sm font-medium truncate max-w-[200px]">
                  {selectedFile.preview.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {selectedFile.preview.extension} - {selectedFile.preview.size}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearSelection();
                }}
                className="ml-2 rounded-full p-1 hover:bg-background transition-colors"
                aria-label="Supprimer le fichier"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cliquez ou glissez un autre fichier pour remplacer
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-4 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-destructive">Erreur</p>
              <p className="text-xs text-muted-foreground max-w-[300px]">
                {error.message}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearSelection();
              }}
              className="text-xs text-primary hover:underline"
            >
              Réessayer
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 text-center">
            <Upload
              className={cn(
                "h-10 w-10 transition-colors",
                isDragActive ? "text-primary" : "text-muted-foreground"
              )}
            />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                {isDragActive
                  ? "Déposez le fichier ici"
                  : "Glissez un fichier ici"}
              </p>
              <p className="text-xs text-muted-foreground">
                ou <span className="text-primary">parcourez</span>
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Formats : .srt, .vtt, .mp4, .mov
            </p>
            <p className="text-xs text-muted-foreground">
              Max : 500 MB (vidéo), 10 MB (SRT/VTT)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
