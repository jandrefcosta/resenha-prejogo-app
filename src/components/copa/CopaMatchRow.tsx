'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { MatchCard } from '@/components/MatchCard';
import type { Match, BroadcasterInfo } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAZIL_TEAM_ID = '6';
const BRT = 'America/Sao_Paulo';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BRT,
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      timeZone: BRT,
    })
    .replace('.', '');
}

// ─── Team flag/logo ───────────────────────────────────────────────────────────

function TeamLogo({ src, name }: { src?: string; name: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <span
        className="shrink-0 w-[22px] h-[22px] rounded-sm bg-zinc-700 flex items-center justify-center text-[8px] font-bold font-display text-zinc-400"
        aria-hidden="true"
      >
        {name.substring(0, 3).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={22}
      height={22}
      aria-hidden="true"
      className="object-contain shrink-0 rounded-sm"
      onError={() => setErr(true)}
    />
  );
}

// ─── Date separator ───────────────────────────────────────────────────────────

export function DateSeparator({ iso }: { iso: string }) {
  const label = new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: BRT,
  });
  return (
    <div className="flex items-center gap-2 mt-4 first:mt-0 mb-1.5 px-1">
      <div className="flex-1 h-px bg-zinc-800" />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 font-sans px-2 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

// ─── Match row ────────────────────────────────────────────────────────────────

interface CopaMatchRowProps {
  match: Match;
  isBrazil: boolean;
  defaultExpanded?: boolean;
  /** Broadcasters já pré-buscados pela seção (janela de 7d). undefined → busca sob demanda. */
  prefetchedBroadcasters?: BroadcasterInfo[];
}

export function CopaMatchRow({
  match,
  isBrazil,
  defaultExpanded = false,
  prefetchedBroadcasters,
}: CopaMatchRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Transmissão: usa o prefetch da janela; senão busca sob demanda ao expandir.
  const [fetched, setFetched] = useState<BroadcasterInfo[] | null>(null);
  const [loadingBroadcasters, setLoadingBroadcasters] = useState(false);
  const broadcasterFetchTried = useRef(false);

  useEffect(() => {
    if (!expanded) return;
    if (prefetchedBroadcasters !== undefined) return; // já temos via prefetch
    if (broadcasterFetchTried.current) return;
    broadcasterFetchTried.current = true;
    setLoadingBroadcasters(true);
    fetch(`/api/copa/broadcasters?ids=${match.id}`)
      .then((r) =>
        r.ok ? (r.json() as Promise<Record<string, BroadcasterInfo[]>>) : Promise.reject(),
      )
      .then((data) => setFetched(data[match.id] ?? []))
      .catch(() => setFetched([]))
      .finally(() => setLoadingBroadcasters(false));
  }, [expanded, prefetchedBroadcasters, match.id]);

  const broadcasters = prefetchedBroadcasters ?? fetched ?? [];

  const isFinished = match.status === 'finished';
  const homeScore = match.score?.home;
  const awayScore = match.score?.away;

  return (
    <div
      className={[
        'rounded-xl overflow-hidden transition-colors',
        isBrazil
          ? 'border-l-2 border-amber-400 bg-amber-400/[0.04] border-y border-r border-amber-400/20'
          : 'bg-zinc-900 border border-zinc-800 hover:border-zinc-700',
      ].join(' ')}
    >
      {/* Compact row — clickable button */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/50"
        aria-expanded={expanded}
        aria-label={`${match.homeTeam.name} vs ${match.awayTeam.name} — ${expanded ? 'fechar' : 'expandir'}`}
      >
        <div className="grid grid-cols-[1fr_auto_1fr_16px] items-center px-4 py-3 gap-x-3">

          {/* Left: home team (right-aligned) */}
          <div className="flex items-center justify-end gap-2 min-w-0">
            <span
              className={[
                'text-sm truncate text-right leading-tight font-sans',
                isBrazil && match.homeTeam.id === BRAZIL_TEAM_ID
                  ? 'text-white font-semibold'
                  : 'text-zinc-200',
              ].join(' ')}
            >
              {match.homeTeam.name}
            </span>
            <TeamLogo src={match.homeTeam.logo} name={match.homeTeam.name} />
          </div>

          {/* Center: score or kickoff time */}
          <div className="flex flex-col items-center shrink-0 w-[52px]">
            {isFinished ? (
              <span className="text-base font-black font-display tabular-nums text-white leading-none">
                {homeScore ?? '?'}–{awayScore ?? '?'}
              </span>
            ) : (
              <>
                <span className="text-sm font-semibold font-display tabular-nums text-zinc-300 leading-none">
                  {formatKickoff(match.date)}
                </span>
                <span className="text-[10px] font-sans text-zinc-600 mt-0.5 leading-none">
                  {formatShortDate(match.date)}
                </span>
              </>
            )}
            {match.group && (
              <span className="text-[9px] font-sans text-zinc-600 uppercase tracking-wide mt-0.5 leading-none">
                Gr. {match.group}
              </span>
            )}
          </div>

          {/* Right: away team (left-aligned) */}
          <div className="flex items-center justify-start gap-2 min-w-0">
            <TeamLogo src={match.awayTeam.logo} name={match.awayTeam.name} />
            <span
              className={[
                'text-sm truncate leading-tight font-sans',
                isBrazil && match.awayTeam.id === BRAZIL_TEAM_ID
                  ? 'text-white font-semibold'
                  : 'text-zinc-200',
              ].join(' ')}
            >
              {match.awayTeam.name}
            </span>
          </div>

          {/* Chevron */}
          <div className="flex items-center justify-center">
            <ChevronDownIcon
              className={[
                'w-3 h-3 text-zinc-600 transition-transform duration-150',
                expanded ? 'rotate-180' : '',
              ].join(' ')}
              aria-hidden="true"
            />
          </div>
        </div>
      </button>

      {/* Expanded: full MatchCard */}
      {expanded && (
        <div className="border-t border-zinc-800/60">
          <MatchCard
            match={match}
            highlightClubId={BRAZIL_TEAM_ID}
            preview={{ broadcasters, homeForm: [], awayForm: [] }}
            previewLoading={loadingBroadcasters}
          />
        </div>
      )}
    </div>
  );
}
