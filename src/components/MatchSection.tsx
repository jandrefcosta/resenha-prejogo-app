'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { MatchCard } from '@/components/MatchCard';
import { LIVE_WINDOW_MS } from '@/lib/matchConstants';
import type { Match, MatchPreview, CbfMatchDetail } from '@/lib/types';
import { localiseRound } from '@/lib/localiseRound';
import clubsData from '@/data/clubs.json';
import type { ClubTheme } from '@/lib/types';

// ─── CBF → Match converter ────────────────────────────────────────────────────

const clubs = clubsData as ClubTheme[];

/** cbfId → API-Football logo URL */
const cbfIdToLogo = new Map<string, string>(
  clubs
    .filter((c) => c.cbfId != null && c.apiFootballId != null)
    .map((c) => [
      String(c.cbfId),
      `https://media.api-sports.io/football/teams/${c.apiFootballId}.png`,
    ]),
);

/** cbfId → API-Football team ID string (used as Match.homeTeam.id / awayTeam.id) */
const cbfIdToApiFootballId = new Map<string, string>(
  clubs
    .filter((c) => c.cbfId != null && c.apiFootballId != null)
    .map((c) => [String(c.cbfId), String(c.apiFootballId)]),
);

/** cbfId → shortName */
const cbfIdToShort = new Map<string, string>(
  clubs
    .filter((c) => c.cbfId != null)
    .map((c) => [String(c.cbfId), c.shortName]),
);

function stripState(name: string): string {
  return name.replace(/\s*-\s*[A-Z]{2}$/, '');
}

