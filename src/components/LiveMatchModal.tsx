'use client';

import { useRef, useEffect, useState } from 'react';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useScrollLock } from '@/lib/useScrollLock';
import { useLiveFixture } from '@/lib/useLiveFixture';
import type { LiveEvent, LiveStats } from '@/lib/types';

const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'CANC', 'PST', 'SUSP'];

interface Props {
  fixtureId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function eventIcon(type: LiveEvent['type'], detail: string): string {
  if (type === 'goal') return detail.toLowerCase().includes('own') ? '⚽ (CG)' : '⚽';
  if (type === 'card') return detail.toLowerCase().includes('red') ? '🟥' : '🟨';
  if (type === 'subst') return '🔁';
  return '📋';
}

function StatRow({
  label,
  home,
  away,
}: {
  label: string;
  home: number | null;
  away: number | null;
}) {
  return (
    <div className="grid grid-cols-3 items-center text-sm font-sans py-1.5 border-b border-zinc-800 last:border-0">
      <span className="text-white font-semibold text-right tabular-nums">
        {home ?? '—'}
      </span>
      <span className="text-zinc-500 text-center text-xs">{label}</span>
      <span className="text-white font-semibold text-left tabular-nums">
        {away ?? '—'}
      </span>
    </div>
  );
}

function TeamLogo({ src, alt, size = 32 }: { src?: string; alt: string; size?: number }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) return null;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="object-contain shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
      onError={() => setErrored(true)}
    />
  );
}

function ElapsedLabel({ seconds, lastUpdated }: { seconds: number; lastUpdated: Date | null }) {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!lastUpdated) return;
    const id = setInterval(() => rerender((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  if (!lastUpdated) return null;
  const diff = Math.round((Date.now() - lastUpdated.getTime()) / 1_000);
  void seconds;
  return (
    <span className="text-xs text-zinc-500 font-sans">
      Última atualização: {diff}s atrás
    </span>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function LiveMatchModal({ fixtureId, isOpen, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);
  useScrollLock(isOpen);

  const { data, lastUpdated, isRefreshing, refresh } = useLiveFixture(
    isOpen ? fixtureId : null,
  );

  if (!isOpen) return null;

  const isFinished = data?.status
    ? FINISHED_STATUSES.includes(data.status)
    : false;

  const homeStats: LiveStats | null = data?.stats?.[0] ?? null;
  const awayStats: LiveStats | null = data?.stats?.[1] ?? null;

  return (
    <div
      className="fixed inset-x-0 top-0 h-dvh z-50 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Partida ao vivo"
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
        className="relative w-full sm:max-w-md max-h-[80dvh] rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-sm font-semibold text-white font-sans">
            {isFinished ? 'Jogo encerrado' : (data?.statusLabel ?? 'Ao Vivo')}
            {!isFinished && data?.elapsed != null && (
              <span className="ml-1.5 text-zinc-400 font-normal">{data.elapsed}&apos;</span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
            aria-label="Fechar"
          >
            <XMarkIcon className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Score */}
        {!data ? (
          <div className="py-8 flex items-center justify-center">
            <span className="w-8 h-8 rounded-full border-2 border-zinc-600 border-t-white animate-spin" />
          </div>
        ) : (
          <div className="px-4 py-5 shrink-0 flex items-center gap-3 border-b border-zinc-800">
            <div className="flex-1 flex items-center justify-end gap-2 text-right">
              <div>
                <p className="text-lg font-bold text-white font-display tracking-wide">
                  {data.homeTeam.shortName}
                </p>
                <p className="text-xs text-zinc-500 font-sans">{data.homeTeam.name}</p>
              </div>
              <TeamLogo src={data.homeTeam.logo} alt={data.homeTeam.name} size={40} />
            </div>

            <div className="flex-none text-center">
              <div className="flex items-center gap-1.5">
                <span className="text-3xl font-black font-display text-white tabular-nums">
                  {data.homeGoals}
                </span>
                <span className="text-xl font-black font-display text-zinc-600">–</span>
                <span className="text-3xl font-black font-display text-white tabular-nums">
                  {data.awayGoals}
                </span>
              </div>
            </div>

            <div className="flex-1 flex items-center gap-2">
              <TeamLogo src={data.awayTeam.logo} alt={data.awayTeam.name} size={40} />
              <div>
                <p className="text-lg font-bold text-white font-display tracking-wide">
                  {data.awayTeam.shortName}
                </p>
                <p className="text-xs text-zinc-500 font-sans">{data.awayTeam.name}</p>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {data && (
            <>
              {/* Event timeline */}
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 font-sans">
                  Eventos
                </p>
                {data.events.length === 0 ? (
                  <p className="text-sm text-zinc-600 font-sans italic py-2">
                    Aguardando primeiros eventos…
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {data.events.map((ev, i) => {
                      const isHome = ev.team.id === Number(data.homeTeam.id);
                      return (
                        <li
                          key={i}
                          className={`flex items-start gap-2 text-sm font-sans ${
                            isHome ? 'flex-row' : 'flex-row-reverse'
                          }`}
                        >
                          <span className="text-xs text-zinc-500 w-7 shrink-0 text-right tabular-nums pt-0.5">
                            {ev.time.elapsed}&apos;{ev.time.extra != null ? `+${ev.time.extra}` : ''}
                          </span>
                          <span className="shrink-0 text-base leading-none pt-0.5">
                            {eventIcon(ev.type, ev.detail)}
                          </span>
                          <span className="text-zinc-300 leading-snug">
                            {ev.player.name ?? '—'}
                            {ev.type === 'subst' && ev.assist?.name && (
                              <span className="text-zinc-500"> ↩ {ev.assist.name}</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Stats */}
              {homeStats && awayStats && (
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 font-sans">
                    Estatísticas
                  </p>
                  <div>
                    <StatRow label="Posse (%)" home={homeStats.possession} away={awayStats.possession} />
                    <StatRow label="Chutes" home={homeStats.shots} away={awayStats.shots} />
                    <StatRow label="No gol" home={homeStats.shotsOnTarget} away={awayStats.shotsOnTarget} />
                    <StatRow label="Escanteios" home={homeStats.corners} away={awayStats.corners} />
                    <StatRow label="Faltas" home={homeStats.fouls} away={awayStats.fouls} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between shrink-0">
          <ElapsedLabel seconds={0} lastUpdated={lastUpdated} />
          {!isFinished && (
            <button
              onClick={() => void refresh()}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
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
