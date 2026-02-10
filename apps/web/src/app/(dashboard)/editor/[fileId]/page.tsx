"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSegmentsStore } from "@/stores";
import { useSegmentEdit } from "@/hooks";
import { EditorHeader, SegmentList } from "@/components/editor";
import type { Alert, Segment } from "@sme-studio/db";

interface SegmentWithAlerts extends Segment {
  alerts: Alert[];
}

interface FileData {
  id: string;
  originalName: string;
  smeScore: number | null;
  segments: SegmentWithAlerts[];
}

/**
 * Editor page for editing subtitles with real-time score recalculation
 *
 * Features:
 * - Real-time score updates after each edit (< 500ms)
 * - Debounced recalculation (300ms) to handle rapid edits
 * - Animated score badge showing delta changes
 * - Optimistic updates for immediate UI feedback
 */
export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.fileId as string;

  // Local state for file data
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  // Segment store
  const setSegments = useSegmentsStore((s) => s.setSegments);
  const updateSegment = useSegmentsStore((s) => s.updateSegment);
  const removeSegment = useSegmentsStore((s) => s.removeSegment);
  const clearSelection = useSegmentsStore((s) => s.clearSelection);
  const refreshAllAlerts = useSegmentsStore((s) => s.refreshAllAlerts);

  // Segment edit hook with automatic score recalculation
  const {
    score,
    previousScore,
    isRecalculating,
    setInitialScore,
    scoreChanged,
    scoreDelta,
  } = useSegmentEdit({ fileId });

  // Fetch file data on mount
  useEffect(() => {
    async function fetchFileData() {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch file with segments and alerts
        const response = await fetch(`/api/files/${fileId}`);
        if (!response.ok) {
          throw new Error("Failed to load file");
        }

        const data: FileData = await response.json();

        setFileData(data);
        setSegments(data.segments, data.id);

        // Set initial score for the hook
        if (data.smeScore !== null) {
          setInitialScore(data.smeScore);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    if (fileId) {
      fetchFileData();
    }
  }, [fileId, setSegments, setInitialScore]);

  // Handle back navigation
  const handleBack = () => {
    router.push("/projects");
  };

  // Handle export
  const handleExport = () => {
    // Will be implemented with export modal
    console.log("Export clicked");
  };

  // Handle merge segments
  const handleMergeSegments = useCallback(
    async (segmentIds: string[]) => {
      if (segmentIds.length !== 2) return;

      try {
        setIsMerging(true);

        const response = await fetch("/api/segments/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segmentIds }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to merge segments");
        }

        const data = await response.json();

        // Update the first segment in the store
        if (data.segment) {
          updateSegment(data.segment.id, data.segment);
        }

        // Remove the second segment from the store
        if (data.deletedSegmentId) {
          removeSegment(data.deletedSegmentId);
        }

        // Clear selection
        clearSelection();

        // Recalculate score and alerts
        const recalcResponse = await fetch(`/api/files/${fileId}/recalculate`, {
          method: "POST",
        });

        if (recalcResponse.ok) {
          const recalcData = await recalcResponse.json();
          if (recalcData.alerts) {
            refreshAllAlerts(recalcData.alerts);
          }
        }
      } catch (err) {
        console.error("Error merging segments:", err);
        // Could show a toast notification here
      } finally {
        setIsMerging(false);
      }
    },
    [fileId, updateSegment, removeSegment, clearSelection, refreshAllAlerts]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !fileData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-500">{error || "Fichier non trouvé"}</p>
          <button
            onClick={handleBack}
            className="mt-4 text-primary hover:underline"
          >
            Retour aux projets
          </button>
        </div>
      </div>
    );
  }

  // Use the recalculated score if available, otherwise use initial score
  const displayScore = score ?? fileData.smeScore;

  return (
    <div className="flex flex-col h-screen">
      {/* Header with score badge */}
      <EditorHeader
        fileName={fileData.originalName}
        score={displayScore}
        previousScore={previousScore}
        isRecalculating={isRecalculating}
        onBack={handleBack}
        onExport={handleExport}
      />

      {/* Score change notification (optional inline feedback) */}
      {scoreChanged && scoreDelta !== 0 && (
        <div
          className={`px-4 py-2 text-sm text-center transition-all duration-300 ${
            scoreDelta > 0
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {scoreDelta > 0
            ? `Score amélioré de ${scoreDelta} points`
            : `Score diminué de ${Math.abs(scoreDelta)} points`}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Segment list */}
        <div className="flex-1 overflow-hidden">
          <SegmentList
            onMergeSegments={handleMergeSegments}
            isMerging={isMerging}
          />
        </div>

        {/* Video player panel (placeholder) */}
        <div className="w-[400px] border-l bg-muted/30 p-4">
          <div className="aspect-video bg-black rounded-lg flex items-center justify-center text-white/50">
            Video Player
          </div>
          <div className="mt-4">
            <h3 className="font-medium">Segment actif</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Sélectionnez un segment pour voir les alertes et les détails.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
