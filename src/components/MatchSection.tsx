'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { MatchCard } from '@/components/MatchCard';
import { LIVE_WINDOW_MS } from '@/lib/matchConstants';
import type { Match, MatchPreview, CbfMatchDetail } from '@/lib/types';
import type { CbfMatchDocsResult } from '@/lib/cbfDocTypes';
import { getMatchDocs } from '@/lib/matchDocs';
import { localiseRound } from '@/lib/localiseRound';
import clubsData from '@/data/clubs.json';
import type { ClubTheme } from '@/lib/types';

// ─── Lookup maps (built once at module level) ─────────────────────────────────

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

/** cbfId → API-Football team ID string */
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

// ─── CBF → Match converter ────────────────────────────────────────────────────

function stripState(name: string): string {
  return name.replace(/\s*-\s*[A-Z]{2}$/, '');
}

function cbfToMatch(entry: PastEntry): Match {
  const d = entry.match;
  const [day, month, year] = d.data.split('/').map(Number);
  const [hours, minutes] = d.hora.split(':').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hours + 3, minutes)).toISOString();

  const homeApiId = cbfIdToApiFootballId.get(d.mandante.id);
  const awayApiId = cbfIdToApiFootballId.get(d.visitante.id);
  const homeScore = d.mandante.gols !== '' && d.mandante.gols !== null ? Number(d.mandante.gols) : null;
  const awayScore = d.visitante.gols !== '' && d.visitante.gols !== null ? Number(d.visitante.gols) : null;

  return {
    id: d.idJogo,
    homeTeam: {
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

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'past' | 'schedule';

interface RoundGroup {
  key: string;
  groupLabel: string;
  competitionName: string;
  leagueId: number;
  isCurrent: boolean;
  matches: Match[];
}

interface PastEntry {
  round: number;
  match: CbfMatchDetail;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A match is "upcoming or live" if it hasn't passed the live window yet,
 * or if it was postponed. This is the inclusion rule for the schedule tab.
 */
function isUpcomingOrLive(match: Match): boolean {
  if (match.status === 'postponed') return true;
  return Date.now() <= new Date(match.date).getTime() + LIVE_WINDOW_MS;
}

/**
 * Groups an ordered list of matches into RoundGroup objects for display.
 * Matches must already be filtered to the active competition (if any).
 *
 * The group key includes the date (YYYY-MM-DD) so that two-legged ties whose
 * round strings are identical (e.g. "Round of 16" without "1st Leg"/"2nd Leg")
 * are not collapsed into a single group, which would break date ordering.
 */
function buildScheduleGroups(matches: Match[], competitionFilter: number | null): RoundGroup[] {
  const groups: RoundGroup[] = [];
  const seenKeys = new Set<string>();

  // Determine whether more than one competition is present so we can show
  // the competition name in every group header (not just non-Série-A ones).
  const uniqueLeagueIds = new Set(matches.map((m) => m.leagueId));
  const hasMultipleCompetitions = uniqueLeagueIds.size > 1;

  for (const match of matches) {
    const dateStr = match.date.substring(0, 10); // YYYY-MM-DD
    const key = `${match.leagueId}:${match.round}:${dateStr}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const localisedRound = localiseRound(match.round);
    const groupLabel =
      competitionFilter !== null || !hasMultipleCompetitions
        ? localisedRound
        : `${match.competitionName} · ${localisedRound}`;

    groups.push({
      key,
      groupLabel,
      competitionName: match.competitionName,
      leagueId: match.leagueId,
      isCurrent: groups.length === 0,
      matches: matches.filter(
        (m) =>
          m.leagueId === match.leagueId &&
          m.round === match.round &&
          m.date.substring(0, 10) === dateStr,
      ),
    });
  }

  return groups;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MatchSection() {
  const { club } = useTheme();

  // ── Schedule state ─────────────────────────────────────────────────────────
  const [allFixtures, setAllFixtures] = useState<Record<string, Match[]> | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState(false);
  const fixturesFetchedRef = useRef(false);

  const [previews, setPreviews] = useState<Record<string, MatchPreview> | null>(null);
  const [previewsLoading, setPreviewsLoading] = useState(false);

  // ── Past results state ─────────────────────────────────────────────────────
  // CBF (Série A) past fixtures — requires a round number from the server
  const [pastMatches, setPastMatches] = useState<PastEntry[] | null>(null);
  const [pastLoading, setPastLoading] = useState(false);
  const [pastMatchDocs, setPastMatchDocs] = useState<Record<string, CbfMatchDocsResult>>({});

  // Non-CBF past results (CONMEBOL, Copa do Brasil, API-Football)
  const [otherResults, setOtherResults] = useState<Match[] | null>(null);
  const [otherResultsLoading, setOtherResultsLoading] = useState(false);

  // Round number used to query CBF past fixtures — comes from the server response,
  // not from fixtures. Kept in state so it persists while the user is on the past tab.
  const [serieARound, setSerieARound] = useState<number>(0);

  // Tracks whether past data has been fetched for the current club+tab combination
  const pastFetchedRef = useRef(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('schedule');
  const [competitionFilter, setCompetitionFilter] = useState<number | null>(null);

  // ── Fetch: upcoming fixtures (schedule tab) ────────────────────────────────
  useEffect(() => {
    if (fixturesFetchedRef.current) return;
    fixturesFetchedRef.current = true;

    fetch('/api/fixtures')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Record<string, Match[]>>;
      })
      .then((data) => {
        setAllFixtures(data);
        setScheduleLoading(false);
      })
      .catch(() => {
        setScheduleError(true);
        setScheduleLoading(false);
      });
  }, []);

  // ── Derived: upcoming + live matches for selected club ─────────────────────
  const rawFixtures: Match[] = club && allFixtures ? (allFixtures[club.id] ?? []) : [];
  const upcomingMatches = rawFixtures.filter(isUpcomingOrLive);

  // Competitions represented in upcoming matches
  const upcomingLeagueIds = [...new Set(upcomingMatches.map((m) => m.leagueId))];

  // Round number for CBF queries — derived from the first Série A upcoming match
  const derivedSerieARound = Number(
    (rawFixtures.find((m) => m.leagueId === 71)?.round ?? '').match(/(\d+)/)?.[1] ?? 0,
  );

  // Keep serieARound up-to-date whenever fixtures load (or change between rounds)
  useEffect(() => {
    if (derivedSerieARound > 0) setSerieARound(derivedSerieARound);
  }, [derivedSerieARound]);

  // Load match-docs for finished Série A matches from static JSON (pre-built offline)
  useEffect(() => {
    if (!pastMatches || pastMatches.length === 0) return;
    const updates: Record<string, CbfMatchDocsResult> = {};
    pastMatches.forEach((entry) => {
      const id = entry.match.idJogo;
      if (!id || pastMatchDocs[id] !== undefined) return;
      const docs = getMatchDocs(id);
      if (docs) updates[id] = docs;
    });
    if (Object.keys(updates).length > 0) {
      setPastMatchDocs((prev) => ({ ...prev, ...updates }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastMatches]);

  // ── Fetch: past results ────────────────────────────────────────────────────
  function fetchPastResults(clubId: string, roundNum: number) {
    // CBF: only if we have a round number
    if (roundNum > 1) {
      setPastLoading(true);
      fetch(`/api/past-fixtures?club=${clubId}&beforeRound=${roundNum + 1}&limit=3`)
        .then((r) => (r.ok ? (r.json() as Promise<PastEntry[]>) : Promise.reject()))
        .then((data) => setPastMatches(data))
        .catch(() => setPastMatches([]))
        .finally(() => setPastLoading(false));
    }

    // CONMEBOL + Copa do Brasil: always fetch, round-independent
    setOtherResultsLoading(true);
    fetch(`/api/past-results?club=${clubId}`)
      .then((r) => (r.ok ? (r.json() as Promise<Match[]>) : Promise.reject()))
      .then((data) => setOtherResults(Array.isArray(data) ? data : []))
      .catch(() => setOtherResults([]))
      .finally(() => setOtherResultsLoading(false));
  }

  // Reset past state whenever the selected club changes
  useEffect(() => {
    pastFetchedRef.current = false;
    setPastMatches(null);
    setOtherResults(null);
    setCompetitionFilter(null);

    // If the user is already on the past tab, re-fetch immediately
    if (activeTab === 'past' && club) {
      pastFetchedRef.current = true;
      fetchPastResults(club.id, serieARound);
    }
  // serieARound intentionally excluded: round updates are handled separately below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id]);

  // Re-fetch CBF past fixtures when the round number becomes available and the past
  // tab is active but CBF data hasn't loaded yet (e.g. fixtures arrived after tab open)
  useEffect(() => {
    if (
      serieARound > 1 &&
      activeTab === 'past' &&
      club &&
      pastFetchedRef.current &&
      pastMatches === null &&
      !pastLoading
    ) {
      setPastLoading(true);
      fetch(`/api/past-fixtures?club=${club.id}&beforeRound=${serieARound + 1}&limit=3`)
        .then((r) => (r.ok ? (r.json() as Promise<PastEntry[]>) : Promise.reject()))
        .then((data) => setPastMatches(data))
        .catch(() => setPastMatches([]))
        .finally(() => setPastLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serieARound]);

  // ── Tab change handler ─────────────────────────────────────────────────────
  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    if (tab === 'past' && !pastFetchedRef.current && club) {
      pastFetchedRef.current = true;
      fetchPastResults(club.id, serieARound);
    }
  }

  // ── Fetch: previews for all upcoming matches (not filtered) ──────────────
  // Always fetch all matches regardless of competitionFilter — the filter is
  // visual only. This avoids a redundant API call every time the user clicks
  // a competition pill, since the full result already contains every subset.
  const filteredUpcoming = competitionFilter
    ? upcomingMatches.filter((m) => m.leagueId === competitionFilter)
    : upcomingMatches;

  const allUpcomingIdsKey = upcomingMatches.map((m) => m.id).join(',');
  useEffect(() => {
    if (!allUpcomingIdsKey) return;
    setPreviewsLoading(true);
    setPreviews(null);
    fetch(`/api/previews?ids=${allUpcomingIdsKey}`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, MatchPreview>>) : null))
      .then((data) => { if (data) setPreviews(data); })
      .catch(() => {})
      .finally(() => setPreviewsLoading(false));
  }, [allUpcomingIdsKey]);

  if (!club) return null;

  // ── Derived: past results display ──────────────────────────────────────────
  const safeOtherResults = Array.isArray(otherResults) ? otherResults : [];

  // League IDs from past results — fed into the unified competition pill list
  const pastLeagueIds: number[] = [];
  if (pastMatches && pastMatches.length > 0) pastLeagueIds.push(71);
  for (const m of safeOtherResults) {
    if (!pastLeagueIds.includes(m.leagueId)) pastLeagueIds.push(m.leagueId);
  }

  const showSerieAResults = competitionFilter === null || competitionFilter === 71;
  const showOtherResults  = competitionFilter === null || competitionFilter !== 71;

  const filteredOtherResults =
    competitionFilter !== null && competitionFilter !== 71
      ? safeOtherResults.filter((m) => m.leagueId === competitionFilter)
      : safeOtherResults;

  const pastStillLoading =
    (showSerieAResults && pastLoading) ||
    (showOtherResults && otherResultsLoading && otherResults === null);

  const resultsEmpty =
    !pastStillLoading &&
    !(showSerieAResults && (pastMatches?.length ?? 0) > 0) &&
    !(showOtherResults && filteredOtherResults.length > 0);

  // Merge CBF + API-Football past results, newest first
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

  if (showOtherResults && filteredOtherResults.length > 0) {
    for (const match of filteredOtherResults) {
      mergedResults.push({ kind: 'api', match, dateMs: new Date(match.date).getTime() });
    }
  }

  mergedResults.sort((a, b) => b.dateMs - a.dateMs);

  // ── Derived: schedule groups ───────────────────────────────────────────────
  const scheduleGroups = buildScheduleGroups(filteredUpcoming, competitionFilter);

  // ── Derived: competition pills (union of upcoming + past leagues) ──────────
  const allLeagueIds = [...new Set([...upcomingLeagueIds, ...pastLeagueIds])];
  const hasMultipleCompetitions = allLeagueIds.length > 1;

  const competitionOptions = allLeagueIds
    .map((id) => {
      if (id === 71) return { leagueId: 71, label: 'Brasileirão' };
      const sample =
        upcomingMatches.find((m) => m.leagueId === id) ??
        safeOtherResults.find((m) => m.leagueId === id);
      return { leagueId: id, label: sample?.competitionName ?? String(id) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

  // ── Tabs ───────────────────────────────────────────────────────────────────
  // "Resultados" is always shown — every club has Copa do Brasil history and
  // clubs with conmebolId also have Libertadores/Sul-Americana history.
  // The tab does not depend on fixtures loading to be visible.
  const tabs: { id: TabId; label: string }[] = [
    { id: 'past',     label: 'Resultados'    },
    { id: 'schedule', label: 'Próximos Jogos' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section aria-label={`Jogos — ${club.name}`}>
      <div className="mb-6 flex items-baseline gap-2">
        <h2 className="text-2xl font-bold text-white font-display uppercase tracking-wide">
          Jogos
        </h2>
        <span className="text-sm text-zinc-400 font-sans">{club.name}</span>
      </div>

      {/* Tab navigation */}
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

      {/* Competition filter pills — unified across both tabs */}
      {hasMultipleCompetitions && (activeTab === 'schedule' || !pastStillLoading) && (
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
          {competitionOptions.map(({ leagueId, label }) => (
            <button
              key={leagueId}
              onClick={() => setCompetitionFilter(leagueId === competitionFilter ? null : leagueId)}
              className={[
                'rounded-full px-3 py-1 text-xs font-semibold font-sans transition-all cursor-pointer min-h-[32px]',
                competitionFilter === leagueId
                  ? 'text-zinc-900'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700',
              ].join(' ')}
              style={
                competitionFilter === leagueId
                  ? { backgroundColor: 'var(--club-primary)', color: 'var(--club-text-on-primary)' }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Próximos Jogos (upcoming + live) ── */}
      {activeTab === 'schedule' && (
        <>
          {scheduleLoading && (
            <div className="space-y-4" role="status" aria-label="Carregando jogos">
              <MatchCardSkeleton />
              <MatchCardSkeleton />
              <MatchCardSkeleton />
            </div>
          )}

          {scheduleError && (
            <p className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400 font-sans">
              Não foi possível carregar os jogos. Tente novamente.
            </p>
          )}

          {!scheduleLoading && !scheduleError && scheduleGroups.length === 0 && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-8 text-center font-sans space-y-2">
              <p className="text-sm text-zinc-400">
                Nenhum jogo encontrado para {club.name}.
              </p>
              <p className="text-xs text-zinc-600">
                O calendário da temporada ainda não foi divulgado na íntegra — novos jogos aparecem automaticamente quando confirmados.
              </p>
            </div>
          )}

          {!scheduleLoading && !scheduleError && scheduleGroups.length > 0 && (
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
              {competitionFilter === null && upcomingMatches.length < 4 && (
                <p className="mt-6 text-center text-xs text-zinc-600 font-sans">
                  Restante do calendário ainda não divulgado — novos jogos aparecem automaticamente quando confirmados.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Resultados (past matches, all sources) ── */}
      {activeTab === 'past' && (
        <>
          {/* Loading skeletons — shown per-source while each is still loading */}
          {showSerieAResults && pastLoading && (
            <div className="space-y-4" role="status" aria-label="Carregando resultados do Brasileirão">
              <MatchCardSkeleton />
              <MatchCardSkeleton />
              <MatchCardSkeleton />
            </div>
          )}
          {showOtherResults && otherResultsLoading && otherResults === null && !pastLoading && (
            <div className="space-y-4" role="status" aria-label="Carregando outros resultados">
              <MatchCardSkeleton />
              <MatchCardSkeleton />
            </div>
          )}

          {/* Merged result list — rendered as soon as at least one source has data */}
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
                      prefetchedMatchDocs={pastMatchDocs[entry.match.idJogo]}
                      preview={undefined}
                      previewLoading={false}
                      noEmailGate
                    />
                  );
                }

                // CONMEBOL sources use conmebolId for highlight; others use apiFootballId
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

          {resultsEmpty && (
            <p className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400 font-sans">
              Sem resultados anteriores disponíveis.
            </p>
          )}
        </>
      )}
    </section>
  );
}
