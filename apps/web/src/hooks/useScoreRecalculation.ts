"use client";

import { useCallback, useRef, useState } from "react";
import { useSegmentsStore } from "@/stores";
import type { Alert } from "@sme-studio/db";

export interface RecalculationResult {
  success: boolean;
  score: number;
  breakdown?: {
    totalAlerts: number;
    bySeverity: Record<string, number>;
    byRule: Record<string, number>;
    penalties: number;
  };
  alerts: Alert[];
}

export type RecalculationStatus = "idle" | "pending" | "success" | "error";

interface RecalculationState {
  status: RecalculationStatus;
  score: number | null;
  previousScore: number | null;
  error: string | null;
}

const DEBOUNCE_MS = 300;

/**
 * Hook for recalculating SME score with debounce
 * Triggers recalculation after segment edits with 300ms debounce
 * to avoid excessive API calls during rapid editing
 */
export function useScoreRecalculation(fileId: string | null) {
  const [state, setState] = useState<RecalculationState>({
    status: "idle",
    score: null,
    previousScore: null,
    error: null,
  });

  const refreshAllAlerts = useSegmentsStore((s) => s.refreshAllAlerts);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // AbortController for cancelling in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Execute the recalculation API call
   */
  const executeRecalculation = useCallback(
    async (targetFileId: string): Promise<RecalculationResult | null> => {
      // Store previous score for animation using functional update
      setState((prev) => ({
        ...prev,
        status: "pending",
        previousScore: prev.score,
        error: null,
      }));

      // Create new AbortController for this request
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`/api/files/${targetFileId}/recalculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Recalculation failed: ${response.status}`);
        }

        const result: RecalculationResult = await response.json();

        // Update store with new alerts
        refreshAllAlerts(result.alerts);

        // Update state with new score using functional update
        setState((prev) => ({
          status: "success",
          score: result.score,
          previousScore: prev.score,
          error: null,
        }));

        return result;
      } catch (error) {
        // Ignore abort errors (these are intentional)
        if (error instanceof Error && error.name === "AbortError") {
          return null;
        }

        const errorMessage = error instanceof Error ? error.message : "Recalculation failed";
        setState((prev) => ({
          ...prev,
          status: "error",
          error: errorMessage,
        }));

        return null;
      }
    },
    [refreshAllAlerts]
  );

  /**
   * Trigger a score recalculation with debounce
   * Multiple calls within 300ms will only trigger one API call
   */
  const triggerRecalculation = useCallback(() => {
    if (!fileId) return;

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Debounce the recalculation
    debounceTimerRef.current = setTimeout(() => {
      executeRecalculation(fileId);
    }, DEBOUNCE_MS);
  }, [fileId, executeRecalculation]);

  /**
   * Force immediate recalculation (bypasses debounce)
   */
  const forceRecalculation = useCallback(async () => {
    if (!fileId) return null;

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    return executeRecalculation(fileId);
  }, [fileId, executeRecalculation]);

  /**
   * Cancel any pending recalculation
   */
  const cancelRecalculation = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * Set the initial score (from file data on page load)
   */
  const setInitialScore = useCallback((score: number) => {
    setState({
      status: "idle",
      score,
      previousScore: null,
      error: null,
    });
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    cancelRecalculation();
    setState({
      status: "idle",
      score: null,
      previousScore: null,
      error: null,
    });
  }, [cancelRecalculation]);

  // Derived values for animation
  const scoreChanged = state.previousScore !== null && state.score !== state.previousScore;
  const scoreIncreased = scoreChanged && state.score !== null && state.previousScore !== null && state.score > state.previousScore;
  const scoreDecreased = scoreChanged && state.score !== null && state.previousScore !== null && state.score < state.previousScore;

  return {
    ...state,
    triggerRecalculation,
    forceRecalculation,
    cancelRecalculation,
    setInitialScore,
    reset,
    // Status helpers
    isPending: state.status === "pending",
    isError: state.status === "error",
    isSuccess: state.status === "success",
    // Animation helpers
    scoreChanged,
    scoreIncreased,
    scoreDecreased,
    scoreDelta: state.score !== null && state.previousScore !== null
      ? state.score - state.previousScore
      : 0,
  };
}
