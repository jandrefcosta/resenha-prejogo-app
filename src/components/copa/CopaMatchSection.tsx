'use client';

import { useEffect, useRef, useState } from 'react';
import { MatchCard } from '@/components/MatchCard';
import { LIVE_WINDOW_MS } from '@/lib/matchConstants';
import { CopaMatchRow, DateSeparator } from '@/components/copa/CopaMatchRow';
import type { Match, BroadcasterInfo } from '@/lib/types';
import type { CopaFixturesPayload } from '@/app/api/copa/fixtures/route';
import type { CopaStandingsPayload } from '@/app/api/copa/standings/route';
import { PHASE_ORDER } from '@/app/api/copa/fixtures/route';

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAZIL_TEAM_ID = '6';
const BRT = 'America/Sao_Paulo';
const BRAZIL_GROUP = 'C';
const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const ROUND_ORDER = ['Rodada 1', 'Rodada 2', 'Rodada 3'];

/** Maps phase tab key → display label */
const TAB_LABELS: Record<string, string> = {
  'Grupos':          '⚽ Grupos',
  'Round of 16':     'Oitavas',
  'Quarter-finals':  'Quartas',
  'Semi-finals':     'Semis',
  '3rd Place Final': '3º Lugar',
  'Final':           'Final',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBrazilMatch(match: Match): boolean {
  return match.homeTeam.id === BRAZIL_TEAM_ID || match.awayTeam.id === BRAZIL_TEAM_ID;
}

function isUpcomingOrLive(match: Match): boolean {
  if (match.status === 'postponed') return true;
  return Date.now() <= new Date(match.date).getTime() + LIVE_WINDOW_MS;
}

function getDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: BRT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function enrichWithGroup(match: Match, teamGroupMap: Record<string, string>): Match {
  if (match.group) return match;
  const group = teamGroupMap[match.homeTeam.id] ?? teamGroupMap[match.awayTeam.id];
  return group ? { ...match, group } : match;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse">
      <div className="grid grid-cols-[1fr_auto_1fr_16px] items-center px-4 py-3 gap-x-3">
        <div className="h-4 bg-zinc-800 rounded w-2/3 ml-auto" />
        <div className="w-[52px] h-5 bg-zinc-800 rounded" />
        <div className="h-4 bg-zinc-800 rounded w-2/3" />
        <div className="w-3 h-3 bg-zinc-800 rounded" />
      </div>
    </div>
  );
}

// ─── Phase tab navigation ─────────────────────────────────────────────────────

