'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { LiveFixtureData } from '@/lib/types';

const POLL_INTERVAL_MS = 15_000;
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'CANC', 'PST', 'SUSP'] as const;

type Result = {
  data: LiveFixtureData | null;
  error: Error | null;
  lastUpdated: Date | null;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
};

export function useLiveFixture(fixtureId: number | null): Result {
  const [data, setData] = useState<LiveFixtureData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const inFlightRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!fixtureId || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/live/${fixtureId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as LiveFixtureData;
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      inFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [fixtureId]);

  useEffect(() => {
    setData(null);
    setError(null);
    setLastUpdated(null);
    if (!fixtureId) return;
    fetchData();
  }, [fixtureId, fetchData]);

  useEffect(() => {
    if (!fixtureId) return;
    const isFinished =
      data?.status && (FINISHED_STATUSES as readonly string[]).includes(data.status);
    if (isFinished) return;

    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fixtureId, fetchData, data?.status]);

  return { data, error, lastUpdated, isRefreshing, refresh: fetchData };
}
