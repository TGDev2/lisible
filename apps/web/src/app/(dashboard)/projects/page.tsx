"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FileText, Film, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScoreBadge } from "@/components/shared/ScoreBadge";
import { QuotaBadge } from "@/components/shared/QuotaBadge";
import { DropZone, type AcceptedFile } from "@/components/upload/DropZone";
import { cn } from "@/lib/utils";

interface FileItem {
  id: string;
  originalName: string;
  fileType: string;
  fileSizeBytes: number | null;
  status: string;
  smeScore: number | null;
  createdAt: string;
  updatedAt: string;
  durationSeconds: number | null;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-gray-100 text-gray-700" },
  uploading: { label: "Envoi...", className: "bg-blue-100 text-blue-700" },
  processing_stt: { label: "Transcription...", className: "bg-blue-100 text-blue-700" },
  processing_sme: { label: "Analyse...", className: "bg-blue-100 text-blue-700" },
  ready: { label: "Prêt", className: "bg-green-100 text-green-700" },
  failed: { label: "Erreur", className: "bg-red-100 text-red-700" },
  cancelled: { label: "Annulé", className: "bg-gray-100 text-gray-500" },
};

function FileTypeIcon({ type }: { type: string }) {
  if (type === "video" || type === "audio") {
    return <Film className="h-5 w-5 text-muted-foreground" />;
  }
  return <FileText className="h-5 w-5 text-muted-foreground" />;
}

export default function ProjectsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/files");
      if (!response.ok) {
        throw new Error("Erreur lors du chargement des fichiers");
      }
      const data = await response.json();
      setFiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      fetchFiles();
    }
  }, [status, router, fetchFiles]);

  const handleFileAccepted = async (accepted: AcceptedFile) => {
    setIsUploading(true);
    try {
      const fileType =
        accepted.type === "subtitle"
          ? accepted.file.name.endsWith(".vtt")
            ? "vtt"
            : "srt"
          : "video";

      const response = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: accepted.file.name,
          type: fileType,
          size: accepted.file.size,
          mimeType: accepted.file.type,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erreur lors de la création du fichier");
      }

      const { uploadUrl, fileId } = await response.json();

      // Upload to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: accepted.file,
        headers: { "Content-Type": accepted.file.type },
      });

      if (!uploadResponse.ok) {
        throw new Error("Erreur lors de l'envoi du fichier");
      }

      // Notify backend that upload is complete
      await fetch(`/api/files/${fileId}/confirm`, { method: "POST" });

      // Refresh file list
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileClick = (file: FileItem) => {
    if (file.status === "ready") {
      router.push(`/editor/${file.id}`);
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Mes fichiers</h1>
        <div className="flex items-center gap-3">
          <QuotaBadge />
          <Button variant="outline" onClick={() => router.push("/settings")}>
            Mon compte
          </Button>
        </div>
      </div>

      {/* Upload zone */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Nouveau fichier</CardTitle>
          <CardDescription>
            Importez un fichier SRT, VTT ou une vidéo pour analyser la conformité SME
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DropZone
            onFileAccepted={handleFileAccepted}
            state={isUploading ? "uploading" : "idle"}
            disabled={isUploading}
          />
        </CardContent>
      </Card>

      {/* Error message */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* File list */}
      {files.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              Aucun fichier pour le moment. Importez votre premier fichier ci-dessus.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {files.map((file) => {
            const statusInfo = STATUS_LABELS[file.status] || {
              label: file.status,
              className: "bg-gray-100 text-gray-700",
            };
            const isClickable = file.status === "ready";

            return (
              <Card
                key={file.id}
                className={cn(
                  "transition-colors",
                  isClickable && "cursor-pointer hover:border-primary/50"
                )}
                onClick={() => handleFileClick(file)}
              >
                <CardContent className="flex items-center gap-4 py-4">
                  <FileTypeIcon type={file.fileType} />

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.originalName}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{file.fileType.toUpperCase()}</span>
                      <span>{formatFileSize(file.fileSizeBytes)}</span>
                      {file.durationSeconds && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(file.durationSeconds)}
                        </span>
                      )}
                      <span>{formatDate(file.createdAt)}</span>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      statusInfo.className
                    )}
                  >
                    {statusInfo.label}
                  </span>

                  {file.status === "ready" && (
                    <ScoreBadge score={file.smeScore} size="sm" showDelta={false} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