function PhaseTabs({
  availablePhases,
  activePhase,
  onSelect,
}: {
  availablePhases: string[];
  activePhase: string;
  onSelect: (phase: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-5 scrollbar-none">
      {PHASE_ORDER.filter((p) => availablePhases.includes(p)).map((phase) => {
        const isActive = activePhase === phase;
        return (
          <button
            key={phase}
            onClick={() => onSelect(phase)}
            className={[
              'shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold font-sans transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50',
              isActive
                ? 'bg-[#009C3B] text-white shadow-[0_0_12px_rgba(0,156,59,0.35)]'
                : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100',
            ].join(' ')}
            aria-pressed={isActive}
          >
            {TAB_LABELS[phase] ?? phase}
          </button>
        );
      })}
    </div>
  );
}

// ─── Round selector (within Grupos tab) ──────────────────────────────────────

function RoundSelector({
  rounds,
  activeRound,
  onSelect,
}: {
  rounds: string[];
  activeRound: string;
  onSelect: (r: string) => void;
}) {
  return (
    <div className="flex gap-1.5 mb-4">
      {rounds.map((r) => {
        const isActive = r === activeRound;
        return (
          <button
            key={r}
            onClick={() => onSelect(r)}
            className={[
              'flex-1 py-2 rounded-lg text-xs font-bold font-display tracking-wide transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50',
              isActive
                ? 'bg-[#009C3B] text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100',
            ].join(' ')}
            aria-pressed={isActive}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

// ─── Group filter pills ────────────────────────────────────────────────────────

function GroupFilter({
  active,
  onChange,
}: {
  active: string;
  onChange: (g: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-4 scrollbar-none">
      {['Todos', ...GROUP_LETTERS].map((g) => {
        const isBrazilGroup = g === BRAZIL_GROUP;
        const isActive = g === active;
        return (
          <button
            key={g}
            onClick={() => onChange(g)}
            className={[
              'shrink-0 px-2.5 py-1 rounded-md text-xs font-bold font-display transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/50',
              isActive
                ? 'bg-white/15 text-white'
                : isBrazilGroup
                  ? 'text-amber-400 bg-zinc-800 hover:bg-zinc-700'
                  : 'bg-zinc-800/60 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300',
            ].join(' ')}
            aria-pressed={isActive}
          >
            {g}
            {isBrazilGroup && <span className="ml-0.5 text-[8px]">🇧🇷</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CopaMatchSection() {
  const [payload, setPayload] = useState<CopaFixturesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [activePhase, setActivePhase] = useState<string>('Grupos');
  const [activeRound, setActiveRound] = useState<string>('Rodada 1');
  const [activeGroup, setActiveGroup] = useState<string>('Todos');
  const [teamGroupMap, setTeamGroupMap] = useState<Record<string, string>>({});
  const [broadcastersById, setBroadcastersById] = useState<Record<string, BroadcasterInfo[]>>({});

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch('/api/copa/fixtures')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CopaFixturesPayload>;
      })
      .then((data) => {
        setPayload(data);
        setLoading(false);

        // Pré-busca de transmissão para os jogos da janela de 7 dias.
        const now = Date.now();
        const windowEnd = now + 7 * 24 * 60 * 60 * 1000;
        const windowIds = Object.values(data.phases)
          .flat()
          .filter((m) => {
            const t = new Date(m.date).getTime();
            return t >= now - LIVE_WINDOW_MS && t <= windowEnd;
          })
          .map((m) => m.id)
          .slice(0, 32);
        if (windowIds.length > 0) {
          fetch(`/api/copa/broadcasters?ids=${windowIds.join(',')}`)
            .then((r) =>
              r.ok
                ? (r.json() as Promise<Record<string, BroadcasterInfo[]>>)
                : Promise.reject(),
            )
            .then((map) => setBroadcastersById(map))
            .catch(() => {
              // Falhou — cada card busca sob demanda ao expandir.
            });
        }

        // Auto-select first available phase
        const available = PHASE_ORDER.filter((p) => (data.phases[p]?.length ?? 0) > 0);
        if (available.length > 0) setActivePhase(available[0]);

        // Auto-select the round that has the next upcoming match
        const grupos = data.phases['Grupos'] ?? [];
        const liveOrNext = grupos.find(
          (m) => m.status === 'scheduled' || m.status === 'postponed',
        );
        setActiveRound(liveOrNext?.round ?? 'Rodada 3');

        // Fetch standings to derive group letters — fire and forget
        fetch('/api/copa/standings')
          .then((r) => (r.ok ? (r.json() as Promise<CopaStandingsPayload>) : Promise.reject()))
          .then((s) => {
            const map: Record<string, string> = {};
            for (const [letter, entries] of Object.entries(s.groups)) {
              // Defensive: only real A–L groups feed the team→group map. A stray
              // block (e.g. a mislabelled third-place ranking) must never
              // overwrite a team's real group and drop its match from a filter.
              if (!GROUP_LETTERS.includes(letter)) continue;
              for (const entry of entries) {
                map[String(entry.team.id)] = letter;
              }
            }
            setTeamGroupMap(map);
          })
          .catch(() => {
            // Silently fail — group filter pills simply won't appear
          });
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────────

  const phases = payload?.phases ?? {};
  const availablePhases = PHASE_ORDER.filter((p) => (phases[p]?.length ?? 0) > 0);

  const gruposMatches: Match[] = phases['Grupos'] ?? [];
  const availableRounds = ROUND_ORDER.filter((r) => gruposMatches.some((m) => m.round === r));

  // Enrich with group letter from standings data
  const hasGroupData = Object.keys(teamGroupMap).length > 0;

  const roundMatches = gruposMatches
    .filter((m) => m.round === activeRound)
    .map((m) => enrichWithGroup(m, teamGroupMap));

  const filteredMatches =
    activeGroup === 'Todos' || !hasGroupData
      ? roundMatches
      : roundMatches.filter((m) => m.group === activeGroup);

  // Brazil's next upcoming match (for auto-expand)
  const nextBrazilMatch = gruposMatches
    .filter((m) => isBrazilMatch(m) && isUpcomingOrLive(m))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  // Group filtered matches by date (Brasília TZ)
  type DateGroup = { dateKey: string; isoRef: string; matches: Match[] };
  const byDate: DateGroup[] = [];
  for (const m of filteredMatches) {
    const key = getDateKey(m.date);
    const existing = byDate.find((d) => d.dateKey === key);
    if (existing) {
      existing.matches.push(m);
    } else {
      byDate.push({ dateKey: key, isoRef: m.date, matches: [m] });
    }
  }

  // Active matches for knockout tabs
  const activeMatches: Match[] = phases[activePhase] ?? [];

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Phase tabs skeleton */}
        <div className="flex gap-2 mb-5">
          {['⚽ Grupos', 'Oitavas', 'Quartas'].map((l) => (
            <div key={l} className="h-7 w-20 rounded-full bg-zinc-800 animate-pulse" />
          ))}
        </div>
        {/* Round selector skeleton */}
        <div className="flex gap-1.5 mb-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-1 h-8 rounded-lg bg-zinc-800 animate-pulse" />
          ))}
        </div>
        {/* Row skeletons */}
        {Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <span className="text-2xl" aria-hidden="true">⚽</span>
        <p className="text-sm text-zinc-400 font-sans">
          Não foi possível carregar os jogos da Copa do Mundo.
        </p>
      </div>
    );
  }

  if (!payload || availablePhases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <span className="text-2xl" aria-hidden="true">🗓️</span>
        <p className="text-sm text-zinc-400 font-sans">
          Os jogos da Copa do Mundo 2026 ainda não foram divulgados.
        </p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Phase tabs */}
      <PhaseTabs
        availablePhases={availablePhases}
        activePhase={activePhase}
        onSelect={(p) => {
          setActivePhase(p);
          setActiveGroup('Todos');
        }}
      />

      {/* ── Grupos tab ─────────────────────────────────────────────────────── */}
      {activePhase === 'Grupos' && (
        <>
          <RoundSelector
            rounds={availableRounds}
            activeRound={activeRound}
            onSelect={(r) => {
              setActiveRound(r);
              setActiveGroup('Todos');
            }}
          />

          {/* Group filter — only shown once standings data is available */}
          {hasGroupData && (
            <GroupFilter active={activeGroup} onChange={setActiveGroup} />
          )}

          {filteredMatches.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8 font-sans">
              Nenhum jogo encontrado.
            </p>
          ) : (
            <div className="space-y-1">
              {byDate.map(({ dateKey, isoRef, matches }) => (
                <div key={dateKey}>
                  <DateSeparator iso={isoRef} />
                  <div className="space-y-1">
                    {matches.map((match) => (
                      <CopaMatchRow
                        key={match.id}
                        match={match}
                        isBrazil={isBrazilMatch(match)}
                        defaultExpanded={match.id === nextBrazilMatch?.id}
                        prefetchedBroadcasters={broadcastersById[match.id]}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Knockout tabs ──────────────────────────────────────────────────── */}
      {activePhase !== 'Grupos' && (
        <div className="space-y-3">
          {activeMatches.map((match) => (
            <div
              key={match.id}
              className={isBrazilMatch(match) ? 'ring-1 ring-amber-400/30 rounded-2xl' : ''}
            >
              <MatchCard
                match={match}
                highlightClubId={BRAZIL_TEAM_ID}
                preview={
                  broadcastersById[match.id] !== undefined
                    ? { broadcasters: broadcastersById[match.id], homeForm: [], awayForm: [] }
                    : undefined
                }
                previewLoading={false}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
