'use client';

import { useRef } from 'react';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useScrollLock } from '@/lib/useScrollLock';
import { useLiveFixture } from '@/lib/useLiveFixture';
import type { LiveEvent, LiveStats } from '@/lib/types';

const ENDED_STATUSES = new Set(['FT', 'AET', 'PEN', 'CANC', 'PST', 'SUSP', 'ABD', 'AWD', 'WO']);

interface Props {
  fixtureId: number;
  homeTeamName: string;
  awayTeamName: string;
  isOpen: boolean;
  onClose: () => void;
}

function statusLabel(status: string, elapsed: number | null): string {
  if (status === 'HT') return 'Intervalo';
  if (status === 'BT') return 'Intervalo (prorrogação)';
  if (ENDED_STATUSES.has(status)) return 'Encerrado';
  if (elapsed !== null) return `${elapsed}'`;
  return status;
}

function EventIcon({ event }: { event: LiveEvent }) {
  if (event.type === 'Goal') {
    const isOwnGoal = event.detail === 'Own Goal';
    const isPenalty = event.detail === 'Penalty';
    return (
      <span
        className={`text-base shrink-0 ${isOwnGoal ? 'opacity-50' : ''}`}
        aria-hidden="true"
      >
        {isPenalty ? '⚽🅿' : '⚽'}
      </span>
    );
  }
  if (event.type === 'Card') {
    if (event.detail === 'Yellow Card') return <span className="w-3 h-4 rounded-sm bg-yellow-400 shrink-0 inline-block" aria-hidden="true" />;
    if (event.detail === 'Red Card') return <span className="w-3 h-4 rounded-sm bg-red-600 shrink-0 inline-block" aria-hidden="true" />;
    return <span className="w-3 h-4 rounded-sm bg-red-600 shrink-0 inline-block" aria-hidden="true" />;
  }
  // subst
  return <span className="text-xs text-green-400 shrink-0" aria-hidden="true">↕</span>;
}

function EventRow({ event, homeTeamName, awayTeamName }: { event: LiveEvent; homeTeamName: string; awayTeamName: string }) {
  const isHome = event.team === 'home';
  const minuteStr = event.minuteExtra ? `${event.minute}+${event.minuteExtra}'` : `${event.minute}'`;

  return (
    <li className="flex items-start gap-2 px-4 py-2 text-xs font-sans">
      <span className="text-zinc-500 w-10 shrink-0 text-right tabular-nums">{minuteStr}</span>
      <EventIcon event={event} />
      <div className="flex-1 min-w-0">
        <span className="text-white">{event.playerName}</span>
        {event.type === 'subst' && event.assistName && (
          <span className="text-zinc-500"> ← {event.assistName}</span>
        )}
        {event.type === 'Goal' && event.assistName && (
          <span className="text-zinc-500"> (ass. {event.assistName})</span>
        )}
        {event.detail === 'Own Goal' && <span className="text-zinc-500"> (contra)</span>}
      </div>
      <span className="text-zinc-600 shrink-0 truncate max-w-[4rem]">
        {isHome ? homeTeamName : awayTeamName}
      </span>
    </li>
  );
}

function StatRow({ label, home, away }: { label: string; home: number | null; away: number | null }) {
  if (home === null && away === null) return null;
  const h = home ?? 0;
  const a = away ?? 0;
  const total = h + a;
  const homePct = total > 0 ? (h / total) * 100 : 50;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-zinc-500 font-sans">
        <span className="tabular-nums">{home ?? '–'}</span>
        <span>{label}</span>
        <span className="tabular-nums">{away ?? '–'}</span>
      </div>
      <div className="h-1 rounded-full bg-zinc-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-zinc-400 transition-all duration-300"
          style={{ width: `${homePct}%` }}
        />
      </div>
    </div>
  );
}