function cbfToMatch(entry: PastEntry): Match {
  const d = entry.match;
  const [day, month, year] = d.data.split('/').map(Number);
  const [hours, minutes] = d.hora.split(':').map(Number);
  // CBF times are Brazil time (UTC-3)
  const date = new Date(Date.UTC(year, month - 1, day, hours + 3, minutes)).toISOString();

  const homeApiId = cbfIdToApiFootballId.get(d.mandante.id);
  const awayApiId = cbfIdToApiFootballId.get(d.visitante.id);

  const homeScore = d.mandante.gols !== '' && d.mandante.gols !== null ? Number(d.mandante.gols) : null;
  const awayScore = d.visitante.gols !== '' && d.visitante.gols !== null ? Number(d.visitante.gols) : null;

  return {
    // Use CBF match ID — unique per match
    id: d.idJogo,
    homeTeam: {
      // Use API-Football ID when available so highlight logic works; fallback to cbfId
      id: homeApiId ?? d.mandante.id,
      name: stripState(d.mandante.nome),
      shortName: cbfIdToShort.get(d.mandante.id) ?? stripState(d.mandante.nome).substring(0, 3).toUpperCase(),
      logo: cbfIdToLogo.get(d.mandante.id),
    },
    awayTeam: {
      id: awayApiId ?? d.visitante.id,
      name: stripState(d.visitante.nome),
      shortName: cbfIdToShort.get(d.visitante.id) ?? stripState(d.visitante.nome).substring(0, 3).toUpperCase(),
      logo: cbfIdToLogo.get(d.visitante.id),
    },
    date,
    stadium: d.local ? d.local.split(' - ')[0] : null,
    city: null,
    competition: 'Campeonato Brasileiro Série A',
    leagueId: 71,
    competitionName: 'Brasileirão',
    round: `Rodada ${entry.round}`,
    status: 'finished',
    score: homeScore !== null && awayScore !== null ? { home: homeScore, away: awayScore } : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'past' | 'schedule';

interface RoundGroup {
  /** Unique key: `${leagueId}:${round}` */
  key: string;
  /** Header label shown to the user */
  groupLabel: string;
  /** Short competition name — shown on the group header for non-Série-A groups */
  competitionName: string;
  leagueId: number;
  /** True only for the first (earliest) upcoming group across all competitions */
  isCurrent: boolean;
  matches: Match[];
}

interface PastEntry {
  round: number;
  match: CbfMatchDetail;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Shared sub-components ────────────────────────────────────────────────────

function CurrentRoundHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-sm font-bold font-sans text-white">{label}</span>
      <span className="px-2.5 py-0.5 text-xs font-black font-sans rounded-full bg-white text-zinc-900 uppercase tracking-wide">
        Próximo
      </span>
    </div>
  );
}

function RoundDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mt-6 mb-3">
      <div className="flex-1 h-px bg-zinc-800" />
      <span className="text-xs font-semibold font-sans text-zinc-500 uppercase tracking-wider px-2">
        {label}
      </span>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
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

// ─── Main component ───────────────────────────────────────────────────────────

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

  const [otherResults, setOtherResults] = useState<Match[] | null>(null);
  const [otherResultsLoading, setOtherResultsLoading] = useState(false);

  /** Active competition filter — null means "show all" */
  const [competitionFilter, setCompetitionFilter] = useState<number | null>(null);

  // Fallback Série A round number — persisted across cache misses so the "Resultados"
  // tab stays visible even when the API cache is cold between rounds.
  const [lastKnownRound, setLastKnownRound] = useState(0);
  useEffect(() => {
    const stored = Number(localStorage.getItem('lastKnownRound') ?? 0);
    if (stored > 0) setLastKnownRound(stored);
  }, []);

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

  // All upcoming matches for the selected club (across all competitions)
  const rawMatches: Match[] = club && allFixtures ? (allFixtures[club.id] ?? []) : [];
  const allMatches = rawMatches.filter(
    (m) => m.status === 'postponed' || Date.now() <= new Date(m.date).getTime() + LIVE_WINDOW_MS,
  );

  // Which competitions does this club have upcoming matches in?
  const activeLeagueIds = [...new Set(allMatches.map((m) => m.leagueId))];

  // Matches after applying competition filter
  const filteredMatches = competitionFilter
    ? allMatches.filter((m) => m.leagueId === competitionFilter)
    : allMatches;

  // Série A round tracking — needed for "Resultados" tab (CBF API only covers Série A)
  const serieAMatches = rawMatches.filter((m) => m.leagueId === 71);
  const firstSerieARound = serieAMatches[0]?.round ?? '';
  const derivedRoundNum = Number(firstSerieARound.match(/(\d+)/)?.[1] ?? 0);
  const currentRoundNum = derivedRoundNum || lastKnownRound;

  useEffect(() => {
    if (derivedRoundNum > 0 && derivedRoundNum !== lastKnownRound) {
      localStorage.setItem('lastKnownRound', String(derivedRoundNum));
      setLastKnownRound(derivedRoundNum);
    }
  }, [derivedRoundNum, lastKnownRound]);

  // Reset filter when club changes
  useEffect(() => {
    setCompetitionFilter(null);
  }, [club?.id]);

  // Build schedule groups: group by leagueId+round, sorted chronologically
  const scheduleGroups: RoundGroup[] = [];
  const seenKeys = new Set<string>();
  for (const match of filteredMatches) {
    const key = `${match.leagueId}:${match.round}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      const localisedRound = localiseRound(match.round);
      // When viewing a single competition (filter active), show only the phase/round.
      // In "Todos" mode with multiple competitions, prefix non-Série-A with competition name
      // so the user knows which competition each group belongs to.
      const groupLabel = (match.leagueId === 71 || competitionFilter !== null)
        ? localisedRound
        : `${match.competitionName} · ${localisedRound}`;
      scheduleGroups.push({
        key,
        groupLabel,
        competitionName: match.competitionName,
        leagueId: match.leagueId,
        isCurrent: scheduleGroups.length === 0, // first group is always "current"
        matches: filteredMatches.filter((m) => m.leagueId === match.leagueId && m.round === match.round),
      });
    }
  }

  // Fetch previews for visible upcoming matches
  const idsKey = filteredMatches.map((m) => m.id).join(',');
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

  function fetchOtherResults(clubId: string) {
    setOtherResultsLoading(true);
    fetch(`/api/past-results?club=${clubId}`)
      .then((r) => (r.ok ? (r.json() as Promise<Match[]>) : Promise.reject()))
      .then((data) => setOtherResults(Array.isArray(data) ? data : []))
      .catch(() => setOtherResults([]))
      .finally(() => setOtherResultsLoading(false));
  }

  // Reset past matches when club changes
  useEffect(() => {
    pastFetchedRef.current = false;
    setPastMatches(null);
    setOtherResults(null);
    if (activeTab === 'past' && club && currentRoundNum > 1) {
      pastFetchedRef.current = true;
      setPastLoading(true);
      fetch(`/api/past-fixtures?club=${club.id}&beforeRound=${currentRoundNum + 1}&limit=3`)
        .then((r) => (r.ok ? (r.json() as Promise<PastEntry[]>) : Promise.reject()))
        .then((data) => setPastMatches(data))
        .catch(() => setPastMatches([]))
        .finally(() => setPastLoading(false));
      fetchOtherResults(club.id);
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
      fetchOtherResults(club.id);
    }
  }

  if (!club) return null;

  const showPastTab = currentRoundNum > 0;

  const tabs = [
    showPastTab && { id: 'past' as TabId, label: 'Resultados' },
    { id: 'schedule' as TabId, label: 'Próximos Jogos' },
  ].filter(Boolean) as { id: TabId; label: string }[];

  // League IDs derived from past results (populated after Resultados tab loads)
  const safeOtherResults = Array.isArray(otherResults) ? otherResults : [];
  const resultLeagueIds: number[] = [];
  if (pastMatches && pastMatches.length > 0) resultLeagueIds.push(71);
  for (const m of safeOtherResults) {
    if (!resultLeagueIds.includes(m.leagueId)) resultLeagueIds.push(m.leagueId);
  }

  // Unified competition pills: union of upcoming + historical so the same pills
  // appear in both tabs and persist across tab switches.
  const unifiedLeagueIds = [...new Set([...activeLeagueIds, ...resultLeagueIds])];
  const hasMultipleCompetitions = unifiedLeagueIds.length > 1;
  const unifiedCompetitionOptions = unifiedLeagueIds
    .map((id) => {
      if (id === 71) return { leagueId: 71, label: 'Brasileirão' };
      const sample = allMatches.find((m) => m.leagueId === id)
        ?? safeOtherResults.find((m) => m.leagueId === id);
      return { leagueId: id, label: sample?.competitionName ?? String(id) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

  // Resultados tab derived data
  const showSerieAResults = competitionFilter === null || competitionFilter === 71;
  const showOtherResults  = competitionFilter === null || competitionFilter !== 71;
  const filteredOtherResults = (competitionFilter !== null && competitionFilter !== 71)
    ? safeOtherResults.filter((m) => m.leagueId === competitionFilter)
    : safeOtherResults;
  const resultsDoneLoading = !(showSerieAResults && pastLoading) && !(showOtherResults && otherResultsLoading && !otherResults);
  const resultsEmpty = resultsDoneLoading
    && !(showSerieAResults && (pastMatches?.length ?? 0) > 0)
    && !(showOtherResults && filteredOtherResults.length > 0);

  // Merge CBF + API-Football results into a single chronologically sorted list.
  // CBF entries carry a `data` string ("DD/MM/YYYY") + `hora` ("HH:MM") — convert to ISO for comparison.
  type MergedResult =
    | { kind: 'cbf'; round: number; match: CbfMatchDetail; dateMs: number }
    | { kind: 'api'; match: Match; dateMs: number };

  const mergedResults: MergedResult[] = [];

  if (showSerieAResults && !pastLoading && pastMatches) {
    for (const entry of pastMatches) {
      const [d, m, y] = (entry.match.data ?? '').split('/');
      const timeStr = entry.match.hora ?? '00:00';
      const isoStr = d && m && y ? `${y}-${m}-${d}T${timeStr}:00-03:00` : '';
      mergedResults.push({
        kind: 'cbf',
        round: entry.round,
        match: entry.match,
        dateMs: isoStr ? new Date(isoStr).getTime() : 0,
      });
    }
  }

  if (showOtherResults && Array.isArray(filteredOtherResults)) {
    for (const match of filteredOtherResults) {
      mergedResults.push({ kind: 'api', match, dateMs: new Date(match.date).getTime() });
    }
  }

  // Newest first
  mergedResults.sort((a, b) => b.dateMs - a.dateMs);

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
                className="flex-1 py-2 min-h-[44px] text-xs font-semibold font-sans rounded-lg transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 cursor-pointer"
                style={
                  isActive
                    ? { backgroundColor: 'var(--club-primary)', color: 'var(--club-text-on-primary)' }
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

      {/* Competition filter pills — unified across both tabs, persists on tab switch */}
      {!loading && !error && hasMultipleCompetitions && (activeTab === 'schedule' || !pastLoading) && (
        <div className="flex items-center gap-2 flex-wrap mb-5" role="group" aria-label="Filtrar por competição">
          <button
            onClick={() => setCompetitionFilter(null)}
            className={[
              'rounded-full px-3 py-1 text-xs font-semibold font-sans transition-all cursor-pointer min-h-[32px]',
              competitionFilter === null
                ? 'bg-white text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700',
            ].join(' ')}
          >
            Todos
          </button>
          {unifiedCompetitionOptions.map(({ leagueId, label }) => (
            <button
              key={leagueId}
              onClick={() => setCompetitionFilter(leagueId === competitionFilter ? null : leagueId)}
              className={[
                'rounded-full px-3 py-1 text-xs font-semibold font-sans transition-all cursor-pointer min-h-[32px]',
                competitionFilter === leagueId
                  ? 'text-zinc-900'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700',
              ].join(' ')}
              style={competitionFilter === leagueId ? { backgroundColor: 'var(--club-primary)', color: 'var(--club-text-on-primary)' } : undefined}
            >
              {label}
            </button>
          ))}
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

      {/* ── Resultados — lista mesclada (CBF + API-Football), ordenada por data ── */}
      {!loading && !error && activeTab === 'past' && (
        <>
          {/* Skeletons enquanto alguma das fontes ainda carrega */}
          {(showSerieAResults && pastLoading) && (
            <div className="space-y-4" role="status" aria-label="Carregando resultados">
              <MatchCardSkeleton />
              <MatchCardSkeleton />
              <MatchCardSkeleton />
            </div>
          )}
          {(!pastLoading) && showOtherResults && otherResultsLoading && !otherResults && (
            <div className="space-y-4" role="status" aria-label="Carregando outros resultados">
              <MatchCardSkeleton />
              <MatchCardSkeleton />
            </div>
          )}

          {/* Lista mesclada — renderizada quando pelo menos uma fonte carregou */}
          {!pastLoading && mergedResults.length > 0 && (
            <div className="space-y-4">
              {mergedResults.map((entry) => {
                if (entry.kind === 'cbf') {
                  const matchObj = cbfToMatch(entry);
                  return (
                    <MatchCard
                      key={`cbf-${entry.round}`}
                      match={matchObj}
                      highlightClubId={club.apiFootballId != null ? String(club.apiFootballId) : matchObj.homeTeam.id}
                      highlightCbfId={String(club.cbfId ?? '')}
                      cbfMatchDetail={entry.match}
                      cbfRound={entry.round}
                      preview={undefined}
                      previewLoading={false}
                      noEmailGate
                    />
                  );
                }
                // CONMEBOL sources (Libertadores leagueId=13, Sul-Americana leagueId=11) use
                // CONMEBOL team IDs in homeTeam.id/awayTeam.id — must match with conmebolId.
                const isConmebolSource = entry.match.leagueId === 13 || entry.match.leagueId === 11;
                const highlightId = isConmebolSource
                  ? (club.conmebolId != null ? String(club.conmebolId) : entry.match.homeTeam.id)
                  : (club.apiFootballId != null ? String(club.apiFootballId) : entry.match.homeTeam.id);
                return (
                  <MatchCard
                    key={`api-${entry.match.id}`}
                    match={entry.match}
                    highlightClubId={highlightId}
                    preview={undefined}
                    previewLoading={false}
                    noEmailGate
                  />
                );
              })}
            </div>
          )}

          {/* Estado vazio */}
          {resultsEmpty && (
            <p className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400 font-sans">
              Sem resultados anteriores disponíveis.
            </p>
          )}
        </>
      )}

      {/* ── Próximos Jogos (todas as competições) ── */}
      {!loading && !error && activeTab === 'schedule' && (
        <>
          {scheduleGroups.length === 0 && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-8 text-center font-sans space-y-2">
              <p className="text-sm text-zinc-400">
                Nenhum jogo encontrado para {club.name}.
              </p>
              <p className="text-xs text-zinc-600">
                O calendário da temporada ainda não foi divulgado na íntegra — novos jogos aparecem automaticamente quando confirmados.
              </p>
            </div>
          )}
          {scheduleGroups.length > 0 && (
            <div>
              {scheduleGroups.map((group, groupIndex) => (
                <div key={group.key}>
                  {group.isCurrent ? (
                    <CurrentRoundHeader label={group.groupLabel} />
                  ) : (
                    <RoundDivider label={group.groupLabel} />
                  )}
                  <div className="space-y-4">
                    {group.matches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        highlightClubId={club.id}
                        preview={previews?.[match.id]}
                        previewLoading={previewsLoading}
                        noEmailGate={groupIndex <= 1}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {/* Calendário incompleto — jogos futuros aparecem quando confirmados pela liga */}
              {competitionFilter === null && allMatches.length < 4 && (
                <p className="mt-6 text-center text-xs text-zinc-600 font-sans">
                  Restante do calendário ainda não divulgado — novos jogos aparecem automaticamente quando confirmados.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
