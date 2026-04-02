'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { MatchCard } from '@/components/MatchCard';
import { ResultCard } from '@/components/ResultCard';
import { LIVE_WINDOW_MS } from '@/lib/matchConstants';
import type { Match, MatchPreview, CbfMatchDetail } from '@/lib/types';

type TabId = 'past' | 'schedule';

interface RoundGroup {
  roundLabel: string;
  roundNum: number;
  isCurrent: boolean;
  matches: Match[];
}

interface PastEntry {
  round: number;
  match: CbfMatchDetail;
}

function MatchCardSkeleton() {
  return (
    <div
      className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden animate-pulse"
      aria-hidden="true"
    >
      <div className="h-9 bg-zinc-800/60" />
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-zinc-700 rounded w-3/4 ml-auto" />
            <div className="h-3 bg-zinc-800 rounded w-1/4 ml-auto" />
          </div>
          <div className="w-6 h-4 bg-zinc-700 rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-zinc-700 rounded w-3/4" />
            <div className="h-3 bg-zinc-800 rounded w-1/4" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 bg-zinc-800 rounded-lg" />
          <div className="h-16 bg-zinc-800 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function MatchSection() {
  const { club } = useTheme();

  const [allFixtures, setAllFixtures] = useState<Record<string, Match[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);

  const [previews, setPreviews] = useState<Record<string, MatchPreview> | null>(null);
  const [previewsLoading, setPreviewsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>('schedule');
  const [pastMatches, setPastMatches] = useState<PastEntry[] | null>(null);
  const [pastLoading, setPastLoading] = useState(false);
  const pastFetchedRef = useRef(false);

  // Load all fixtures once
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch('/api/fixtures')
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json() as Promise<Record<string, Match[]>>;
      })
      .then((data) => {
        setAllFixtures(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  // Derive round split
  const rawMatches: Match[] = club && allFixtures ? (allFixtures[club.id] ?? []) : [];
  const allMatches = rawMatches.filter(
    (m) => m.status === 'postponed' || Date.now() <= new Date(m.date).getTime() + LIVE_WINDOW_MS,
  );
  // Use raw (unfiltered) list to always know the real current round number,
  // even when all matches of the round have already been filtered out as finished.
  const firstRound = rawMatches[0]?.round ?? '';
  const currentRoundNum = Number(firstRound.match(/(\d+)/)?.[1] ?? 0);

  // Build schedule groups: current round + upcoming rounds
  const scheduleGroups: RoundGroup[] = [];
  const seenRounds = new Set<string>();
  for (const match of allMatches) {
    if (!seenRounds.has(match.round)) {
      seenRounds.add(match.round);
      const n = Number(match.round.match(/(\d+)/)?.[1] ?? 0);
      scheduleGroups.push({
        roundLabel: match.round,
        roundNum: n,
        isCurrent: match.round === firstRound,
        matches: allMatches.filter((m) => m.round === match.round),
      });
    }
  }

  // Fetch previews for API-Football matches
  const idsKey = allMatches.map((m) => m.id).join(',');
  useEffect(() => {
    if (!idsKey) return;
    setPreviewsLoading(true);
    setPreviews(null);
    fetch(`/api/previews?ids=${idsKey}`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, MatchPreview>>) : null))
      .then((data) => { if (data) setPreviews(data); })
      .catch(() => {})
      .finally(() => setPreviewsLoading(false));
  }, [idsKey]);

  // Reset past matches when club changes
  useEffect(() => {
    pastFetchedRef.current = false;
    setPastMatches(null);
    if (activeTab === 'past' && club && currentRoundNum > 1) {
      pastFetchedRef.current = true;
      setPastLoading(true);
      fetch(`/api/past-fixtures?club=${club.id}&beforeRound=${currentRoundNum + 1}&limit=3`)
        .then((r) => (r.ok ? (r.json() as Promise<PastEntry[]>) : Promise.reject()))
        .then((data) => setPastMatches(data))
        .catch(() => setPastMatches([]))
        .finally(() => setPastLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id]);

  // Lazy-fetch past matches when tab is activated
  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    if (tab === 'past' && !pastFetchedRef.current && club && currentRoundNum > 1) {
      pastFetchedRef.current = true;
      setPastLoading(true);
      fetch(`/api/past-fixtures?club=${club.id}&beforeRound=${currentRoundNum + 1}&limit=3`)
        .then((r) => (r.ok ? (r.json() as Promise<PastEntry[]>) : Promise.reject()))
        .then((data) => setPastMatches(data))
        .catch(() => setPastMatches([]))
        .finally(() => setPastLoading(false));
    }
  }

  if (!club) return null;

  const showPastTab = currentRoundNum > 1;

  const tabs = [
    showPastTab && { id: 'past' as TabId, label: 'Resultados' },
    { id: 'schedule' as TabId, label: firstRound || 'Próximos' },
  ].filter(Boolean) as { id: TabId; label: string }[];

  return (
    <section aria-label={`Jogos — ${club.name}`}>
      <div className="mb-6 flex items-baseline gap-2">
        <h2 className="text-2xl font-bold text-white font-display uppercase tracking-wide">
          Jogos
        </h2>
        <span className="text-sm text-zinc-400 font-sans">{club.name}</span>
      </div>

      {/* Tab navigation */}
      {!loading && !error && tabs.length > 1 && (
        <div className="flex bg-zinc-800 rounded-xl p-1 gap-1 mb-6" role="tablist">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(tab.id)}
                className="flex-1 py-2 text-xs font-semibold font-sans rounded-lg transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 cursor-pointer"
                style={
                  isActive
                    ? {
                        backgroundColor: 'var(--club-primary)',
                        color: 'var(--club-text-on-primary)',
                      }
                    : undefined
                }
              >
                <span className={isActive ? '' : 'text-zinc-400 hover:text-zinc-200 transition-colors'}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4" role="status" aria-label="Carregando jogos">
          <MatchCardSkeleton />
          <MatchCardSkeleton />
          <MatchCardSkeleton />
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400 font-sans">
          Não foi possível carregar os jogos. Tente novamente.
        </p>
      )}

      {/* ── Resultados (past) ── */}
      {!loading && !error && activeTab === 'past' && (
        <>
          {pastLoading && (
            <div className="space-y-4" role="status" aria-label="Carregando resultados">
              <MatchCardSkeleton />
              <MatchCardSkeleton />
              <MatchCardSkeleton />
            </div>
          )}
          {!pastLoading && pastMatches !== null && pastMatches.length === 0 && (
            <p className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400 font-sans">
              Sem resultados anteriores disponíveis.
            </p>
          )}
          {!pastLoading && pastMatches && pastMatches.length > 0 && (
            <div className="space-y-4">
              {pastMatches.map((entry) => (
                <ResultCard
                  key={entry.round}
                  roundN={entry.round}
                  data={entry.match}
                  highlightCbfId={String(club.cbfId ?? '')}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Calendário (rodada atual + próximas) ── */}
      {!loading && !error && activeTab === 'schedule' && (
        <>
          {scheduleGroups.length === 0 && (
            <p className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400 font-sans">
              Nenhum jogo encontrado para {club.name}.
            </p>
          )}
          {scheduleGroups.length > 0 && (
            <div className="space-y-2">
              {scheduleGroups.map((group, gi) => (
                <div key={group.roundLabel}>
                  {/* Round header — only shown when there are multiple groups */}
                  {scheduleGroups.length > 1 && (
                    <div className={`flex items-center gap-2 ${gi === 0 ? 'mb-3' : 'mt-6 mb-3'}`}>
                      {group.isCurrent ? (
                        <>
                          <span className="text-sm font-semibold font-sans text-white">
                            {group.roundLabel}
                          </span>
                          <span
                            className="px-2 py-0.5 text-xs font-bold font-sans rounded-full"
                            style={{
                              backgroundColor: 'var(--club-primary)',
                              color: 'var(--club-text-on-primary)',
                            }}
                          >
                            Atual
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 h-px bg-zinc-800" />
                          <span className="text-xs font-semibold font-sans text-zinc-500 uppercase tracking-wider px-2">
                            {group.roundLabel}
                          </span>
                          <div className="flex-1 h-px bg-zinc-800" />
                        </>
                      )}
                    </div>
                  )}
                  <div className="space-y-4">
                    {group.matches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        highlightClubId={club.id}
                        preview={previews?.[match.id]}
                        previewLoading={previewsLoading}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
