"use client";

import { useState, useCallback, useRef } from "react";
import { DropZone, type AcceptedFile } from "@/components/upload/DropZone";
import { ProgressBar } from "@/components/upload/ProgressBar";
import { ScoreBadge } from "@/components/shared/ScoreBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, RotateCcw, AlertTriangle } from "lucide-react";

interface DiagnosticResult {
  fileId: string;
  temporaryToken: string;
  score: number;
  breakdown: {
    totalAlerts: number;
    bySeverity: { critical: number; warning: number; info: number };
    byRule: Record<string, { count: number; penalty: number }>;
    totalPenalty: number;
  };
  fileName: string;
  format: string;
  segmentCount: number;
}

type PageState = "idle" | "uploading" | "result" | "error";

export default function DiagnosePage() {
  const [state, setState] = useState<PageState>("idle");
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const handleFileAccepted = useCallback(
    async (acceptedFile: AcceptedFile) => {
      if (acceptedFile.type !== "subtitle") {
        setError("Formats acceptés : SRT, VTT");
        setState("error");
        return;
      }

      setState("uploading");
      setError(null);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append("file", acceptedFile.file);

      // Use XMLHttpRequest for upload progress tracking
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      });

      xhr.addEventListener("load", () => {
        xhrRef.current = null;
        try {
          const data = JSON.parse(xhr.responseText);

          if (xhr.status !== 200) {
            setError(data.error || "Une erreur est survenue.");
            setState("error");
            return;
          }

          setResult(data as DiagnosticResult);
          setState("result");
        } catch {
          setError("Erreur lors de la lecture de la réponse.");
          setState("error");
        }
      });

      xhr.addEventListener("error", () => {
        xhrRef.current = null;
        setError("Erreur de connexion. Veuillez réessayer.");
        setState("error");
      });

      xhr.open("POST", "/api/diagnostic/upload");
      xhr.send(formData);
    },
    []
  );

  const handleCancel = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setState("idle");
    setError(null);
    setUploadProgress(0);
  }, []);

  const handleReset = useCallback(() => {
    setState("idle");
    setResult(null);
    setError(null);
    setUploadProgress(0);
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted">
      <section className="container mx-auto px-4 py-12 md:py-20">
        <div className="mx-auto max-w-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl mb-3">
              Diagnostic SME instantané
            </h1>
            <p className="text-muted-foreground">
              Déposez un fichier SRT ou VTT et obtenez votre score de conformité
              en quelques secondes.
            </p>
          </div>

          {/* DropZone (idle state) */}
          {state === "idle" && (
            <DropZone
              onFileAccepted={handleFileAccepted}
              subtitleOnly
            />
          )}

          {/* Upload + Analysis in progress */}
          {state === "uploading" && (
            <Card>
              <CardContent className="flex flex-col items-center gap-6 py-12">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <div className="w-full max-w-xs space-y-3">
                  <p className="text-sm font-medium text-center">
                    {uploadProgress < 100
                      ? "Envoi en cours..."
                      : "Analyse en cours..."}
                  </p>
                  <ProgressBar
                    value={uploadProgress}
                    showValue
                    size="md"
                    animated
                  />
                </div>
                <Button
                  onClick={handleCancel}
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                >
                  Annuler
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Result */}
          {state === "result" && result && (
            <div className="space-y-6">
              <Card>
                <CardHeader className="text-center">
                  <CardTitle>Résultat du diagnostic</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {result.fileName}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-6">
                  <ScoreBadge
                    score={result.score}
                    size="lg"
                    showDelta={false}
                  />

                  {/* Alerts breakdown by severity */}
                  <div className="w-full grid grid-cols-3 gap-4 text-center">
                    <div className="rounded-lg bg-red-50 p-3">
                      <p className="text-2xl font-bold text-red-700">
                        {result.breakdown.bySeverity.critical}
                      </p>
                      <p className="text-xs text-red-600">Critiques</p>
                    </div>
                    <div className="rounded-lg bg-yellow-50 p-3">
                      <p className="text-2xl font-bold text-yellow-700">
                        {result.breakdown.bySeverity.warning}
                      </p>
                      <p className="text-xs text-yellow-600">Avertissements</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-3">
                      <p className="text-2xl font-bold text-blue-700">
                        {result.breakdown.bySeverity.info}
                      </p>
                      <p className="text-xs text-blue-600">Informations</p>
                    </div>
                  </div>

                  {/* File stats */}
                  <p className="text-sm text-muted-foreground text-center">
                    {result.segmentCount} segments analysés — Format{" "}
                    {result.format.toUpperCase()}
                  </p>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex flex-col items-center gap-3">
                <Button onClick={handleReset} variant="outline">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Nouveau diagnostic
                </Button>
                <p className="text-xs text-muted-foreground text-center max-w-sm">
                  Inscrivez-vous pour accéder au détail des alertes, à
                  l&apos;éditeur de correction et au dossier de preuves PDF.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-12">
                <AlertTriangle className="h-10 w-10 text-destructive" />
                <div className="text-center">
                  <p className="font-medium text-destructive">Erreur</p>
                  <p className="text-sm text-muted-foreground mt-1">{error}</p>
                </div>
                <Button onClick={handleReset} variant="outline" size="sm">
                  Réessayer
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}
