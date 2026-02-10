"use client";

import { useCallback, useRef, useState } from "react";
import { useSegmentsStore } from "@/stores";
import type { Segment } from "@sme-studio/db";

export type MutationStatus = "idle" | "pending" | "success" | "error";

interface MutationState {
  status: MutationStatus;
  error: string | null;
}

interface UpdateSegmentParams {
  text?: string;
  startMs?: number;
  endMs?: number;
  speaker?: string | null;
  isSoundInfo?: boolean;
}

/**
 * Hook for updating segments with optimistic updates and rollback
 */
export function useSegmentMutation() {
  const [state, setState] = useState<MutationState>({
    status: "idle",
    error: null,
  });

  const updateSegment = useSegmentsStore((s) => s.updateSegment);
  const getSegmentById = useSegmentsStore((s) => s.getSegmentById);

  // Track pending mutations for debouncing
  const pendingMutationsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Store original values for rollback
  const originalValuesRef = useRef<Map<string, Partial<Segment>>>(new Map());

  /**
   * Persist update to the API
   */
  const persistUpdate = useCallback(
    async (segmentId: string, updates: UpdateSegmentParams): Promise<boolean> => {
      setState({ status: "pending", error: null });

      try {
        const response = await fetch(`/api/segments/${segmentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Failed to update segment: ${response.status}`);
        }

        // Clear stored original value on success
        originalValuesRef.current.delete(segmentId);

        setState({ status: "success", error: null });
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to update segment";

        // Rollback to original values
        const originalValues = originalValuesRef.current.get(segmentId);
        if (originalValues) {
          updateSegment(segmentId, originalValues);
          originalValuesRef.current.delete(segmentId);
        }

        setState({ status: "error", error: errorMessage });
        return false;
      }
    },
    [updateSegment]
  );

  /**
   * Update a segment optimistically with API persistence
   * @param segmentId - The segment ID to update
   * @param updates - The updates to apply
   * @param options - Options for debouncing
   */
  const mutateSegment = useCallback(
    async (
      segmentId: string,
      updates: UpdateSegmentParams,
      options: { debounceMs?: number } = {}
    ): Promise<boolean> => {
      const { debounceMs = 0 } = options;

      // Clear any pending debounced mutation for this segment
      const existingTimeout = pendingMutationsRef.current.get(segmentId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        pendingMutationsRef.current.delete(segmentId);
      }

      // Store original values for potential rollback (only if not already stored)
      if (!originalValuesRef.current.has(segmentId)) {
        const segment = getSegmentById(segmentId);
        if (segment) {
          originalValuesRef.current.set(segmentId, {
            text: segment.text,
            startMs: segment.startMs,
            endMs: segment.endMs,
            speaker: segment.speaker,
            isSoundInfo: segment.isSoundInfo,
          });
        }
      }

      // Apply optimistic update immediately
      updateSegment(segmentId, updates);

      // If debouncing, delay the API call
      if (debounceMs > 0) {
        return new Promise((resolve) => {
          const timeout = setTimeout(async () => {
            pendingMutationsRef.current.delete(segmentId);
            const success = await persistUpdate(segmentId, updates);
            resolve(success);
          }, debounceMs);

          pendingMutationsRef.current.set(segmentId, timeout);
        });
      }

      // Persist immediately
      return persistUpdate(segmentId, updates);
    },
    [updateSegment, getSegmentById, persistUpdate]
  );

  /**
   * Rollback a segment to its original state (before any optimistic updates)
   */
  const rollback = useCallback(
    (segmentId: string) => {
      // Clear any pending mutation
      const existingTimeout = pendingMutationsRef.current.get(segmentId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        pendingMutationsRef.current.delete(segmentId);
      }

      // Restore original values
      const originalValues = originalValuesRef.current.get(segmentId);
      if (originalValues) {
        updateSegment(segmentId, originalValues);
        originalValuesRef.current.delete(segmentId);
      }
    },
    [updateSegment]
  );

  /**
   * Reset mutation state
   */
  const reset = useCallback(() => {
    setState({ status: "idle", error: null });
  }, []);

  return {
    ...state,
    mutateSegment,
    rollback,
    reset,
    isPending: state.status === "pending",
    isError: state.status === "error",
    isSuccess: state.status === "success",
  };
}
