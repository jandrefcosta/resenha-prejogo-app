'use client';

import React, { useEffect, useRef, useState } from 'react';
import { TableCellsIcon, ArrowPathIcon } from '@heroicons/react/20/solid';
import { useTheme } from '@/components/ThemeProvider';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useScrollLock } from '@/lib/useScrollLock';
import { COMPETITIONS } from '@/data/competitions';
import type { Competition } from '@/data/competitions';
import type { StandingEntry, CopaBracketData, CopaBracketFixture } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

// Include all club competitions — Copa do Brasil now has its own bracket view.
const STANDINGS_COMPETITIONS = COMPETITIONS.filter((c) => c.scope === 'club');

interface StandingsResponse {
  groups: StandingEntry[][];
  format: 'pontos-corridos' | 'grupos' | 'mata-mata';
  updatedAt: string;
}

// ─── Trigger button ───────────────────────────────────────────────────────────
export function StandingsButton() {
  const [open, setOpen] = useState(false);
  useScrollLock(open);

  function openModal() {
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 cursor-pointer backdrop-blur-sm"
        aria-label="Ver tabela de classificação"
      >
        <TableCellsIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Tabela</span>
      </button>
      {open && <StandingsModal onClose={closeModal} />}
    </>
  );
}

// ─── Zone colour coding ───────────────────────────────────────────────────────
const ZONE_HIGHLIGHTED = { bg: 'rgba(251,191,36,0.13)', border: '#fbbf24' };   // amber
const ZONES: { match: string[]; bg: string; border: string }[] = [
  { match: ['libertadores', 'champions'], bg: 'rgba(34,197,94,0.10)',   border: '#22c55e' },
  { match: ['sul-americana', 'sul americana', 'sudamericana', 'copa sudamericana', 'europa'], bg: 'rgba(56,189,248,0.14)', border: '#38bdf8' },
  { match: ['relegation', 'rebaixamento'], bg: 'rgba(239,68,68,0.10)',   border: '#ef4444' },
];

function zoneStyle(description: string | null): { bg: string; border: string } {
  if (!description) return { bg: '', border: '' };
  const d = description.toLowerCase();
  const zone = ZONES.find((z) => z.match.some((kw) => d.includes(kw)));
  return zone ? { bg: zone.bg, border: zone.border } : { bg: '', border: '' };
}

// ─── Form badge ───────────────────────────────────────────────────────────────
function MiniForm({ form }: { form: string }) {
  const last5 = form.slice(-5).split('');
  const map: Record<string, string> = { W: 'bg-green-600', D: 'bg-amber-500', L: 'bg-red-700' };
  return (
    <div className="flex gap-0.5">
      {last5.map((r, i) => (
        <span key={i} className={`w-1.5 h-4 rounded-sm ${map[r] ?? 'bg-zinc-600'}`} title={r} />
      ))}
    </div>
  );
}

