'use client';

import { useEffect, useCallback, useReducer, useRef } from 'react';
import type { LiveFixtureData } from '@/lib/types';

const POLL_INTERVAL_MS = 15_000;
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'CANC', 'PST', 'SUSP'] as const;

type State = {
  data: LiveFixtureData | null;
  error: Error | null;
  lastUpdated: Date | null;
  isRefreshing: boolean;
};

type Action =
  | { type: 'RESET' }
  | { type: 'FETCHING' }
  | { type: 'SUCCESS'; payload: LiveFixtureData }
  | { type: 'ERROR'; payload: Error }
  | { type: 'DONE_REFRESHING' };

const initialState: State = {
  data: null,
  error: null,
  lastUpdated: null,
  isRefreshing: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'RESET':
      return initialState;
    case 'FETCHING':
      return { ...state, isRefreshing: true };
    case 'SUCCESS':
      return {
        ...state,
        data: action.payload,
        lastUpdated: new Date(),
        error: null,
        isRefreshing: false,
      };
    case 'ERROR':
      return { ...state, error: action.payload, isRefreshing: false };
    case 'DONE_REFRESHING':
      return { ...state, isRefreshing: false };
    default:
      return state;
  }
}

type Result = State & { refresh: () => Promise<void> };

export function useLiveFixture(fixtureId: number | null): Result {
  const [state, dispatch] = useReducer(reducer, initialState);
  const inFlightRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!fixtureId || inFlightRef.current) return;
    inFlightRef.current = true;
    dispatch({ type: 'FETCHING' });
    try {
      const res = await fetch(`/api/live/${fixtureId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as LiveFixtureData;
      dispatch({ type: 'SUCCESS', payload: json });
    } catch (err) {
      dispatch({ type: 'ERROR', payload: err as Error });
    } finally {
      inFlightRef.current = false;
    }
  }, [fixtureId]);

  useEffect(() => {
    dispatch({ type: 'RESET' });
    if (!fixtureId) return;
    void fetchData();
  }, [fixtureId, fetchData]);

  useEffect(() => {
    if (!fixtureId) return;
    const isFinished =
      state.data?.status &&
      (FINISHED_STATUSES as readonly string[]).includes(state.data.status);
    if (isFinished) return;

    const id = setInterval(() => void fetchData(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fixtureId, fetchData, state.data?.status]);

  return { ...state, refresh: fetchData };
}
