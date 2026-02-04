"use client";

import { useCallback, useRef, useState } from "react";

export type UploadStatus =
  | "idle"
  | "uploading"
  | "confirming"
  | "success"
  | "error"
  | "cancelled";

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadState {
  status: UploadStatus;
  progress: UploadProgress;
  error: string | null;
  fileId: string | null;
  attempt: number;
}

export interface UploadResult {
  fileId: string;
  projectId: string;
}

interface UseFileUploadOptions {
  maxRetries?: number;
  baseDelay?: number; // Base delay for exponential backoff in ms
  onProgress?: (progress: UploadProgress) => void;
  onSuccess?: (result: UploadResult) => void;
  onError?: (error: string) => void;
}

interface UploadResponse {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
  projectId: string;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY = 1000; // 1 second

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, baseDelay: number): number {
  // 2^attempt * baseDelay with jitter
  const exponentialDelay = Math.pow(2, attempt) * baseDelay;
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return exponentialDelay + jitter;
}

/**
 * Check if error is retryable (network errors)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) {
    // Network errors in fetch/XHR
    return true;
  }
  if (error instanceof DOMException) {
    // AbortError is not retryable
    if (error.name === "AbortError") return false;
    // NetworkError is retryable
    if (error.name === "NetworkError") return true;
  }
  // XHR status codes that are retryable
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: number }).status;
    // 429 Too Many Requests, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
    return [0, 429, 502, 503, 504].includes(status);
  }
  return false;
}

/**
 * Upload file to presigned URL using XHR (for progress tracking)
 */
function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Handle abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        xhr.abort();
        reject(new DOMException("Upload cancelled", "AbortError"));
      });
    }

    // Track upload progress
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    });

    // Handle completion
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject({ status: xhr.status, message: `Upload failed: ${xhr.status}` });
      }
    });

    // Handle errors
    xhr.addEventListener("error", () => {
      reject(new TypeError("Network error during upload"));
    });

    xhr.addEventListener("timeout", () => {
      reject({ status: 0, message: "Upload timeout" });
    });

    // Configure and send
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.timeout = 10 * 60 * 1000; // 10 minutes timeout for large files
    xhr.send(file);
  });
}

/**
 * Hook for uploading files to S3 with progress tracking and automatic retry
 */
export function useFileUpload(options: UseFileUploadOptions = {}) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelay = DEFAULT_BASE_DELAY,
    onProgress,
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState<UploadState>({
    status: "idle",
    progress: { loaded: 0, total: 0, percent: 0 },
    error: null,
    fileId: null,
    attempt: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const savedProgressRef = useRef<UploadProgress | null>(null);

  /**
   * Request presigned URL from API
   */
  const requestPresignedUrl = useCallback(
    async (
      file: File,
      fileType: "srt" | "vtt" | "video" | "audio"
    ): Promise<UploadResponse> => {
      const response = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          type: fileType,
          size: file.size,
          mimeType: file.type,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to get upload URL: ${response.status}`);
      }

      return response.json();
    },
    []
  );

  /**
   * Confirm upload completion to API
   */
  const confirmUpload = useCallback(async (fileId: string): Promise<void> => {
    const response = await fetch(`/api/files/${fileId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Failed to confirm upload");
    }
  }, []);

  /**
   * Upload file with automatic retry
   */
  const upload = useCallback(
    async (
      file: File,
      fileType: "srt" | "vtt" | "video" | "audio"
    ): Promise<UploadResult | null> => {
      // Cancel any existing upload
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      let lastError: string = "";
      let uploadResponse: UploadResponse | null = null;

      // Reset state
      setState({
        status: "uploading",
        progress: savedProgressRef.current || { loaded: 0, total: 0, percent: 0 },
        error: null,
        fileId: null,
        attempt: 0,
      });

      // Retry loop
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal.aborted) {
          setState((prev) => ({ ...prev, status: "cancelled", error: null }));
          return null;
        }

        try {
          setState((prev) => ({ ...prev, attempt }));

          // Step 1: Get presigned URL (only on first attempt or if we don't have one)
          if (!uploadResponse) {
            uploadResponse = await requestPresignedUrl(file, fileType);
            setState((prev) => ({ ...prev, fileId: uploadResponse!.fileId }));
          }

          // Step 2: Upload file to S3
          await uploadWithProgress(
            uploadResponse.uploadUrl,
            file,
            (progress) => {
              savedProgressRef.current = progress;
              setState((prev) => ({ ...prev, progress }));
              onProgress?.(progress);
            },
            signal
          );

          // Step 3: Confirm upload
          setState((prev) => ({ ...prev, status: "confirming" }));
          await confirmUpload(uploadResponse.fileId);

          // Success!
          const result: UploadResult = {
            fileId: uploadResponse.fileId,
            projectId: uploadResponse.projectId,
          };

          setState((prev) => ({
            ...prev,
            status: "success",
            progress: { loaded: file.size, total: file.size, percent: 100 },
          }));

          savedProgressRef.current = null;
          onSuccess?.(result);
          return result;
        } catch (error) {
          if (signal.aborted) {
            setState((prev) => ({ ...prev, status: "cancelled" }));
            return null;
          }

          lastError = error instanceof Error ? error.message : "Upload failed";

          // Check if we should retry
          if (attempt < maxRetries && isRetryableError(error)) {
            const delay = getBackoffDelay(attempt, baseDelay);
            console.log(
              `Upload attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          // No more retries
          break;
        }
      }

      // All retries exhausted
      setState((prev) => ({
        ...prev,
        status: "error",
        error: lastError,
      }));
      onError?.(lastError);
      return null;
    },
    [maxRetries, baseDelay, onProgress, onSuccess, onError, requestPresignedUrl, confirmUpload]
  );

  /**
   * Cancel ongoing upload and cleanup server-side
   */
  const cancel = useCallback(async () => {
    // 1. Abort the XHR request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 2. Get current fileId before resetting state
    const currentFileId = state.fileId;

    // 3. Reset local state immediately for responsive UI
    savedProgressRef.current = null;
    setState({
      status: "cancelled",
      progress: { loaded: 0, total: 0, percent: 0 },
      error: null,
      fileId: null,
      attempt: 0,
    });

    // 4. Call API to cleanup server-side (S3 + DB)
    if (currentFileId) {
      try {
        await fetch(`/api/files/${currentFileId}`, {
          method: "DELETE",
        });
      } catch (error) {
        // Log error but don't fail - upload is already cancelled client-side
        console.warn("Failed to cleanup cancelled upload:", error);
      }
    }
  }, [state.fileId]);

  /**
   * Reset state to allow new upload
   */
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    savedProgressRef.current = null;
    setState({
      status: "idle",
      progress: { loaded: 0, total: 0, percent: 0 },
      error: null,
      fileId: null,
      attempt: 0,
    });
  }, []);

  /**
   * Retry last failed upload
   */
  const retry = useCallback(
    async (
      file: File,
      fileType: "srt" | "vtt" | "video" | "audio"
    ): Promise<UploadResult | null> => {
      return upload(file, fileType);
    },
    [upload]
  );

  return {
    ...state,
    upload,
    cancel,
    reset,
    retry,
    isUploading: state.status === "uploading" || state.status === "confirming",
    canRetry: state.status === "error",
  };
}
