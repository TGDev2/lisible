"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface QuotaCredits {
  total: number;
  used: number;
  available: number;
  rollover: number;
  percentUsed: number;
}

export interface QuotaData {
  plan: string;
  credits: QuotaCredits;
  resetAt: string | null;
}

export interface UseQuotaReturn {
  quota: QuotaData | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Cache duration : 60 seconds */
const CACHE_TTL_MS = 60_000;

let cachedQuota: QuotaData | null = null;
let cacheTimestamp = 0;

export function useQuota(): UseQuotaReturn {
  const [quota, setQuota] = useState<QuotaData | null>(cachedQuota);
  const [isLoading, setIsLoading] = useState(cachedQuota === null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchQuota = useCallback(async (force = false) => {
    // Serve from cache if still fresh
    const now = Date.now();
    if (!force && cachedQuota && now - cacheTimestamp < CACHE_TTL_MS) {
      setQuota(cachedQuota);
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/user/quota", {
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        throw new Error("Impossible de charger le quota");
      }

      const data: QuotaData = await res.json();

      cachedQuota = data;
      cacheTimestamp = Date.now();

      setQuota(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuota();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchQuota]);

  const refresh = useCallback(() => fetchQuota(true), [fetchQuota]);

  return { quota, isLoading, error, refresh };
}
