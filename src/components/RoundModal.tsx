'use client';

import { useEffect, useRef, useState } from 'react';
import { ShareIcon, CalendarIcon } from '@heroicons/react/20/solid';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { LIVE_WINDOW_MS } from '@/lib/matchConstants';
import type { Match } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoundMatch extends Match {
  broadcasters: string[];
}

interface RoundData {
  round: string | null;
  matches: RoundMatch[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TZ = 'America/Sao_Paulo';

function formatMatchDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: TZ,
  }).format(new Date(iso));
}

function formatMatchTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(new Date(iso));
}

/** Returns a YYYY-MM-DD key in Brasília timezone for grouping */
function dateKey(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(iso));
}

function groupByDate(matches: RoundMatch[]): [string, RoundMatch[]][] {
  const map = new Map<string, RoundMatch[]>();
  for (const m of matches) {
    const key = dateKey(m.date);
    (map.get(key) ?? map.set(key, []).get(key)!).push(m);
  }
  return Array.from(map.entries());
}

// ─── Share ────────────────────────────────────────────────────────────────────

function buildShareText(data: RoundData): string {
  if (!data.round || data.matches.length === 0) return '';

  const lines: string[] = [`*${data.round} — Brasileirão Série A*`];
  const groups = groupByDate(data.matches);

  for (const [, matches] of groups) {
    lines.push('');
    lines.push(formatMatchDate(matches[0].date).replace('.', ''));

    for (const m of matches) {
      if (m.status === 'postponed') {
        lines.push(`${m.homeTeam.name} x ${m.awayTeam.name} — Adiado`);
        continue;
      }
      const time = formatMatchTime(m.date);
      const where = m.broadcasters.length > 0 ? ` · ${m.broadcasters.join(', ')}` : '';
      lines.push(`${m.homeTeam.name} x ${m.awayTeam.name} — ${time}${where}`);
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.resenhaprejogo.app';
  lines.push('', siteUrl);

  return lines.join('\n');
}

/**
 * Share handler — cross-device strategy:
 * 1. Web Share API (iOS/Android native share sheet) — most reliable on mobile,
 *    includes WhatsApp, Telegram, SMS, etc. without fragile deep-link hacks.
 * 2. Fallback: window.open wa.me link — desktop browsers and older mobile.
 *
 * Using window.open inside onClick is more reliable than <a target="_blank">
 * inside a modal on iOS Safari / PWA contexts.
 */
async function handleShare(text: string): Promise<void> {
  if (!text) return;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      // AbortError = user dismissed the sheet — do nothing.
      if ((err as DOMException).name === 'AbortError') return;
      // Any other error: fall through to WhatsApp link.
    }
  }

  // Desktop / browsers without Web Share API
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

// ─── Sub-components ───────────────────────────────────────────────────────────

function BroadcasterBadge({ name }: { name: string }) {
  const bg = BROADCASTER_COLORS[name] ?? '#374151';
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white leading-tight"
      style={{ backgroundColor: bg }}
    >
      {name}
    </span>
  );
}


function isMatchLive(date: string): boolean {
  const kickoff = new Date(date).getTime();
  const now = Date.now();
  return now >= kickoff && now <= kickoff + LIVE_WINDOW_MS;
}

