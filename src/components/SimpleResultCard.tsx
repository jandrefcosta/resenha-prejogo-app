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
  L: { label: 'D', bg: 'bg-red-700',   text: 'text-white' },
};

function deriveOutcome(
  match: Match,
  highlightId: string | undefined,
): Outcome | null {
  // Use explicit winner field when available (CONMEBOL source)
  if (match.winner && highlightId) {
    const isHome = match.homeTeam.id === highlightId;
    const isAway = match.awayTeam.id === highlightId;
    if (!isHome && !isAway) return null;
    if (match.winner === 'draw') return 'D';
    if ((match.winner === 'home' && isHome) || (match.winner === 'away' && isAway)) return 'W';
    return 'L';
  }

  // Fallback: infer from score
  const score = match.score;
  if (!score || score.home === null || score.away === null) return null;
  const isHome = match.homeTeam.id === highlightId;
  const isAway = match.awayTeam.id === highlightId;
  if (!isHome && !isAway) return null;
  const { home, away } = score;
  if (home === away) return 'D';
  if (isHome) return home > away ? 'W' : 'L';
  return away > home ? 'W' : 'L';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBreakdown({ match }: { match: Match }) {
  const d = match.scoreDetail;
  if (!d) return null;

  const parts: string[] = [];

  if (d.ht) parts.push(`Intervalo ${d.ht.home}–${d.ht.away}`);
  if (match.hadExtraTime) parts.push('AET');
  if (d.pen)  parts.push(`Pên. ${d.pen.home}–${d.pen.away}`);

  if (parts.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-sans text-zinc-500 mt-1">
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </div>
  );
}

function AggregateScore({ match }: { match: Match }) {
  const agg = match.scoreDetail?.aggregate;
  if (!agg) return null;

  return (
    <div className="mt-1 text-center text-[11px] font-sans text-zinc-500">
      Agregado {agg.home}–{agg.away}
    </div>
  );
}

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

  // For CONMEBOL matches the team IDs are Conmebol IDs (string), not apiFootballId.
  // highlightApiFootballId is used for Série A matches; for CONMEBOL we also
  // try matching by name as a last resort — but the winner field handles outcome correctly.
  const outcome = deriveOutcome(match, highlightApiFootballId);

  const isHome = match.homeTeam.id === highlightApiFootballId;
  const isAway = match.awayTeam.id === highlightApiFootballId;

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/60">
        <span className="text-xs font-medium text-zinc-400 truncate font-sans">
          {match.competitionName}
          {match.isNeutralVenue && (
            <span className="ml-1.5 text-zinc-600">(campo neutro)</span>
          )}
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
                width={48}
                height={48}
                className="object-contain shrink-0"
                aria-hidden="true"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
          </div>

          {/* Score */}
          <div className="flex-none px-1 text-center">
            {hasScore ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-2xl font-black font-display text-white tabular-nums">
                    {homeGoals}
                  </span>
                  <span className="text-base font-black font-display text-zinc-600">–</span>
                  <span className="text-2xl font-black font-display text-white tabular-nums">
                    {awayGoals}
                  </span>
                </div>
                {/* AET badge */}
                {match.hadExtraTime && !match.scoreDetail?.pen && (
                  <div className="text-[10px] font-bold font-display text-zinc-500 tracking-widest text-center mt-0.5">
                    AET
                  </div>
                )}
                {/* Penalty shootout score below main score */}
                {match.scoreDetail?.pen && (
                  <div className="text-[11px] font-bold font-display text-zinc-400 text-center mt-0.5">
                    ({match.scoreDetail.pen.home} – {match.scoreDetail.pen.away} pên.)
                  </div>
                )}
              </>
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
                width={48}
                height={48}
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

        {/* Score breakdown (HT / AET indicator) */}
        <ScoreBreakdown match={match} />

        {/* Aggregate (two-legged ties) */}
        <AggregateScore match={match} />

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
