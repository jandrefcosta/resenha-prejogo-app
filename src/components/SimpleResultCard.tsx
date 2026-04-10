'use client';

import type { Match } from '@/lib/types';
import { localiseRound } from '@/lib/localiseRound';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TZ = 'America/Sao_Paulo';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: TZ,
  }).format(new Date(iso));
}

type Outcome = 'W' | 'D' | 'L';

const OUTCOME: Record<Outcome, { label: string; bg: string; text: string }> = {
  W: { label: 'V', bg: 'bg-green-600', text: 'text-white' },
  D: { label: 'E', bg: 'bg-amber-500', text: 'text-white' },
  L: { label: 'D', bg: 'bg-red-700', text: 'text-white' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SimpleResultCard({
  match,
  highlightApiFootballId,
}: {
  match: Match;
  /** API-Football team ID (as string) of the club to highlight */
  highlightApiFootballId: string | undefined;
}) {
  const hasScore =
    match.score !== undefined &&
    match.score.home !== null &&
    match.score.away !== null;

  const homeGoals = hasScore ? match.score!.home! : null;
  const awayGoals = hasScore ? match.score!.away! : null;

  const isHome = match.homeTeam.id === highlightApiFootballId;
  const isAway = match.awayTeam.id === highlightApiFootballId;

  let outcome: Outcome | null = null;
  if (hasScore && homeGoals !== null && awayGoals !== null) {
    if (isHome) outcome = homeGoals > awayGoals ? 'W' : homeGoals === awayGoals ? 'D' : 'L';
    if (isAway) outcome = awayGoals > homeGoals ? 'W' : awayGoals === homeGoals ? 'D' : 'L';
  }

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/60">
        <span className="text-xs font-medium text-zinc-400 truncate font-sans">
          {match.competitionName}
        </span>
        <div className="flex items-center gap-2 flex-none ml-2">
          {outcome && (
            <span
              className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold font-display ${OUTCOME[outcome].bg} ${OUTCOME[outcome].text}`}
            >
              {OUTCOME[outcome].label}
            </span>
          )}
          <span
            className="rounded-full px-3 py-0.5 text-xs font-bold font-display tracking-wide"
            style={{
              backgroundColor: 'var(--club-primary)',
              color: 'var(--club-text-on-primary)',
            }}
          >
            {localiseRound(match.round)}
          </span>
        </div>
      </div>

      <div className="p-4">
        {/* Teams + Score */}
        <div className="flex items-center gap-3">
          {/* Home */}
          <div
            className={[
              'flex-1 flex items-center justify-end gap-2',
              isHome ? 'text-white font-bold' : 'text-zinc-300 font-medium',
            ].join(' ')}
          >
            <div className="text-right">
              <span className="block text-xl leading-tight font-display tracking-wide">
                {match.homeTeam.shortName}
              </span>
              <span className="text-xs text-zinc-500 font-sans">{match.homeTeam.name}</span>
            </div>
            {match.homeTeam.logo && (
              <img
                src={match.homeTeam.logo}
                alt=""
                width={32}
                height={32}
                className="object-contain shrink-0"
                aria-hidden="true"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>

          {/* Score */}
          <div className="flex-none px-1 text-center">
            {hasScore ? (
              <div className="flex items-center gap-1.5">
                <span className="text-2xl font-black font-display text-white tabular-nums">
                  {homeGoals}
                </span>
                <span className="text-base font-black font-display text-zinc-600">–</span>
                <span className="text-2xl font-black font-display text-white tabular-nums">
                  {awayGoals}
                </span>
              </div>
            ) : (
              <span className="text-sm font-black text-zinc-500 tracking-widest font-display">? – ?</span>
            )}
          </div>

          {/* Away */}
          <div
            className={[
              'flex-1 flex items-center gap-2',
              isAway ? 'text-white font-bold' : 'text-zinc-300 font-medium',
            ].join(' ')}
          >
            {match.awayTeam.logo && (
              <img
                src={match.awayTeam.logo}
                alt=""
                width={32}
                height={32}
                className="object-contain shrink-0"
                aria-hidden="true"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div>
              <span className="block text-xl leading-tight font-display tracking-wide">
                {match.awayTeam.shortName}
              </span>
              <span className="text-xs text-zinc-500 font-sans">{match.awayTeam.name}</span>
            </div>
          </div>
        </div>

        {/* Date + Venue */}
        <div className="mt-2 flex items-center gap-2 text-xs font-sans text-zinc-500 flex-wrap">
          <span className="capitalize">{formatDate(match.date)}</span>
          {match.stadium && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{match.stadium}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
