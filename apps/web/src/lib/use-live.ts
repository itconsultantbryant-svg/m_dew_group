'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface LiveState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Epoch ms of the last successful fetch, or null before the first success. */
  updatedAt: number | null;
  /** Whether automatic polling is currently enabled. */
  live: boolean;
  setLive: (value: boolean) => void;
  refresh: () => Promise<void>;
}

/**
 * Polls an async fetcher on an interval to keep a screen "live". The latest
 * fetcher is always used (kept in a ref) so callers can close over fresh query
 * parameters without restarting the interval.
 */
export function useLive<T>(fetcher: () => Promise<T>, intervalMs = 8000): LiveState<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [live, setLive] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await fetcherRef.current();
      setData(result);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh data.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [live, intervalMs, refresh]);

  useEffect(() => {
    if (!live) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [live, refresh]);

  return { data, error, loading, updatedAt, live, setLive, refresh };
}

/** Human-friendly "x seconds ago" that ticks without needing a re-render source. */
export function useRelativeTime(timestamp: number | null): string {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!timestamp) return 'waiting…';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}
