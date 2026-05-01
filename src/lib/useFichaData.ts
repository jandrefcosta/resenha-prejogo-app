'use client';

import { useEffect, useRef, useState } from 'react';
import { LIVE_WINDOW_MS } from '@/lib/matchConstants';
import type { Match, H2HData, MatchEventsData, LineupData, CbfMatchDetail } from '@/lib/types';
import type { CbfMatchDocsResult } from '@/lib/cbfDocTypes';

export type FetchStatus = 'idle' | 'loading' | 'done' | 'not_found' | 'error';

export interface FichaData {
  fichaData: CbfMatchDetail | null;
  fichaStatus: FetchStatus;
  lineupData: LineupData | null;
  lineupStatus: FetchStatus;
  eventsData: MatchEventsData | null;
  eventsStatus: FetchStatus;
  matchDocs: CbfMatchDocsResult | null;
  matchDocsLoading: boolean;
  openFichaModal: () => void;
  retryFicha: () => void;
}

interface UseFichaDataParams {
  match: Match;
  activeModal: string | null;
  // h2h state lives in MatchCard (shared with H2H modal) — passed in so openFichaModal can trigger it
  h2hStatus: FetchStatus;
  setH2hStatus: (s: FetchStatus) => void;
  setH2hData: (d: H2HData) => void;
  prefetchedMatchDocs?: CbfMatchDocsResult;
  cbfMatchDetail?: CbfMatchDetail;
}