function MatchRow({ match }: { match: RoundMatch }) {
  const time = formatMatchTime(match.date);
  const isPostponed = match.status === 'postponed';
  const live = !isPostponed && isMatchLive(match.date);

  return (
    <div
      className="py-3 border-b border-zinc-800/50 last:border-0"
      style={live ? { backgroundColor: 'rgba(34,197,94,0.05)' } : undefined}
    >
      {/* Teams */}
      <div className="flex items-center justify-center gap-3">
        {/* Home */}
        <div className="flex items-center gap-1.5 w-[38%] justify-end min-w-0">
          <span className="text-xs font-semibold text-zinc-200 font-sans truncate text-right">
            {match.homeTeam.shortName}
          </span>
          <img
            src={match.homeTeam.logo}
            alt=""
            width={20}
            height={20}
            className="object-contain shrink-0"
            aria-hidden="true"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        <span className="text-[11px] font-bold text-zinc-600 shrink-0">×</span>

        {/* Away */}
        <div className="flex items-center gap-1.5 w-[38%] min-w-0">
          <img
            src={match.awayTeam.logo}
            alt=""
            width={20}
            height={20}
            className="object-contain shrink-0"
            aria-hidden="true"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="text-xs font-semibold text-zinc-200 font-sans truncate">
            {match.awayTeam.shortName}
          </span>
        </div>
      </div>

      {/* Meta: status + broadcasters */}
      <div className="mt-1.5 flex items-center justify-start gap-2 flex-wrap">
        {isPostponed ? (
          <span className="text-[11px] font-semibold text-amber-500 font-sans">Adiado</span>
        ) : live ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-green-400 font-sans">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" aria-hidden="true" />
            Ao Vivo
          </span>
        ) : (
          <span className="text-[11px] tabular-nums text-zinc-500 font-sans">{time}</span>
        )}

        {!isPostponed && match.broadcasters.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {match.broadcasters.map((b) => <BroadcasterBadge key={b} name={b} />)}
          </div>
        )}
        {!isPostponed && match.broadcasters.length === 0 && (
          <span className="text-[11px] text-zinc-600 font-sans italic">transmissão a confirmar</span>
        )}
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function RoundModal({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);

  const [data, setData] = useState<RoundData | null>(null);
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    fetch('/api/round')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<RoundData>;
      })
      .then((d) => { setData(d); setStatus('done'); })
      .catch(() => setStatus('error'));
  }, []);

  const visibleMatches = data
    ? data.matches.filter((m) => {
        if (m.status === 'postponed') return true;
        return Date.now() <= new Date(m.date).getTime() + LIVE_WINDOW_MS;
      })
    : [];
  const groups = groupByDate(visibleMatches);

  return (
    <div
      className="fixed inset-x-0 top-0 h-dvh z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Jogos da rodada"
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
        className="relative w-full sm:max-w-sm max-h-[92dvh] sm:max-h-[85dvh] rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <p className="text-sm font-bold text-white font-display uppercase tracking-wide">
              {data?.round ?? 'Próxima Rodada'}
            </p>
            <p className="text-xs text-zinc-500 font-sans mt-0.5">
              Brasileirão Série A · Temporada 2026
            </p>
          </div>
          <div className="flex items-center gap-1">
            {status === 'done' && data && (
              <button
                onClick={() => handleShare(buildShareText({ ...data, matches: visibleMatches }))}
                className="h-8 w-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                aria-label="Compartilhar rodada"
              >
                <ShareIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
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
          <div className="flex-1 p-5 space-y-4 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-24 bg-zinc-800 rounded" />
                <div className="h-8 bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-sm text-zinc-400 font-sans text-center">
              Não foi possível carregar os jogos. Tente novamente.
            </p>
          </div>
        )}

        {/* Content */}
        {status === 'done' && data && (
          <div className="overflow-y-auto flex-1">
            {groups.length === 0 && (
              <p className="py-8 text-center text-sm text-zinc-500 font-sans">
                Nenhum jogo encontrado.
              </p>
            )}
            {groups.map(([key, matches]) => (
              <div key={key}>
                {/* Date separator */}
                <div className="sticky top-0 bg-zinc-900/95 backdrop-blur-sm px-4 pt-3 pb-1.5 z-10">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 font-sans capitalize">
                    {formatMatchDate(matches[0].date)}
                  </span>
                </div>
                <div className="px-4">
                  {matches.map((m) => <MatchRow key={m.id} match={m} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Trigger button ───────────────────────────────────────────────────────────

export function RoundButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 cursor-pointer backdrop-blur-sm"
        aria-label="Ver jogos da rodada"
      >
        <CalendarIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Rodada</span>
      </button>
      {open && <RoundModal onClose={() => setOpen(false)} />}
    </>
  );
}
