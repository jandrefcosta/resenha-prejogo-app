'use client';

import { useEffect, useRef, useState } from 'react';
import { XMarkIcon, TableCellsIcon } from '@heroicons/react/20/solid';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useScrollLock } from '@/lib/useScrollLock';
import type { CopaStandingsPayload } from '@/app/api/copa/standings/route';
import type { StandingEntry } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Copa 2026 group letters — A through L (12 groups, 48 nations) */
const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/** Brazil's API-Football team ID — hardcoded since this page is Brazil-centric */
const BRAZIL_TEAM_ID = 6;

/** Brazil is in Group C (confirmed via API) */
const BRAZIL_GROUP = 'C';

// ─── Zone colours ─────────────────────────────────────────────────────────────

/** Top 2 of each group advance directly to Round of 16 */
function isDirectQualifier(rank: number): boolean {
  return rank <= 2;
}

/** 3rd-placed teams may advance (best 8 of 12 in Copa 2026 format) */
function isThirdPlace(rank: number): boolean {
  return rank === 3;
}

// ─── Team logo ────────────────────────────────────────────────────────────────

function TeamFlag({ src, name }: { src: string; name: string }) {
  const [err, setErr] = useState(false);
  if (err) return <span className="w-5 h-5 shrink-0 rounded bg-zinc-700" />;
  return (
    <img
      src={src} alt={name} width={20} height={20}
      className="object-contain shrink-0 rounded-sm"
      onError={() => setErr(true)}
    />
  );
}

// ─── Single group mini-table ──────────────────────────────────────────────────