export function useFichaData({
  match,
  activeModal,
  h2hStatus,
  setH2hStatus,
  setH2hData,
  prefetchedMatchDocs,
  cbfMatchDetail,
}: UseFichaDataParams): FichaData {
  const [fichaData, setFichaData] = useState<CbfMatchDetail | null>(cbfMatchDetail ?? null);
  const [fichaStatus, setFichaStatus] = useState<FetchStatus>(cbfMatchDetail ? 'done' : 'idle');
  const [lineupData, setLineupData] = useState<LineupData | null>(null);
  const [lineupStatus, setLineupStatus] = useState<FetchStatus>('idle');
  const [eventsData, setEventsData] = useState<MatchEventsData | null>(null);
  const [eventsStatus, setEventsStatus] = useState<FetchStatus>('idle');
  const [matchDocs, setMatchDocs] = useState<CbfMatchDocsResult | null>(null);
  const [matchDocsLoading, setMatchDocsLoading] = useState(false);

  // Tracks which fetches are currently in-flight using synchronous refs.
  // Avoids double-fetch on rapid calls (e.g. double-click) where React state
  // updates would still appear stale inside the closure.
  const inFlight = useRef<Set<'h2h' | 'lineups' | 'events' | 'cbf'>>(new Set());

  // Seed matchDocs from prefetch when it arrives (enables renda on card face)
  useEffect(() => {
    if (prefetchedMatchDocs != null && matchDocs === null && !matchDocsLoading) {
      setMatchDocs(prefetchedMatchDocs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetchedMatchDocs]);

  // Fetch official match documents (boletim + súmula) for finished AND live Série A matches.
  // For live matches this is usually a no-op (súmula not yet published), but enables
  // instant escalação display when the match transitions live → encerrado.
  useEffect(() => {
    if (activeModal !== 'ficha') return;
    if (match.leagueId !== 71) return;

    // Recompute time fresh inside the effect to avoid stale closure from render time
    const nowFresh = Date.now();
    const kickoffFresh = new Date(match.date).getTime();
    const hoursUntilFresh = (kickoffFresh - nowFresh) / 3_600_000;
    const isPostMatchFresh = hoursUntilFresh < -(LIVE_WINDOW_MS / 3_600_000);
    const liveFresh = match.status !== 'postponed' && nowFresh >= kickoffFresh && nowFresh <= kickoffFresh + LIVE_WINDOW_MS;
    const matchHasStarted = isPostMatchFresh || liveFresh || match.status === 'finished';
    if (!matchHasStarted) return;
    if (matchDocsLoading) return;

    // Only skip if we already have a súmula — the prefetched matchDocs may carry
    // only boletim data (for the card-face renda line) and must not block the
    // modal from fetching a full response that includes the súmula.
    if (matchDocs?.sumula != null) return;
    // Sentinel: docs confirmed unavailable — don't retry until dependencies change
    if (matchDocs?.available === false) return;

    const id = fichaData?.idJogo;
    if (!id) return;

    const round = match.round.match(/(\d+)/)?.[1] ?? '';
    if (!round) return;

    setMatchDocsLoading(true);
    fetch(`/api/cbf/match-docs?matchId=${id}&round=${round}`)
      .then((r) => r.ok ? r.json() as Promise<CbfMatchDocsResult> : null)
      .then((d) => { setMatchDocs(d ?? { available: false }); })
      .catch(() => { setMatchDocs({ available: false }); })
      .finally(() => { setMatchDocsLoading(false); });
  // matchDocsLoading and matchDocs?.sumula are intentionally excluded:
  // including them would cause infinite retries when docs are unavailable.
  // match.status is included so the effect re-runs when live → finished.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModal, fichaData?.idJogo, match.status, match.date]);

  function fetchCbfMatch() {
    if (inFlight.current.has('cbf')) return;
    if (match.leagueId !== 71) {
      setFichaStatus('not_found');
      return;
    }
    inFlight.current.add('cbf');
    setFichaStatus('loading');
    const round = match.round.match(/(\d+)/)?.[1] ?? '';
    const params = new URLSearchParams({ home: match.homeTeam.id, away: match.awayTeam.id, round });
    fetch(`/api/cbf/match?${params}`)
      .then((r) => {
        // 4xx = CBF doesn't have the data yet (round not published) — not an error
        if (r.status >= 400 && r.status < 500) { setFichaStatus('not_found'); return null; }
        if (!r.ok) throw new Error();
        return r.json() as Promise<CbfMatchDetail>;
      })
      .then((d) => { if (d) { setFichaData(d); setFichaStatus('done'); } })
      .catch(() => setFichaStatus('error'))
      .finally(() => { inFlight.current.delete('cbf'); });
  }

  function openFichaModal() {
    // Resolve the API-Football fixture ID for lineup + events fetches.
    // CONMEBOL-sourced matches (leagueId 13/11) use CONMEBOL internal IDs —
    // past-results enriches them with apiFootballFixtureId when a cross-reference is found.
    // Copa do Brasil (73) always has a valid API-Football fixture ID (match.id).
    const isConmebolSource = match.leagueId === 13 || match.leagueId === 11;
    const afFixtureId = isConmebolSource
      ? (match.apiFootballFixtureId ?? null)
      : parseInt(match.id, 10) || null;
    const afHomeId = isConmebolSource
      ? (match.apiFootballHomeId != null ? String(match.apiFootballHomeId) : null)
      : match.homeTeam.id;
    const afAwayId = isConmebolSource
      ? (match.apiFootballAwayId != null ? String(match.apiFootballAwayId) : null)
      : match.awayTeam.id;

    // H2H — always fetch for injuries data; ref guard prevents double-fetch
    if (!inFlight.current.has('h2h') && h2hStatus !== 'done') {
      inFlight.current.add('h2h');
      setH2hStatus('loading');
      const h2hHome = afHomeId ?? match.homeTeam.id;
      const h2hAway = afAwayId ?? match.awayTeam.id;
      const h2hParams = new URLSearchParams({ home: h2hHome, away: h2hAway, fixture: String(afFixtureId ?? match.id), leagueId: String(match.leagueId) });
      fetch(`/api/h2h?${h2hParams}`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<H2HData>; })
        .then((d) => { setH2hData(d); setH2hStatus('done'); })
        .catch(() => setH2hStatus('error'))
        .finally(() => { inFlight.current.delete('h2h'); });
    }

    // Lineups — ref guard prevents double-fetch; status check skips completed fetches
    if (!inFlight.current.has('lineups') && lineupStatus !== 'done' && afFixtureId != null) {
      inFlight.current.add('lineups');
      setLineupStatus('loading');
      fetch(`/api/lineups?fixture=${afFixtureId}`)
        .then((r) => {
          if (r.status === 404) return null;
          if (!r.ok) throw new Error();
          return r.json() as Promise<LineupData>;
        })
        .then((d) => { setLineupData(d); setLineupStatus('done'); })
        .catch(() => setLineupStatus('error'))
        .finally(() => { inFlight.current.delete('lineups'); });
    } else if (!inFlight.current.has('lineups') && lineupStatus !== 'done') {
      setLineupStatus('not_found');
    }

    // Events — finished matches only; ref guard prevents double-fetch
    const canFetchEvents = match.status === 'finished' && afFixtureId != null && afHomeId != null && afAwayId != null;
    if (!inFlight.current.has('events') && eventsStatus !== 'done' && canFetchEvents) {
      inFlight.current.add('events');
      setEventsStatus('loading');
      const eventsParams = new URLSearchParams({
        fixture: String(afFixtureId!),
        home:    afHomeId!,
        away:    afAwayId!,
        finished: '1',
      });
      fetch(`/api/match-events?${eventsParams}`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<MatchEventsData>; })
        .then((d) => { setEventsData(d); setEventsStatus('done'); })
        .catch(() => setEventsStatus('error'))
        .finally(() => { inFlight.current.delete('events'); });
    }

    // CBF data already pre-loaded (finished Brasileirão card from Resultados tab)
    if (fichaStatus === 'done') return;

    fetchCbfMatch();
  }

  return {
    fichaData,
    fichaStatus,
    lineupData,
    lineupStatus,
    eventsData,
    eventsStatus,
    matchDocs,
    matchDocsLoading,
    openFichaModal,
    retryFicha: fetchCbfMatch,
  };
}
