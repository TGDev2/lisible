"use client";

import { useCallback } from "react";
import { useSegmentsStore, useHistoryStore } from "@/stores";
import type { Alert } from "@sme-studio/db";

interface UseUndoRedoOptions {
  /** File ID for recalculating score after undo/redo */
  fileId: string;
}

interface UseUndoRedoReturn {
  /** Perform undo operation */
  undo: () => Promise<boolean>;
  /** Perform redo operation */
  redo: () => Promise<boolean>;
  /** Record a snapshot before an operation (call BEFORE making changes) */
  recordSnapshot: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of actions that can be undone */
  undoCount: number;
  /** Number of actions that can be redone */
  redoCount: number;
}

/**
 * Hook for managing undo/redo operations on segments
 *
 * Features:
 * - Records snapshots before mutations
 * - Restores segments state on undo/redo
 * - Syncs with server after restoration
 * - Recalculates score after undo/redo
 *
 * Usage:
 * 1. Call recordSnapshot() BEFORE making any changes
 * 2. Call undo() to revert to the previous state
 * 3. Call redo() to restore a reverted state
 */
export function useUndoRedo({ fileId }: UseUndoRedoOptions): UseUndoRedoReturn {
  // Segment store
  const segments = useSegmentsStore((s) => s.segments);
  const activeIndex = useSegmentsStore((s) => s.activeIndex);
  const setSegments = useSegmentsStore((s) => s.setSegments);
  const setActiveIndex = useSegmentsStore((s) => s.setActiveIndex);
  const refreshAllAlerts = useSegmentsStore((s) => s.refreshAllAlerts);

  // History store
  const historyUndo = useHistoryStore((s) => s.undo);
  const historyRedo = useHistoryStore((s) => s.redo);
  const historyRecordSnapshot = useHistoryStore((s) => s.recordSnapshot);
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());
  const undoCount = useHistoryStore((s) => s.getUndoCount());
  const redoCount = useHistoryStore((s) => s.getRedoCount());

  /**
   * Record a snapshot of current state before a mutation
   * Call this BEFORE making any changes to segments
   */
  const recordSnapshot = useCallback(() => {
    historyRecordSnapshot(segments, activeIndex);
  }, [historyRecordSnapshot, segments, activeIndex]);

  /**
   * Sync segments state to the server after undo/redo
   */
  const syncToServer = useCallback(
    async (
      restoredSegments: typeof segments
    ): Promise<{ success: boolean; alerts?: Alert[] }> => {
      try {
        // Batch update all segments to the server
        const response = await fetch(`/api/files/${fileId}/segments/bulk`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            segments: restoredSegments.map((seg) => ({
              id: seg.id,
              text: seg.text,
              startMs: seg.startMs,
              endMs: seg.endMs,
              speaker: seg.speaker,
              isSoundInfo: seg.isSoundInfo,
              sequenceNum: seg.sequenceNum,
            })),
          }),
        });

        if (!response.ok) {
          console.error("Failed to sync undo/redo to server");
          return { success: false };
        }

        // Recalculate score and alerts
        const recalcResponse = await fetch(`/api/files/${fileId}/recalculate`, {
          method: "POST",
        });

        if (recalcResponse.ok) {
          const data = await recalcResponse.json();
          if (data.alerts) {
            refreshAllAlerts(data.alerts);
            return { success: true, alerts: data.alerts };
          }
        }

        return { success: true };
      } catch (error) {
        console.error("Error syncing undo/redo to server:", error);
        return { success: false };
      }
    },
    [fileId, refreshAllAlerts]
  );

  /**
   * Perform undo operation
   */
  const undo = useCallback(async (): Promise<boolean> => {
    const snapshot = historyUndo(segments, activeIndex);
    if (!snapshot) return false;

    // Restore the segments state from the snapshot
    setSegments(snapshot.segments, fileId);
    setActiveIndex(snapshot.activeIndex);

    // Sync to server
    const result = await syncToServer(snapshot.segments);
    return result.success;
  }, [
    historyUndo,
    segments,
    activeIndex,
    setSegments,
    setActiveIndex,
    fileId,
    syncToServer,
  ]);

  /**
   * Perform redo operation
   */
  const redo = useCallback(async (): Promise<boolean> => {
    const snapshot = historyRedo(segments, activeIndex);
    if (!snapshot) return false;

    // Restore the segments state from the snapshot
    setSegments(snapshot.segments, fileId);
    setActiveIndex(snapshot.activeIndex);

    // Sync to server
    const result = await syncToServer(snapshot.segments);
    return result.success;
  }, [
    historyRedo,
    segments,
    activeIndex,
    setSegments,
    setActiveIndex,
    fileId,
    syncToServer,
  ]);

  return {
    undo,
    redo,
    recordSnapshot,
    canUndo,
    canRedo,
    undoCount,
    redoCount,
  };
}
