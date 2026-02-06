"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FileStatusResponse, ProcessingStage } from "@/app/api/files/[id]/status/route";

export type { FileStatusResponse, ProcessingStage };

/**
 * Polling interval in milliseconds (2 seconds as per requirement)
 */
const POLLING_INTERVAL = 2000;

/**
 * Stages that indicate processing is complete (stop polling)
 */
const TERMINAL_STAGES: ProcessingStage[] = ["completed", "failed"];

export interface UseFileStatusOptions {
  /**
   * File ID to track
   */
  fileId: string | null;
  /**
   * Whether to enable polling (default: true when fileId is provided)
   */
  enabled?: boolean;
  /**
   * Polling interval in ms (default: 2000)
   */
  pollingInterval?: number;
  /**
   * Callback when processing completes
   */
  onComplete?: (status: FileStatusResponse) => void;
  /**
   * Callback when processing fails
   */
  onError?: (error: string) => void;
}

export interface UseFileStatusReturn {
  /**
   * Current file status
   */
  status: FileStatusResponse | null;
  /**
   * Whether the hook is currently fetching
   */
  isLoading: boolean;
  /**
   * Error message if fetch failed
   */
  error: string | null;
  /**
   * Whether processing is complete (success or failure)
   */
  isComplete: boolean;
  /**
   * Whether processing succeeded
   */
  isSuccess: boolean;
  /**
   * Whether processing failed
   */
  isFailed: boolean;
  /**
   * Whether currently processing (not complete)
   */
  isProcessing: boolean;
  /**
   * Manually refetch status
   */
  refetch: () => Promise<void>;
  /**
   * Stop polling
   */
  stopPolling: () => void;
  /**
   * Start polling
   */
  startPolling: () => void;
}

/**
 * Hook for tracking file processing status with automatic polling
 *
 * @example
 * ```tsx
 * const { status, isProcessing, isComplete } = useFileStatus({
 *   fileId: uploadedFileId,
 *   onComplete: (status) => console.log("Done!", status.smeScore),
 * });
 *
 * if (isProcessing) {
 *   return <ProgressSteps stage={status.stage} progress={status.progressPercent} />;
 * }
 * ```
 */
export function useFileStatus(options: UseFileStatusOptions): UseFileStatusReturn {
  const {
    fileId,
    enabled = true,
    pollingInterval = POLLING_INTERVAL,
    onComplete,
    onError,
  } = options;

  const [status, setStatus] = useState<FileStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(enabled);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  // Keep refs updated
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  /**
   * Fetch current status from API
   */
  const fetchStatus = useCallback(async () => {
    if (!fileId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/files/${fileId}/status`, {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch status: ${response.status}`);
      }

      const data: FileStatusResponse = await response.json();
      setStatus(data);

      // Check if processing is complete
      if (TERMINAL_STAGES.includes(data.stage)) {
        setIsPolling(false);

        if (data.stage === "completed") {
          onCompleteRef.current?.(data);
        } else if (data.stage === "failed") {
          onErrorRef.current?.(data.errorMessage || "Processing failed");
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch status";
      setError(errorMessage);
      onErrorRef.current?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [fileId]);

  /**
   * Start polling
   */
  const startPolling = useCallback(() => {
    setIsPolling(true);
  }, []);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Setup polling
  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Don't poll if disabled, no fileId, or already complete
    if (!enabled || !fileId || !isPolling) {
      return;
    }

    // If status is already terminal, don't start polling
    if (status && TERMINAL_STAGES.includes(status.stage)) {
      return;
    }

    // Initial fetch
    fetchStatus();

    // Setup interval
    intervalRef.current = setInterval(fetchStatus, pollingInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, fileId, isPolling, pollingInterval, fetchStatus, status?.stage]);

  // Reset state when fileId changes
  useEffect(() => {
    if (!fileId) {
      setStatus(null);
      setError(null);
      setIsPolling(enabled);
    }
  }, [fileId, enabled]);

  // Derived state
  const isComplete = status !== null && TERMINAL_STAGES.includes(status.stage);
  const isSuccess = status?.stage === "completed";
  const isFailed = status?.stage === "failed";
  const isProcessing = status !== null && !isComplete;

  return {
    status,
    isLoading,
    error,
    isComplete,
    isSuccess,
    isFailed,
    isProcessing,
    refetch: fetchStatus,
    stopPolling,
    startPolling,
  };
}
