'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useFocusTrap } from '@/lib/useFocusTrap';
import type { StandingEntry } from '@/lib/types';

// ─── Trigger button ───────────────────────────────────────────────────────────
export function StandingsButton() {
  const [open, setOpen] = useState(false);

  function openModal() {
    setOpen(true);
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    setOpen(false);
    document.body.style.overflow = '';
  }

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 cursor-pointer backdrop-blur-sm"
        aria-label="Ver tabela de classificação"
      >
        <TableIcon />
        <span>Tabela</span>
      </button>
      {open && <StandingsModal onClose={closeModal} />}
    </>
  );
}

function TableIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path fillRule="evenodd" d="M.99 5.24A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25l.01 9.5A2.25 2.25 0 0 1 16.76 17H3.26A2.267 2.267 0 0 1 1 14.75l-.01-9.51Zm8.26 9.52v-.625a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75v.615c0 .414.336.75.75.75h5.373a.75.75 0 0 0 .627-.74Zm1.5 0a.75.75 0 0 0 .627.74H16.75a.75.75 0 0 0 .75-.75v-.615a.75.75 0 0 0-.75-.75h-5.25a.75.75 0 0 0-.75.75v.625Zm6.75-3.63v-.625a.75.75 0 0 0-.75-.75h-5.25a.75.75 0 0 0-.75.75v.625c0 .414.336.75.75.75H17a.75.75 0 0 0 .5-.75Zm-8.25 0v-.625a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75v.625c0 .414.336.75.75.75H8.5a.75.75 0 0 0 .75-.75Zm0-3.378v-.625A.75.75 0 0 0 8.5 6H3.25a.75.75 0 0 0-.75.75v.625c0 .414.336.75.75.75H8.5a.75.75 0 0 0 .75-.75Zm8.25 0v-.625A.75.75 0 0 0 17 6h-5.25a.75.75 0 0 0-.75.75v.625c0 .414.336.75.75.75H17a.75.75 0 0 0 .5-.75Z" clipRule="evenodd" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-4 h-4 shrink-0 transition-transform ${spinning ? 'animate-spin' : ''}`}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
    </svg>
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

// ─── Main component ───────────────────────────────────────────────────────────
export function StandingsModal({ onClose }: { onClose: () => void }) {
  const { club } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);
  useFocusTrap(panelRef, onClose);

  const [standings, setStandings] = useState<StandingEntry[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  function fetchStandings(force = false) {
    if (force) setRefreshing(true);
    else setStatus('loading');

    fetch(force ? '/api/standings?force=1' : '/api/standings')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ data: StandingEntry[]; updatedAt: string }>;
      })
      .then(({ data, updatedAt: ua }) => {
        setStandings(data);
        setUpdatedAt(ua);
        setStatus('done');
      })
      .catch(() => setStatus('error'))
      .finally(() => setRefreshing(false));
  }

  useEffect(() => { fetchStandings(); }, []);

  // Auto-refresh silencioso se o cache estiver com mais de 30min ao abrir
  useEffect(() => {
    if (status !== 'done' || !updatedAt) return;
    const ageMs = Date.now() - new Date(updatedAt).getTime();
    if (ageMs > 30 * 60 * 1000) {
      fetchStandings(true);
    }
  }, [status]);

  // Scroll highlighted row into view once data is ready
  useEffect(() => {
    if (status === 'done' && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [status]);

  function formatAge(iso: string): string {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'agora mesmo';
    if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
    const h = Math.floor(diff / 3600);
    return `há ${h}h${Math.floor((diff % 3600) / 60).toString().padStart(2, '0')}`;
  }

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
              Tabela de Classificação
            </p>
            <p className="text-xs text-zinc-500 font-sans mt-0.5">
              Temporada 2026
              {updatedAt && (
                <span className="ml-1.5 text-zinc-600">· Atualizada {formatAge(updatedAt)}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {status === 'done' && (
              <button
                onClick={() => fetchStandings(true)}
                disabled={refreshing}
                className="h-8 w-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Atualizar tabela"
              >
                <RefreshIcon spinning={refreshing} />
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

        {/* Loading */}
        {status === 'loading' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="space-y-2 w-full animate-pulse">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 bg-zinc-800 rounded" />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-sm text-zinc-400 font-sans text-center">
              Não foi possível carregar a tabela. Tente novamente.
            </p>
          </div>
        )}

        {/* Table */}
        {status === 'done' && standings && (
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
                {standings.map((entry) => {
                  const isHighlighted =
                    club?.apiFootballId !== undefined &&
                    club?.apiFootballId !== null &&
                    entry.team.id === club.apiFootballId;
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
      </div>
    </div>
  );
}