// ─── Group table (Libertadores / Sul-Americana) ───────────────────────────────
function GroupTable({
  entries,
  groupLabel,
  highlightTeamId,
}: {
  entries: StandingEntry[];
  groupLabel: string;
  highlightTeamId?: number;
}) {
  return (
    <div className="mb-1">
      <div className="px-4 pt-3 pb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 font-sans">
          {groupLabel}
        </span>
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {entries.map((entry) => {
            const isHighlighted =
              highlightTeamId !== undefined && entry.team.id === highlightTeamId;
            const zone = zoneStyle(entry.description);
            const { bg, border } = isHighlighted ? ZONE_HIGHLIGHTED : zone;
            const rowStyle: React.CSSProperties = {
              ...(bg ? { backgroundColor: bg } : {}),
              ...(border ? { borderLeftColor: border, borderLeftWidth: 2, borderLeftStyle: 'solid' } : {}),
            };
            return (
              <tr
                key={entry.team.id}
                style={rowStyle}
                className={[
                  'grid grid-cols-[22px_1fr_30px_24px_24px_24px_24px_30px] px-3 py-1.5 items-center',
                  'border-b border-zinc-800/50 last:border-0',
                  !isHighlighted && !zone.border ? 'hover:bg-zinc-800/40' : '',
                ].join(' ')}
              >
                <td className="text-center">
                  <span
                    className="text-xs font-bold tabular-nums font-display"
                    style={{ color: isHighlighted ? '#fbbf24' : '#a1a1aa' }}
                  >
                    {entry.rank}
                  </span>
                </td>
                <td className="flex items-center gap-1.5 min-w-0">
                  <img
                    src={entry.team.logo}
                    alt=""
                    width={16}
                    height={16}
                    className="object-contain shrink-0"
                    aria-hidden="true"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span className={`text-xs truncate font-sans ${isHighlighted ? 'text-white font-bold' : 'text-zinc-300'}`}>
                    {entry.team.name}
                  </span>
                </td>
                <td className="text-center">
                  <span className={`text-xs font-bold tabular-nums font-display ${isHighlighted ? 'text-white' : 'text-zinc-100'}`}>
                    {entry.points}
                  </span>
                </td>
                <td className="text-center">
                  <span className="text-xs tabular-nums text-zinc-400 font-sans">{entry.all.played}</span>
                </td>
                <td className="text-center">
                  <span className="text-xs tabular-nums text-zinc-400 font-sans">{entry.all.win}</span>
                </td>
                <td className="text-center">
                  <span className="text-xs tabular-nums text-zinc-400 font-sans">{entry.all.draw}</span>
                </td>
                <td className="text-center">
                  <span className="text-xs tabular-nums text-zinc-400 font-sans">{entry.all.lose}</span>
                </td>
                <td className="text-center">
                  <span
                    className={`text-xs tabular-nums font-sans ${entry.goalsDiff > 0 ? 'text-green-400' : entry.goalsDiff < 0 ? 'text-red-400' : 'text-zinc-400'}`}
                  >
                    {entry.goalsDiff > 0 ? `+${entry.goalsDiff}` : entry.goalsDiff}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Copa do Brasil bracket view ─────────────────────────────────────────────

function TeamLogo({ src, name }: { src: string; name: string }) {
  const [err, setErr] = React.useState(false);
  if (err) return null;
  return (
    <img src={src} alt="" width={20} height={20}
      className="object-contain shrink-0" aria-hidden="true"
      onError={() => setErr(true)} />
  );
}

function FixtureRow({ fixture, highlightTeamId }: { fixture: CopaBracketFixture; highlightTeamId?: number }) {
  const homeHighlight = highlightTeamId === fixture.home.id;
  const awayHighlight = highlightTeamId === fixture.away.id;
  const hasPen = fixture.homePen !== null && fixture.awayPen !== null;

  const scoreColor = (isWinner: boolean | null) =>
    isWinner === true ? 'text-white font-bold' : isWinner === false ? 'text-zinc-600' : 'text-zinc-400';

  const homeWon = fixture.winner === 'home';
  const awayWon = fixture.winner === 'away';

  return (
    <div className={[
      'grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2.5 border-b border-zinc-800/50 last:border-0',
      (homeHighlight || awayHighlight) ? 'bg-amber-400/5' : 'hover:bg-zinc-800/30',
    ].join(' ')}>
      {/* Home */}
      <div className={['flex items-center justify-end gap-1.5 min-w-0', homeHighlight ? 'text-white' : 'text-zinc-300'].join(' ')}>
        <span className="text-xs font-sans truncate">{fixture.home.name}</span>
        <TeamLogo src={fixture.home.logo} name={fixture.home.name} />
      </div>

      {/* Score / status */}
      <div className="flex items-center gap-1 shrink-0 tabular-nums font-display">
        {fixture.status === 'scheduled' ? (
          <span className="text-xs text-zinc-600 font-sans px-1">
            {fixture.date
              ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(fixture.date))
              : '–'}
          </span>
        ) : fixture.status === 'live' ? (
          <span className="text-xs text-green-400 font-bold font-sans px-1 animate-pulse">Ao vivo</span>
        ) : (
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1">
              <span className={`text-sm ${scoreColor(homeWon)}`}>{fixture.homeScore ?? '–'}</span>
              <span className="text-zinc-600 text-xs">–</span>
              <span className={`text-sm ${scoreColor(awayWon)}`}>{fixture.awayScore ?? '–'}</span>
            </div>
            {hasPen && (
              <span className="text-[9px] text-zinc-600 font-sans leading-none">
                ({fixture.homePen} – {fixture.awayPen} pen.)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Away */}
      <div className={['flex items-center gap-1.5 min-w-0', awayHighlight ? 'text-white' : 'text-zinc-300'].join(' ')}>
        <TeamLogo src={fixture.away.logo} name={fixture.away.name} />
        <span className="text-xs font-sans truncate">{fixture.away.name}</span>
      </div>
    </div>
  );
}

function CopaBracketView({ data, highlightTeamId }: { data: CopaBracketData; highlightTeamId?: number }) {
  // Default to the most advanced round that has scheduled fixtures, or last round
  const defaultRound = data.rounds.findLast((r) => r.fixtures.some((f) => f.status === 'scheduled'))
    ?? data.rounds[data.rounds.length - 1];
  const [selectedRound, setSelectedRound] = React.useState(defaultRound?.name ?? '');

  const round = data.rounds.find((r) => r.name === selectedRound) ?? data.rounds[0];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Round tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-zinc-800 shrink-0 overflow-x-auto scrollbar-none">
        {data.rounds.map((r) => {
          const active = r.name === selectedRound;
          const allDone = r.fixtures.every((f) => f.status === 'finished');
          return (
            <button key={r.name} onClick={() => setSelectedRound(r.name)}
              className={[
                'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold font-sans transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1',
                active ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
              ].join(' ')}>
              {r.label}
              {allDone && <span className="text-[9px] text-zinc-600">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Fixtures */}
      <div className="overflow-y-auto flex-1">
        {round?.fixtures.map((f) => (
          <FixtureRow key={f.fixtureId} fixture={f} highlightTeamId={highlightTeamId} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function StandingsModal({ onClose }: { onClose: () => void }) {
  const { club } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);
  useFocusTrap(panelRef, onClose);

  const [selectedComp, setSelectedComp] = useState<Competition>(STANDINGS_COMPETITIONS[0]);
  const selectedCompRef = useRef(selectedComp);
  selectedCompRef.current = selectedComp;

  const [groups, setGroups] = useState<StandingEntry[][] | null>(null);
  const [format, setFormat] = useState<StandingsResponse['format'] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const [bracketData, setBracketData] = useState<CopaBracketData | null>(null);
  const [bracketStatus, setBracketStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const isCopa = selectedComp.id === 'copa-brasil';

  function fetchStandings(force = false) {
    const compId = selectedCompRef.current.id;
    if (force) setRefreshing(true);
    else setStatus('loading');

    fetch(`/api/standings?competition=${compId}${force ? '&force=1' : ''}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<StandingsResponse>;
      })
      .then(({ groups: g, format: f, updatedAt: ua }) => {
        setGroups(g);
        setFormat(f);
        setUpdatedAt(ua);
        setStatus('done');
      })
      .catch(() => setStatus('error'))
      .finally(() => setRefreshing(false));
  }

  function fetchBracket(force = false) {
    if (!force && bracketStatus === 'done') return;
    setBracketStatus('loading');
    fetch(`/api/copa-bracket${force ? '?force=1' : ''}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<CopaBracketData>; })
      .then((d) => { setBracketData(d); setBracketStatus('done'); })
      .catch(() => setBracketStatus('error'));
  }

  // Initial fetch
  useEffect(() => {
    if (isCopa) fetchBracket();
    else fetchStandings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch when competition tab changes (skip on mount — initial fetch covers it)
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    if (selectedCompRef.current.id === 'copa-brasil') fetchBracket();
    else fetchStandings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComp]);

  // Auto-refresh silencioso se o cache estiver com mais de 30min ao abrir
  useEffect(() => {
    if (status !== 'done' || !updatedAt) return;
    const ageMs = Date.now() - new Date(updatedAt).getTime();
    if (ageMs > 30 * 60 * 1000) {
      fetchStandings(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Scroll highlighted row into view once data is ready (pontos-corridos only)
  useEffect(() => {
    if (status === 'done' && format === 'pontos-corridos' && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [status, format]);

  function formatAge(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'agora mesmo';
    if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
    const h = Math.floor(diff / 3600);
    return `há ${h}h${Math.floor((diff % 3600) / 60).toString().padStart(2, '0')}`;
  }

  const highlightTeamId = club?.apiFootballId ?? undefined;
  const mainGroup = groups?.[0] ?? [];

  return (
    <div
      className="fixed inset-x-0 top-0 h-dvh z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tabela de classificação"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[85dvh] rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <p className="text-sm font-bold text-white font-display uppercase tracking-wide">
              {isCopa ? 'Copa do Brasil' : 'Tabela de Classificação'}
            </p>
            <p className="text-xs text-zinc-500 font-sans mt-0.5">
              Temporada 2026
              {!isCopa && updatedAt && (
                <span className="ml-1.5 text-zinc-600">· Atualizada {formatAge(updatedAt)}</span>
              )}
              {isCopa && bracketData && (
                <span className="ml-1.5 text-zinc-600">· Atualizada {formatAge(bracketData.updatedAt)}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {((!isCopa && status === 'done') || (isCopa && bracketStatus === 'done')) && (
              <button
                onClick={() => isCopa ? fetchBracket(true) : fetchStandings(true)}
                disabled={refreshing || bracketStatus === 'loading'}
                className="h-8 w-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Atualizar"
              >
                <ArrowPathIcon className={`w-4 h-4 shrink-0 transition-transform ${(refreshing || bracketStatus === 'loading') ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            )}
            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer text-lg leading-none"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        </div>

        {/* Competition tabs */}
        <div className="flex gap-1 px-3 py-2 border-b border-zinc-800 shrink-0 overflow-x-auto scrollbar-none">
          {STANDINGS_COMPETITIONS.map((comp) => {
            const active = comp.id === selectedComp.id;
            return (
              <button
                key={comp.id}
                onClick={() => setSelectedComp(comp)}
                className={[
                  'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold font-sans transition-colors cursor-pointer whitespace-nowrap',
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
                ].join(' ')}
              >
                {comp.shortName}
              </button>
            );
          })}
        </div>

        {/* Copa do Brasil — bracket view */}
        {isCopa && bracketStatus === 'loading' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="space-y-2 w-full animate-pulse">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 bg-zinc-800 rounded" />
              ))}
            </div>
          </div>
        )}
        {isCopa && bracketStatus === 'error' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-sm text-zinc-400 font-sans text-center">
              Não foi possível carregar os confrontos. Tente novamente.
            </p>
          </div>
        )}
        {isCopa && bracketStatus === 'done' && bracketData && (
          <CopaBracketView data={bracketData} highlightTeamId={highlightTeamId} />
        )}

        {/* Loading (standings) */}
        {!isCopa && status === 'loading' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="space-y-2 w-full animate-pulse">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 bg-zinc-800 rounded" />
              ))}
            </div>
          </div>
        )}

        {/* Error (standings) */}
        {!isCopa && status === 'error' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-sm text-zinc-400 font-sans text-center">
              Não foi possível carregar a tabela. Tente novamente.
            </p>
          </div>
        )}

        {/* Pontos corridos (Série A) */}
        {status === 'done' && format === 'pontos-corridos' && groups && (
          <div className="overflow-y-auto flex-1">
            {/* Zone legend */}
            <div className="px-4 py-2 flex flex-wrap gap-3 border-b border-zinc-800/60 shrink-0">
              {[
                { color: '#22c55e', label: 'Libertadores' },
                { color: '#38bdf8', label: 'Sul-Americana' },
                { color: '#ef4444', label: 'Rebaixamento' },
                { color: '#fbbf24', label: 'Seu time' },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-zinc-500 font-sans">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: color }} />
                  {label}
                </span>
              ))}
            </div>

            {/* Column headers */}
            <div className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 z-10">
              <div className="grid grid-cols-[24px_22px_32px_26px_26px_26px_26px_32px_32px_32px_44px] sm:grid-cols-[28px_1fr_36px_28px_28px_28px_28px_36px_36px_36px_52px] gap-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">
                <span className="text-center">#</span>
                <span></span>
                <span className="text-center">Pts</span>
                <span className="text-center">J</span>
                <span className="text-center">V</span>
                <span className="text-center">E</span>
                <span className="text-center">D</span>
                <span className="text-center">GP</span>
                <span className="text-center">GC</span>
                <span className="text-center">SG</span>
                <span className="text-center">Forma</span>
              </div>
            </div>

            <table className="w-full border-collapse">
              <tbody>
                {mainGroup.map((entry) => {
                  const isHighlighted =
                    highlightTeamId !== undefined &&
                    highlightTeamId !== null &&
                    entry.team.id === highlightTeamId;
                  const zone = zoneStyle(entry.description);

                  const { bg, border } = isHighlighted ? ZONE_HIGHLIGHTED : zone;

                  const rowStyle: React.CSSProperties = {
                    ...(bg ? { backgroundColor: bg } : {}),
                    ...(border ? { borderLeftColor: border, borderLeftWidth: 2, borderLeftStyle: 'solid' } : {}),
                  };

                  return (
                    <tr
                      key={entry.team.id}
                      ref={isHighlighted ? highlightRef : undefined}
                      style={rowStyle}
                      className={[
                      'grid grid-cols-[24px_22px_32px_26px_26px_26px_26px_32px_32px_32px_44px] sm:grid-cols-[28px_1fr_36px_28px_28px_28px_28px_36px_36px_36px_52px] gap-0 px-3 py-2 items-center',
                        'border-b border-zinc-800/50 transition-colors',
                        !isHighlighted && !zone.border ? 'hover:bg-zinc-800/40' : '',
                      ].join(' ')}
                    >
                      {/* Rank */}
                      <td className="text-center">
                        <span
                          className="text-xs font-bold tabular-nums font-display"
                          style={{ color: isHighlighted ? '#fbbf24' : '#a1a1aa' }}
                        >
                          {entry.rank}
                        </span>
                      </td>

                      {/* Team */}
                      <td className="flex items-center gap-2 min-w-0">
                        <img
                          src={entry.team.logo}
                          alt=""
                          width={18}
                          height={18}
                          className="object-contain shrink-0"
                          aria-hidden="true"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span
                          className={`hidden sm:block text-xs font-medium truncate font-sans ${isHighlighted ? 'text-white font-bold' : 'text-zinc-300'}`}
                        >
                          {entry.team.name}
                        </span>
                      </td>

                      {/* Pts */}
                      <td className="text-center">
                        <span className={`text-xs font-bold tabular-nums font-display ${isHighlighted ? 'text-white' : 'text-zinc-100'}`}>
                          {entry.points}
                        </span>
                      </td>

                      {/* J */}
                      <td className="text-center">
                        <span className="text-xs tabular-nums text-zinc-400 font-sans">{entry.all.played}</span>
                      </td>

                      {/* V */}
                      <td className="text-center">
                        <span className="text-xs tabular-nums text-zinc-400 font-sans">{entry.all.win}</span>
                      </td>

                      {/* E */}
                      <td className="text-center">
                        <span className="text-xs tabular-nums text-zinc-400 font-sans">{entry.all.draw}</span>
                      </td>

                      {/* D */}
                      <td className="text-center">
                        <span className="text-xs tabular-nums text-zinc-400 font-sans">{entry.all.lose}</span>
                      </td>

                      {/* GP */}
                      <td className="text-center">
                        <span className="text-xs tabular-nums text-zinc-400 font-sans">{entry.all.goals.for}</span>
                      </td>

                      {/* GC */}
                      <td className="text-center">
                        <span className="text-xs tabular-nums text-zinc-400 font-sans">{entry.all.goals.against}</span>
                      </td>

                      {/* SG */}
                      <td className="text-center">
                        <span
                          className={`text-xs tabular-nums font-sans ${entry.goalsDiff > 0 ? 'text-green-400' : entry.goalsDiff < 0 ? 'text-red-400' : 'text-zinc-400'}`}
                        >
                          {entry.goalsDiff > 0 ? `+${entry.goalsDiff}` : entry.goalsDiff}
                        </span>
                      </td>

                      {/* Forma */}
                      <td className="flex justify-center">
                        <MiniForm form={entry.form} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Grupos (Libertadores / Sul-Americana) */}
        {status === 'done' && format === 'grupos' && groups && (
          <div className="overflow-y-auto flex-1">
            {/* Column headers (sticky) */}
            <div className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 z-10">
              <div className="grid grid-cols-[22px_1fr_30px_24px_24px_24px_24px_30px] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">
                <span className="text-center">#</span>
                <span></span>
                <span className="text-center">Pts</span>
                <span className="text-center">J</span>
                <span className="text-center">V</span>
                <span className="text-center">E</span>
                <span className="text-center">D</span>
                <span className="text-center">SG</span>
              </div>
            </div>

            {groups.length === 0 && (
              <p className="py-8 text-center text-sm text-zinc-500 font-sans">
                Grupos ainda não disponíveis.
              </p>
            )}

            {groups.map((groupEntries, idx) => (
              <GroupTable
                key={idx}
                entries={groupEntries}
                groupLabel={`Grupo ${String.fromCharCode(65 + idx)}`}
                highlightTeamId={highlightTeamId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
