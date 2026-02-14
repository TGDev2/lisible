"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SubtitleFormat = "srt" | "vtt";

type ExportStatus = "idle" | "generating" | "ready" | "error";

interface ExportModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onOpenChange: (open: boolean) => void;
  /** File ID to export */
  fileId: string;
  /** File name for display and download */
  fileName: string;
}

/**
 * Export Modal Component
 * Allows users to choose export format (SRT/VTT) and optionally generate PDF proof document
 * Supports combined ZIP download when PDF is included
 */
export function ExportModal({
  open,
  onOpenChange,
  fileId,
  fileName,
}: ExportModalProps) {
  // State
  const [format, setFormat] = useState<SubtitleFormat>("srt");
  const [includePdf, setIncludePdf] = useState(false);
  const [status, setStatus] = useState<ExportStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Get base filename without extension
  const baseName = fileName.replace(/\.[^/.]+$/, "");

  // Reset state when modal closes
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        // Reset on close, but only if not generating
        if (status !== "generating") {
          setStatus("idle");
          setError(null);
        }
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, status]
  );

  // Handle subtitle-only download
  const downloadSubtitle = useCallback(async () => {
    const url = `/api/files/${fileId}/export?format=${format}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [fileId, format, baseName]);

  // Helper to download file from URL
  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Poll PDF generation status
  const pollPdfStatus = useCallback(
    async (jobId: string) => {
      const maxAttempts = 150; // 5 minutes max
      const pollInterval = 2000; // 2 seconds

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        try {
          const response = await fetch(
            `/api/files/${fileId}/export-pdf/status?jobId=${jobId}`,
            { cache: "no-store" }
          );
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Erreur lors de la verification du statut");
          }

          if (data.status === "completed") {
            if (data.zipUrl) {
              downloadFile(data.zipUrl, `${baseName}_export.zip`);
            } else if (data.pdfUrl) {
              downloadFile(data.pdfUrl, `${baseName}_preuves.pdf`);
              setTimeout(() => downloadSubtitle(), 500);
            }
            setStatus("ready");
            setTimeout(() => handleOpenChange(false), 1500);
            return;
          }

          if (data.status === "failed") {
            throw new Error(data.error || "La generation du PDF a echoue");
          }

          if (data.status === "unknown") {
            throw new Error(data.error || "Job d'export introuvable");
          }

          if (!["processing", "waiting", "active"].includes(data.status)) {
            throw new Error(data.error || "Statut d'export inattendu");
          }
        } catch (err) {
          console.error("Polling error:", err);
          throw err;
        }
      }

      throw new Error("Delai depasse pour la generation du PDF");
    },
    [fileId, baseName, downloadSubtitle, handleOpenChange]
  );

  // Handle export with optional PDF
  const handleExport = useCallback(async () => {
    setError(null);

    // If no PDF, just download subtitle directly
    if (!includePdf) {
      downloadSubtitle();
      handleOpenChange(false);
      return;
    }

    // With PDF: trigger async generation
    setStatus("generating");

    try {
      const response = await fetch(`/api/files/${fileId}/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtitleFormat: format }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la generation");
      }

      const data = await response.json();

      // Poll for PDF status if needed
      if (data.status === "processing") {
        await pollPdfStatus(data.jobId);
      } else if (data.zipUrl) {
        // Direct download ZIP
        downloadFile(data.zipUrl, `${baseName}_export.zip`);
        setStatus("ready");
        setTimeout(() => handleOpenChange(false), 1500);
      } else if (data.pdfUrl) {
        // Download both files separately
        downloadFile(data.pdfUrl, `${baseName}_preuves.pdf`);
        setTimeout(() => downloadSubtitle(), 500);
        setStatus("ready");
        setTimeout(() => handleOpenChange(false), 1500);
      }
    } catch (err) {
      console.error("Export error:", err);
      setError(err instanceof Error ? err.message : "Erreur lors de l'export");
      setStatus("error");
    }
  }, [fileId, format, includePdf, baseName, downloadSubtitle, handleOpenChange, pollPdfStatus]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exporter</DialogTitle>
          <DialogDescription>
            Telechargez vos sous-titres et le dossier de preuves PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Format selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Format sous-titres</Label>
            <div className="space-y-2">
              <label
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  format === "srt"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/50"
                )}
              >
                <input
                  type="radio"
                  name="format"
                  value="srt"
                  checked={format === "srt"}
                  onChange={() => setFormat("srt")}
                  className="sr-only"
                  disabled={status === "generating"}
                />
                <div
                  className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                    format === "srt" ? "border-primary" : "border-muted-foreground/50"
                  )}
                >
                  {format === "srt" && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
                <div>
                  <div className="font-medium">SRT</div>
                  <div className="text-sm text-muted-foreground">
                    Format standard, compatible avec la plupart des lecteurs
                  </div>
                </div>
              </label>

              <label
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  format === "vtt"
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/50"
                )}
              >
                <input
                  type="radio"
                  name="format"
                  value="vtt"
                  checked={format === "vtt"}
                  onChange={() => setFormat("vtt")}
                  className="sr-only"
                  disabled={status === "generating"}
                />
                <div
                  className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                    format === "vtt" ? "border-primary" : "border-muted-foreground/50"
                  )}
                >
                  {format === "vtt" && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
                <div>
                  <div className="font-medium">VTT</div>
                  <div className="text-sm text-muted-foreground">
                    Format web, ideal pour les videos HTML5
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* PDF option */}
          <div className="space-y-3">
            <label
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                includePdf
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/50"
              )}
            >
              <Checkbox
                checked={includePdf}
                onCheckedChange={(checked) => setIncludePdf(checked === true)}
                disabled={status === "generating"}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="font-medium">
                  Generer le dossier de preuves PDF
                </div>
                <div className="text-sm text-muted-foreground">
                  Document avec score SME, alertes et metadonnees pour votre client
                </div>
              </div>
            </label>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Success message */}
          {status === "ready" && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
              Export reussi. Telechargement en cours...
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={status === "generating"}
          >
            Annuler
          </Button>
          <Button onClick={handleExport} disabled={status === "generating"}>
            {status === "generating" ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Generation en cours...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Telecharger
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