function GroupTable({ letter, entries }: { letter: string; entries: StandingEntry[] }) {
  return (
    <div>
      {/* Column headers */}
      <div className="grid grid-cols-[20px_1fr_26px_22px_22px_22px_22px_26px] px-3 pb-1 gap-x-1">
        <div />
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 font-sans">
          Grupo {letter}
        </div>
        <div className="text-[10px] text-center text-zinc-500 font-sans font-bold">Pts</div>
        <div className="text-[10px] text-center text-zinc-500 font-sans">J</div>
        <div className="text-[10px] text-center text-zinc-500 font-sans">V</div>
        <div className="text-[10px] text-center text-zinc-500 font-sans">E</div>
        <div className="text-[10px] text-center text-zinc-500 font-sans">D</div>
        <div className="text-[10px] text-center text-zinc-500 font-sans">SG</div>
      </div>

      <table className="w-full border-collapse">
        <tbody>
          {entries.map((entry) => {
            const isBrazil = entry.team.id === BRAZIL_TEAM_ID;
            const direct = isDirectQualifier(entry.rank);
            const third = isThirdPlace(entry.rank);

            let rowStyle: React.CSSProperties = {};
            let rankColor = '#71717a'; // zinc-500

            if (isBrazil) {
              rowStyle = {
                backgroundColor: 'rgba(251,191,36,0.10)',
                borderLeftWidth: 2,
                borderLeftStyle: 'solid',
                borderLeftColor: '#fbbf24',
              };
              rankColor = '#fbbf24';
            } else if (direct) {
              rowStyle = {
                backgroundColor: 'rgba(34,197,94,0.07)',
                borderLeftWidth: 2,
                borderLeftStyle: 'solid',
                borderLeftColor: '#22c55e33',
              };
            } else if (third) {
              rowStyle = {
                backgroundColor: 'rgba(56,189,248,0.06)',
                borderLeftWidth: 2,
                borderLeftStyle: 'solid',
                borderLeftColor: '#38bdf822',
              };
            }

            return (
              <tr
                key={entry.team.id}
                style={rowStyle}
                className="grid grid-cols-[20px_1fr_26px_22px_22px_22px_22px_26px] px-3 py-1.5 items-center gap-x-1 border-b border-zinc-800/50 last:border-0"
              >
                <td className="text-center">
                  <span className="text-xs font-bold tabular-nums font-display" style={{ color: rankColor }}>
                    {entry.rank}
                  </span>
                </td>
                <td className="flex items-center gap-1.5 min-w-0">
                  <TeamFlag src={entry.team.logo} name={entry.team.name} />
                  <span className={`text-xs truncate font-sans ${isBrazil ? 'text-white font-bold' : 'text-zinc-300'}`}>
                    {entry.team.name}
                  </span>
                </td>
                <td className="text-center">
                  <span className={`text-xs font-bold tabular-nums font-display ${isBrazil ? 'text-white' : 'text-zinc-100'}`}>
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
                  <span className={`text-xs tabular-nums font-sans ${entry.goalsDiff > 0 ? 'text-green-400' : entry.goalsDiff < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
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

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-4 px-4 py-2 text-[10px] text-zinc-500 font-sans border-t border-zinc-800">
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-green-500 opacity-60" />
        Classificado (oitavas)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-sky-400 opacity-60" />
        Possível classificado (3º lugar)
      </span>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface GroupStandingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CopaStandingsPayload | null;
  loading: boolean;
  error: boolean;
}

export function GroupStandingsModal({
  isOpen,
  onClose,
  data,
  loading,
  error,
}: GroupStandingsModalProps) {
  const [activeGroup, setActiveGroup] = useState(BRAZIL_GROUP);
  const modalRef = useRef<HTMLDivElement>(null);

  useFocusTrap(modalRef, onClose);
  useScrollLock(isOpen);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const groups = data?.groups ?? {};
  const activeEntries: StandingEntry[] = groups[activeGroup] ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Classificação dos Grupos — Copa do Mundo 2026"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-lg bg-zinc-900 rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[85vh] pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <TableCellsIcon className="w-4 h-4 text-zinc-400" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-zinc-100 font-sans">
              Classificação dos Grupos
            </h2>
            <span className="text-xs text-zinc-500 font-sans">Copa do Mundo 2026</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
            aria-label="Fechar"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Group tabs — horizontal scroll */}
        <div className="shrink-0 border-b border-zinc-800 overflow-x-auto">
          <div className="flex px-3 py-1 gap-1 min-w-max">
            {GROUP_LETTERS.map((letter) => {
              const isBrazilGroup = letter === BRAZIL_GROUP;
              const isActive = activeGroup === letter;
              return (
                <button
                  key={letter}
                  onClick={() => setActiveGroup(letter)}
                  className={[
                    'px-3 py-1.5 text-xs font-bold rounded-md font-display transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/50',
                    isActive
                      ? 'bg-white/10 text-white'
                      : isBrazilGroup
                        ? 'text-amber-400 hover:bg-zinc-800'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
                  ].join(' ')}
                  aria-pressed={isActive}
                >
                  {letter}
                  {isBrazilGroup && (
                    <span className="ml-1 text-[8px] text-amber-400">🇧🇷</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-zinc-500 font-sans">Carregando classificação…</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-zinc-500 font-sans">Não foi possível carregar a classificação.</span>
            </div>
          )}

          {!loading && !error && (
            <>
              {activeEntries.length > 0 ? (
                <div className="pt-2 pb-1">
                  <GroupTable letter={activeGroup} entries={activeEntries} />
                </div>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <span className="text-sm text-zinc-500 font-sans">
                    Grupo {activeGroup} sem dados disponíveis.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <Legend />
      </div>
    </div>
  );
}

// ─── Trigger button ───────────────────────────────────────────────────────────

export function GroupStandingsButton() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CopaStandingsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleOpen() {
    setOpen(true);
    if (data) return; // already fetched
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/copa/standings');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: CopaStandingsPayload = await res.json();
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 cursor-pointer backdrop-blur-sm"
        aria-label="Ver classificação dos grupos"
      >
        <TableCellsIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Grupos</span>
      </button>

      <GroupStandingsModal
        isOpen={open}
        onClose={() => setOpen(false)}
        data={data}
        loading={loading}
        error={error}
      />
    </>
  );
}
