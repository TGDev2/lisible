"use client";

import { useCallback, useRef } from "react";
import { useSegmentMutation } from "./useSegmentMutation";
import { useScoreRecalculation } from "./useScoreRecalculation";
import type { Segment } from "@sme-studio/db";

interface UseSegmentEditOptions {
  /** File ID for score recalculation */
  fileId: string | null;
  /** Debounce delay for text edits (default: 300ms) */
  textDebounceMs?: number;
  /** Whether to trigger recalculation after save (default: true) */
  autoRecalculate?: boolean;
}

interface UpdateSegmentParams {
  text?: string;
  startMs?: number;
  endMs?: number;
  speaker?: string | null;
  isSoundInfo?: boolean;
}

/**
 * Combined hook for segment editing with automatic score recalculation
 *
 * This hook provides:
 * - Optimistic updates for immediate UI feedback
 * - Debounced API persistence for text edits
 * - Automatic score recalculation after saves (with 300ms debounce)
 * - Rollback on error
 *
 * Usage:
 * ```tsx
 * const { editSegment, score, isRecalculating } = useSegmentEdit({ fileId });
 *
 * // Edit text (debounced)
 * editSegment(segmentId, { text: "New text" });
 *
 * // Edit timecodes (immediate save, triggers recalculation)
 * editSegment(segmentId, { startMs: 1000, endMs: 2000 });
 * ```
 */
export function useSegmentEdit(options: UseSegmentEditOptions) {
  const { fileId, textDebounceMs = 300, autoRecalculate = true } = options;

  // Mutation hook for segment updates
  const {
    mutateSegment,
    rollback,
    status: mutationStatus,
    error: mutationError,
    isPending: isSaving,
  } = useSegmentMutation();

  // Score recalculation hook
  const {
    score,
    previousScore,
    triggerRecalculation,
    forceRecalculation,
    setInitialScore,
    isPending: isRecalculating,
    scoreChanged,
    scoreIncreased,
    scoreDecreased,
    scoreDelta,
  } = useScoreRecalculation(fileId);

  // Track which segments have pending text edits
  const pendingTextEditsRef = useRef<Set<string>>(new Set());

  /**
   * Edit a segment with optimistic update and automatic recalculation
   */
  const editSegment = useCallback(
    async (
      segmentId: string,
      updates: UpdateSegmentParams
    ): Promise<boolean> => {
      const isTextEdit = "text" in updates;
      const isTimecodeEdit = "startMs" in updates || "endMs" in updates;

      // Track text edits for debouncing
      if (isTextEdit) {
        pendingTextEditsRef.current.add(segmentId);
      }

      // Apply optimistic update and persist
      const success = await mutateSegment(segmentId, updates, {
        // Debounce text edits, but save timecodes immediately
        debounceMs: isTextEdit ? textDebounceMs : 0,
      });

      // Remove from pending text edits
      if (isTextEdit) {
        pendingTextEditsRef.current.delete(segmentId);
      }

      // Trigger score recalculation after successful save
      if (success && autoRecalculate) {
        // Timecode changes always need recalculation (affects speed, duration, overlap)
        // Text changes only affect length and speed rules
        triggerRecalculation();
      }

      return success;
    },
    [mutateSegment, triggerRecalculation, autoRecalculate, textDebounceMs]
  );

  /**
   * Edit segment text specifically (convenience method)
   */
  const editText = useCallback(
    (segmentId: string, text: string) => {
      return editSegment(segmentId, { text });
    },
    [editSegment]
  );

  /**
   * Edit segment timecodes specifically (convenience method)
   */
  const editTimecodes = useCallback(
    (segmentId: string, startMs: number, endMs: number) => {
      return editSegment(segmentId, { startMs, endMs });
    },
    [editSegment]
  );

  /**
   * Edit segment speaker (convenience method)
   */
  const editSpeaker = useCallback(
    (segmentId: string, speaker: string | null) => {
      return editSegment(segmentId, { speaker });
    },
    [editSegment]
  );

  /**
   * Mark segment as sound info (convenience method)
   */
  const setSoundInfo = useCallback(
    (segmentId: string, isSoundInfo: boolean) => {
      return editSegment(segmentId, { isSoundInfo });
    },
    [editSegment]
  );

  /**
   * Cancel editing and rollback changes for a segment
   */
  const cancelEdit = useCallback(
    (segmentId: string) => {
      pendingTextEditsRef.current.delete(segmentId);
      rollback(segmentId);
    },
    [rollback]
  );

  /**
   * Check if there are pending edits for a segment
   */
  const hasPendingEdit = useCallback((segmentId: string) => {
    return pendingTextEditsRef.current.has(segmentId);
  }, []);

  return {
    // Edit actions
    editSegment,
    editText,
    editTimecodes,
    editSpeaker,
    setSoundInfo,
    cancelEdit,
    hasPendingEdit,

    // Score state
    score,
    previousScore,
    forceRecalculation,
    setInitialScore,

    // Status
    isSaving,
    isRecalculating,
    mutationStatus,
    mutationError,

    // Animation helpers
    scoreChanged,
    scoreIncreased,
    scoreDecreased,
    scoreDelta,
  };
}