function StatsPanel({ stats, homeTeamName, awayTeamName }: { stats: LiveStats; homeTeamName: string; awayTeamName: string }) {
  return (
    <section className="space-y-3">
      <div className="flex justify-between text-[10px] font-semibold text-zinc-400 font-sans uppercase tracking-wider">
        <span className="truncate max-w-[40%]">{homeTeamName}</span>
        <span>Estatísticas</span>
        <span className="truncate max-w-[40%] text-right">{awayTeamName}</span>
      </div>
      <StatRow label="Posse (%)" home={stats.possession.home} away={stats.possession.away} />
      <StatRow label="Finalizações" home={stats.shots.home} away={stats.shots.away} />
      <StatRow label="No gol" home={stats.shotsOnTarget.home} away={stats.shotsOnTarget.away} />
      <StatRow label="Escanteios" home={stats.corners.home} away={stats.corners.away} />
      <StatRow label="Faltas" home={stats.fouls.home} away={stats.fouls.away} />
    </section>
  );
}

export function LiveMatchModal({ fixtureId, homeTeamName, awayTeamName, isOpen, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);
  useScrollLock(isOpen);

  const { data, error, lastUpdated, isRefreshing, refresh } = useLiveFixture(isOpen ? fixtureId : null);

  if (!isOpen) return null;

  const isEnded = data ? ENDED_STATUSES.has(data.status) : false;
  const timeLabel = data ? statusLabel(data.status, data.elapsed) : '–';
  const eventsDesc = [...(data?.events ?? [])].reverse();

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div
      className="fixed inset-x-0 top-0 h-dvh z-50 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Ao vivo"
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
        className="relative w-full sm:max-w-sm max-h-[85dvh] rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-none">
          <div className="flex items-center gap-2 min-w-0">
            {isEnded ? (
              <span className="text-sm font-semibold text-zinc-400 font-sans">Jogo encerrado</span>
            ) : (
              <>
                <span
                  className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-white font-sans">Ao Vivo</span>
                <span className="text-xs text-green-400 font-sans font-bold">{timeLabel}</span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 shrink-0 ml-3"
            aria-label="Fechar"
          >
            <XMarkIcon className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Score */}
        <div className="px-4 py-4 flex items-center justify-center gap-4 border-b border-zinc-800 flex-none">
          <span className="flex-1 text-right text-sm font-semibold text-white font-sans truncate">{homeTeamName}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-3xl font-black font-display text-white tabular-nums">
              {data?.homeScore ?? '–'}
            </span>
            <span className="text-xl font-black font-display text-zinc-600">–</span>
            <span className="text-3xl font-black font-display text-white tabular-nums">
              {data?.awayScore ?? '–'}
            </span>
          </div>
          <span className="flex-1 text-sm font-semibold text-white font-sans truncate">{awayTeamName}</span>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-none">
          {/* Loading skeleton */}
          {!data && !error && (
            <div className="flex items-center justify-center py-10">
              <ArrowPathIcon className="w-5 h-5 text-zinc-500 animate-spin" aria-hidden="true" />
            </div>
          )}

          {/* Error state */}
          {!data && error && (
            <p className="text-sm text-zinc-500 font-sans text-center py-8 px-4">
              Não foi possível carregar os dados.
            </p>
          )}

          {data && (
            <>
              {/* Events timeline */}
              {eventsDesc.length > 0 ? (
                <section>
                  <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 font-sans">
                    Eventos
                  </p>
                  <ul className="divide-y divide-zinc-800/50">
                    {eventsDesc.map((e, i) => (
                      <EventRow
                        key={i}
                        event={e}
                        homeTeamName={homeTeamName}
                        awayTeamName={awayTeamName}
                      />
                    ))}
                  </ul>
                </section>
              ) : (
                <p className="text-xs text-zinc-600 font-sans text-center py-6">
                  Sem eventos registrados.
                </p>
              )}

              {/* Stats panel */}
              {data.stats && (
                <div className="px-4 py-4 border-t border-zinc-800 mt-1">
                  <StatsPanel
                    stats={data.stats}
                    homeTeamName={homeTeamName}
                    awayTeamName={awayTeamName}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-zinc-800 flex-none">
          <span className="text-[10px] text-zinc-600 font-sans">
            {lastUpdatedStr ? `Última atualização: ${lastUpdatedStr}` : 'Aguardando dados…'}
          </span>
          {!isEnded && (
            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
              aria-label="Atualizar agora"
            >
              <ArrowPathIcon
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Atualizar agora
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
