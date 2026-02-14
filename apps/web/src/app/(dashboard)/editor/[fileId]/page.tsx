"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSegmentsStore, useHistoryStore } from "@/stores";
import { useSegmentEdit, useUndoRedo, useCurrentSegment } from "@/hooks";
import { EditorHeader, SegmentList, VideoPlayer, SubtitleOverlay, ExportModal } from "@/components/editor";
import type { Alert, Segment } from "@sme-studio/db";

interface SegmentWithAlerts extends Segment {
  alerts: Alert[];
}

interface FileData {
  id: string;
  originalName: string;
  fileType: string;
  smeScore: number | null;
  videoUrl: string | null;
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
  const [isSplitting, setIsSplitting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Video playback state for subtitle synchronization
  const [currentTime, setCurrentTime] = useState(0);
  // Seek target for video when clicking on a segment
  const [seekToTime, setSeekToTime] = useState<number | null>(null);

  // Segment store
  const setSegments = useSegmentsStore((s) => s.setSegments);
  const segments = useSegmentsStore((s) => s.segments);
  const activeIndex = useSegmentsStore((s) => s.activeIndex);
  const setActiveIndex = useSegmentsStore((s) => s.setActiveIndex);
  const editingSegmentId = useSegmentsStore((s) => s.editingSegmentId);
  const updateSegment = useSegmentsStore((s) => s.updateSegment);
  const removeSegment = useSegmentsStore((s) => s.removeSegment);
  const clearSelection = useSegmentsStore((s) => s.clearSelection);
  const refreshAllAlerts = useSegmentsStore((s) => s.refreshAllAlerts);
  const insertSegmentAfter = useSegmentsStore((s) => s.insertSegmentAfter);
  const stopEditing = useSegmentsStore((s) => s.stopEditing);

  // Get current segment for subtitle overlay
  const currentSegment = useCurrentSegment(currentTime, segments);

  // History store
  const clearHistory = useHistoryStore((s) => s.clearHistory);

  // Segment edit hook with automatic score recalculation
  const {
    score,
    previousScore,
    isRecalculating,
    setInitialScore,
    scoreChanged,
    scoreDelta,
  } = useSegmentEdit({ fileId });

  // Undo/Redo hook
  const {
    undo,
    redo,
    recordSnapshot,
    canUndo,
    canRedo,
  } = useUndoRedo({ fileId });

  // Handle Ctrl+Z (undo) and Ctrl+Y (redo) keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      // Skip if focus is on an input, textarea, or contenteditable
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isInputFocused) return;

      // Ctrl+Z or Cmd+Z: Undo
      if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        if (canUndo) {
          await undo();
        }
        return;
      }

      // Ctrl+Y or Cmd+Y or Ctrl+Shift+Z: Redo
      if (
        ((event.ctrlKey || event.metaKey) && event.key === "y") ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "z")
      ) {
        event.preventDefault();
        if (canRedo) {
          await redo();
        }
        return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [undo, redo, canUndo, canRedo]);

  // Sync activeIndex with video playback (timeupdate → activeSegmentIndex)
  // Skip update while editing to avoid scroll disruption (Risk/Edge Case)
  useEffect(() => {
    if (editingSegmentId !== null) return; // Don't update during editing
    if (!segments.length) return;

    const currentTimeMs = currentTime * 1000;

    // Find the segment index that contains the current time
    const newActiveIndex = segments.findIndex(
      (seg) => currentTimeMs >= seg.startMs && currentTimeMs < seg.endMs
    );

    // Only update if we found a valid segment and it's different from current
    if (newActiveIndex !== -1 && newActiveIndex !== activeIndex) {
      setActiveIndex(newActiveIndex);
    }
  }, [currentTime, segments, activeIndex, setActiveIndex, editingSegmentId]);

  // Handle segment click → seek video to timecode
  const handleSegmentSeek = useCallback((index: number) => {
    const segment = segments[index];
    if (segment) {
      // Convert milliseconds to seconds for video player
      setSeekToTime(segment.startMs / 1000);
    }
  }, [segments]);

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

        // Clear history when loading a new file
        clearHistory(data.id);

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
  }, [fileId, setSegments, setInitialScore, clearHistory]);

  // Handle back navigation
  const handleBack = () => {
    router.push("/projects");
  };

  // Handle export
  const handleExport = () => {
    setIsExportModalOpen(true);
  };

  // Handle merge segments
  const handleMergeSegments = useCallback(
    async (segmentIds: string[]) => {
      if (segmentIds.length !== 2) return;

      try {
        setIsMerging(true);

        // Record snapshot for undo BEFORE the merge
        recordSnapshot();

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
    [fileId, updateSegment, removeSegment, clearSelection, refreshAllAlerts, recordSnapshot]
  );

  // Handle split segment
  const handleSplitSegment = useCallback(
    async (segmentId: string, cursorPosition: number) => {
      try {
        setIsSplitting(true);

        // Record snapshot for undo BEFORE the split
        recordSnapshot();

        const response = await fetch("/api/segments/split", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segmentId, cursorPosition }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to split segment");
        }

        const data = await response.json();

        // Update the store with the split result
        if (data.firstSegment && data.newSegment) {
          // Insert the new segment after the first and update the first segment
          insertSegmentAfter(segmentId, {
            ...data.newSegment,
            alerts: [],
          }, data.firstSegment);
        }

        // Stop editing mode
        stopEditing();

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
        console.error("Error splitting segment:", err);
        // Could show a toast notification here
      } finally {
        setIsSplitting(false);
      }
    },
    [fileId, insertSegmentAfter, stopEditing, refreshAllAlerts, recordSnapshot]
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

      <ExportModal
        open={isExportModalOpen}
        onOpenChange={setIsExportModalOpen}
        fileId={fileData.id}
        fileName={fileData.originalName}
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
            onSplitSegment={handleSplitSegment}
            isSplitting={isSplitting}
            onSegmentClick={handleSegmentSeek}
          />
        </div>

        {/* Video player panel */}
        <div className="w-[400px] border-l bg-muted/30 p-4">
          {/* Video with subtitle overlay */}
          <div className="relative">
            <VideoPlayer
              src={fileData.videoUrl}
              onTimeUpdate={setCurrentTime}
              seekTo={seekToTime}
            />
            {/* Subtitle overlay synchronized with video playback */}
            <SubtitleOverlay
              text={currentSegment?.text ?? null}
              speaker={currentSegment?.speaker}
            />
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
