'use client';

import { useEffect, useState } from 'react';
import type { Match } from '@/lib/types';
import { AIAnalysis } from '@/components/AIAnalysis';

const BROADCASTER_COLORS: Record<string, string> = {
  Globo: '#0B57D0',
  Premiere: '#111111',
  SporTV: '#005A9C',
  'SporTV 2': '#005A9C',
  'SporTV 3': '#005A9C',
  CazéTV: '#E8500A',
  'Amazon Prime Video': '#00A8E0',
  'TNT Sports': '#CC0000',
  Max: '#002BE7',
  ESPN: '#CC0000',
  Band: '#E8500A',
  Record: '#C8102E',
};

function BroadcasterBadge({ name }: { name: string }) {
  const bg = BROADCASTER_COLORS[name] ?? '#374151';
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-xs font-bold text-white"
      style={{ backgroundColor: bg }}
    >
      {name}
    </span>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

const DAYS_AHEAD_FOR_BROADCAST_SEARCH = 14;

export function MatchCard({
  match,
  highlightClubId,
}: {
  match: Match;
  highlightClubId: string;
}) {
  const [showRef, setShowRef] = useState(false);
  // null  = not yet fetched  |  []  = fetched, nothing found  |  [...] = real data
  const [realBroadcasters, setRealBroadcasters] = useState<string[] | null>(null);
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  useEffect(() => {
    const msUntilMatch = new Date(match.date).getTime() - Date.now();
    const daysUntil = msUntilMatch / (1000 * 60 * 60 * 24);
    // Only search for matches happening in the near term
    if (daysUntil < 0 || daysUntil > DAYS_AHEAD_FOR_BROADCAST_SEARCH) return;

    setBroadcastLoading(true);
    const params = new URLSearchParams({
      id: match.id,
      home: match.homeTeam.name,
      away: match.awayTeam.name,
      round: match.round,
      date: match.date,
    });

    fetch(`/api/broadcasters?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { broadcasters: string[] }) => {
        if (data.broadcasters.length > 0) setRealBroadcasters(data.broadcasters);
      })
      .catch(() => {})
      .finally(() => setBroadcastLoading(false));
  }, [match.id]);

  const homeIsHighlighted = match.homeTeam.id === highlightClubId;
  const awayIsHighlighted = match.awayTeam.id === highlightClubId;
  const hasVenue = match.stadium !== null || match.city !== null;
  const broadcasters = realBroadcasters ?? [];
  const hasBroadcasters = broadcasters.length > 0;
  const hasReferee = Boolean(match.referee);
  const msUntilMatchRender = new Date(match.date).getTime() - Date.now();
  const daysUntilRender = msUntilMatchRender / (1000 * 60 * 60 * 24);
  const outsideSearchWindow = daysUntilRender < 0 || daysUntilRender > DAYS_AHEAD_FOR_BROADCAST_SEARCH;

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/60">
        <span className="text-xs font-medium text-zinc-400 truncate font-sans">
          {match.competition}
        </span>
        <span
          className="ml-2 flex-none rounded-full px-3 py-0.5 text-xs font-bold font-display tracking-wide"
          style={{
            backgroundColor: 'var(--club-primary)',
            color: 'var(--club-text-on-primary)',
          }}
        >
          {match.round}
        </span>
      </div>

      <div className="p-4">
        {/* Teams */}
        <div className="flex items-center gap-3">
          <div
            className={[
              'flex-1 text-right',
              homeIsHighlighted ? 'text-white font-bold' : 'text-zinc-300 font-medium',
            ].join(' ')}
          >
            <span className="block text-xl leading-tight font-display tracking-wide">
              {match.homeTeam.name}
            </span>
            <span className="text-xs text-zinc-500 font-sans">{match.homeTeam.shortName}</span>
          </div>

          <div className="flex-none px-1">
            <span className="text-sm font-black text-zinc-500 tracking-widest font-display">
              VS
            </span>
          </div>

          <div
            className={[
              'flex-1',
              awayIsHighlighted ? 'text-white font-bold' : 'text-zinc-300 font-medium',
            ].join(' ')}
          >
            <span className="block text-xl leading-tight font-display tracking-wide">
              {match.awayTeam.name}
            </span>
            <span className="text-xs text-zinc-500 font-sans">{match.awayTeam.shortName}</span>
          </div>
        </div>

        {/* Date/time + venue */}
        <div className={`mt-4 grid gap-3 text-sm ${hasVenue ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div className="rounded-lg bg-zinc-800 px-3 py-2.5">
            <p className="text-xs text-zinc-500 mb-0.5 font-sans">Data &amp; Hora</p>
            <p className="font-semibold text-white capitalize font-display tracking-wide">
              {formatDate(match.date)}
            </p>
            <p className="text-zinc-300 text-sm font-sans">
              {formatTime(match.date)} · Horário de Brasília
            </p>
          </div>

          {hasVenue && (
            <div className="rounded-lg bg-zinc-800 px-3 py-2.5">
              <p className="text-xs text-zinc-500 mb-0.5 font-sans">Local</p>
              {match.stadium && (
                <p className="font-semibold text-white font-display tracking-wide">
                  {match.stadium}
                </p>
              )}
              {match.city && (
                <p className="text-zinc-300 text-xs font-sans">{match.city}</p>
              )}
            </div>
          )}
        </div>

        {/* Broadcasters */}
        <div className="mt-3 flex items-center gap-2 flex-wrap min-h-[22px]">
          <span className="text-xs text-zinc-500 font-sans">Onde assistir:</span>
          {broadcastLoading && realBroadcasters === null && (
            <span className="inline-block h-4 w-24 rounded bg-zinc-700 animate-pulse" aria-hidden="true" />
          )}
          {!broadcastLoading && hasBroadcasters &&
            broadcasters.map((b) => <BroadcasterBadge key={b} name={b} />)
          }
          {!broadcastLoading && !hasBroadcasters && (
            <span className="text-xs text-zinc-600 font-sans italic">
              {outsideSearchWindow ? 'disponível em breve' : 'não encontrado'}
            </span>
          )}
        </div>

        {/* Referee — collapsible, SVG chevron, proper touch target */}
        {hasReferee && (
          <div className="mt-3">
            <button
              onClick={() => setShowRef((v) => !v)}
              aria-expanded={showRef}
              className="flex items-center gap-1.5 min-h-[44px] px-0 text-xs text-zinc-500 hover:text-zinc-300 transition-colors duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 rounded"
            >
              <ChevronIcon open={showRef} />
              <span className="font-sans">Arbitragem</span>
            </button>
            {showRef && (
              <div className="mt-1 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs text-zinc-300 font-sans">
                <span className="text-zinc-500">Árbitro: </span>
                {match.referee}
              </div>
            )}
          </div>
        )}

        <AIAnalysis match={match} />
      </div>
    </article>
  );
}
