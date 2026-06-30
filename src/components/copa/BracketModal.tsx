'use client';

import { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useScrollLock } from '@/lib/useScrollLock';
import { buildBracketTree, type BracketTree, type BracketNode } from '@/lib/copaBracket';
import type { CopaFixturesPayload } from '@/app/api/copa/fixtures/route';
import type { Match } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAZIL_TEAM_ID = '6';
const BRT = 'America/Sao_Paulo';

// Layout geometry (px). The tree is laid out absolutely and scrolls
// horizontally; y positions come from the pure adapter (leaf-row units).
const CARD_W = 156;
const CARD_H = 54;
const ROW_H = 68; // vertical distance between adjacent leaf rows
const COL_GAP = 36;
const HEADER_H = 32;
const COL_STRIDE = CARD_W + COL_GAP;

function colX(col: number): number {
  return col * COL_STRIDE;
}

function isBrazil(m: Match): boolean {
  return m.homeTeam.id === BRAZIL_TEAM_ID || m.awayTeam.id === BRAZIL_TEAM_ID;
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: BRT,
  }).format(new Date(iso));
}

// ─── Single match card ──────────────────────────────────────────────────────

function TeamRow({
  name,
  logo,
  score,
  pen,
  won,
  highlight,
}: {
  name: string;
  logo?: string;
  score: number | null;
  pen: number | null;
  won: boolean;
  highlight: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={14} height={14} className="object-contain shrink-0" aria-hidden="true" />
      ) : (
        <span className="w-3.5 h-3.5 shrink-0 rounded-sm bg-zinc-700" />
      )}
      <span
        className={[
          'flex-1 truncate text-[11px] font-sans',
          highlight ? 'text-amber-300 font-bold' : won ? 'text-white font-semibold' : 'text-zinc-400',
        ].join(' ')}
      >
        {name}
      </span>
      {score !== null && (
        <span className={`text-[11px] tabular-nums font-display ${won ? 'text-white font-bold' : 'text-zinc-500'}`}>
          {score}
          {pen !== null && <span className="text-[9px] text-zinc-500"> ({pen})</span>}
        </span>
      )}
    </div>
  );
}

function MatchCardNode({ node }: { node: BracketNode }) {
  const m = node.match;
  const brazil = isBrazil(m);
  const finished = m.status === 'finished';
  const homeWon = finished && m.advancedTeamId === m.homeTeam.id;
  const awayWon = finished && m.advancedTeamId === m.awayTeam.id;
  const pen = m.scoreDetail?.pen;

  return (
    <div
      className={[
        'h-full w-full rounded-lg border bg-zinc-900 px-2 py-1.5 flex flex-col justify-center gap-1',
        brazil ? 'border-amber-400/40 ring-1 ring-amber-400/20' : 'border-zinc-800',
      ].join(' ')}
    >
      <TeamRow
        name={m.homeTeam.name}
        logo={m.homeTeam.logo}
        score={finished ? (m.score?.home ?? null) : null}
        pen={pen ? pen.home : null}
        won={homeWon}
        highlight={m.homeTeam.id === BRAZIL_TEAM_ID}
      />
      <TeamRow
        name={m.awayTeam.name}
        logo={m.awayTeam.logo}
        score={finished ? (m.score?.away ?? null) : null}
        pen={pen ? pen.away : null}
        won={awayWon}
        highlight={m.awayTeam.id === BRAZIL_TEAM_ID}
      />
      {!finished && (
        <span className="text-[9px] text-zinc-600 font-sans text-center leading-none">
          {m.status === 'postponed' ? 'Adiado' : shortDate(m.date)}
        </span>
      )}
    </div>
  );
}

// ─── Tree canvas ──────────────────────────────────────────────────────────────

function BracketCanvas({ tree }: { tree: BracketTree }) {
  const allNodes = tree.columns.flatMap((c) => c.nodes);
  const maxY = allNodes.reduce((max, n) => Math.max(max, n.y), 0);
  const canvasH = maxY * ROW_H + CARD_H;
  const totalW = colX(tree.columns.length - 1) + CARD_W;

  const nodeTop = (y: number) => HEADER_H + y * ROW_H;
  const nodeCenterY = (y: number) => nodeTop(y) + CARD_H / 2;

  // Connector segments: feeder right edge → midpoint → node left edge.
  const paths: string[] = [];
  for (let c = 1; c < tree.columns.length; c++) {
    const prevById = new Map(tree.columns[c - 1].nodes.map((n) => [n.match.id, n]));
    for (const node of tree.columns[c].nodes) {
      const nx = colX(c);
      const ny = nodeCenterY(node.y);
      const midX = nx - COL_GAP / 2;
      for (const fid of node.feederIds) {
        const feeder = prevById.get(fid);
        if (!feeder) continue;
        const fx = colX(c - 1) + CARD_W;
        const fy = nodeCenterY(feeder.y);
        paths.push(`M ${fx} ${fy} H ${midX} V ${ny} H ${nx}`);
      }
    }
  }

  return (
    <div className="relative" style={{ width: totalW, height: HEADER_H + canvasH }}>
      {/* Column headers */}
      {tree.columns.map((col, c) => (
        <div
          key={col.key}
          className="absolute text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-sans truncate"
          style={{ left: colX(c), top: 0, width: CARD_W }}
        >
          {col.label}
        </div>
      ))}

      {/* Connectors */}
      <svg
        className="absolute pointer-events-none"
        style={{ left: 0, top: 0 }}
        width={totalW}
        height={HEADER_H + canvasH}
        aria-hidden="true"
      >
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#3f3f46" strokeWidth={1.5} />
        ))}
      </svg>

      {/* Cards */}
      {tree.columns.map((col, c) =>
        col.nodes.map((node) => (
          <div
            key={node.match.id}
            className="absolute"
            style={{ left: colX(c), top: nodeTop(node.y), width: CARD_W, height: CARD_H }}
          >
            <MatchCardNode node={node} />
          </div>
        )),
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function BracketModal({ onClose }: { onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState<BracketTree | null>(null);
  const [status, setStatus] = useState<'loading' | 'done' | 'error' | 'empty'>('loading');

  useFocusTrap(modalRef, onClose);
  useScrollLock(true);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/copa/fixtures')
      .then((r) => (r.ok ? (r.json() as Promise<CopaFixturesPayload>) : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        const built = buildBracketTree(data.phases);
        if (built.columns.length === 0) {
          setStatus('empty');
        } else {
          setTree(built);
          setStatus('done');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Chaveamento — Copa do Mundo 2026"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-3xl bg-zinc-900 rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[85vh] pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <span aria-hidden="true">🏆</span>
            <h2 className="text-sm font-semibold text-zinc-100 font-sans">Chaveamento</h2>
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

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {status === 'loading' && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-zinc-500 font-sans">Carregando chaveamento…</span>
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-zinc-500 font-sans">Não foi possível carregar o chaveamento.</span>
            </div>
          )}
          {status === 'empty' && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
              <span className="text-2xl" aria-hidden="true">🗓️</span>
              <span className="text-sm text-zinc-500 font-sans">O mata-mata ainda não começou.</span>
            </div>
          )}
          {status === 'done' && tree && <BracketCanvas tree={tree} />}
        </div>
      </div>
    </div>
  );
}

// ─── Trigger button ───────────────────────────────────────────────────────────

export function BracketButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 cursor-pointer backdrop-blur-sm"
        aria-label="Ver chaveamento do mata-mata"
      >
        <span>Chaveamento</span>
      </button>
      {open && <BracketModal onClose={() => setOpen(false)} />}
    </>
  );
}
