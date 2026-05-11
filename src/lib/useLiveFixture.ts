'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveFixtureData } from '@/lib/types';

const POLL_INTERVAL_MS = 15_000;

/** API-Football statuses that mean the match is definitively over. */
const ENDED_STATUSES = new Set(['FT', 'AET', 'PEN', 'CANC', 'PST', 'SUSP', 'ABD', 'AWD', 'WO']);

interface UseLiveFixtureResult {
  data: LiveFixtureData | null;
  error: boolean;
  lastUpdated: Date | null;
  isRefreshing: boolean;
  refresh: () => void;
}

/**
 * Polls /api/live/[fixtureId] every 15 seconds.
 * Stops automatically when the match ends (status in ENDED_STATUSES).
 * Deduplicates overlapping requests with an in-flight ref.
 * On error, keeps stale data and sets error=true.
 */
export function useLiveFixture(fixtureId: number | null): UseLiveFixtureResult {
  const [data, setData] = useState<LiveFixtureData | null>(null);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const inFlightRef = useRef(false);
  const stoppedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (fixtureId === null || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsRefreshing(true);

    try {
      const res = await fetch(`/api/live/${fixtureId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: LiveFixtureData = await res.json();
      setData(json);
      setError(false);
      setLastUpdated(new Date());

      if (ENDED_STATUSES.has(json.status)) {
        stoppedRef.current = true;
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch {
      setError(true);
    } finally {
      inFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [fixtureId]);

  useEffect(() => {
    if (fixtureId === null) return;
    stoppedRef.current = false;

    void fetchData();

    intervalRef.current = setInterval(() => {
      if (!stoppedRef.current) void fetchData();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fixtureId, fetchData]);

  const refresh = useCallback(() => {
    if (!stoppedRef.current) void fetchData();
  }, [fetchData]);

  return { data, error, lastUpdated, isRefreshing, refresh };
}
