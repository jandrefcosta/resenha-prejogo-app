'use client';

import { useState } from 'react';
import clubsData from '@/data/clubs.json';
import type { CbfMatchDetail, ClubTheme } from '@/lib/types';

// ─── Logo map: cbfId → API-Football logo URL ──────────────────────────────────

const clubs = clubsData as ClubTheme[];
const cbfIdToLogo = new Map<string, string>(
  clubs
    .filter((c) => c.cbfId != null && c.apiFootballId != null)
    .map((c) => [
      String(c.cbfId),
      `https://media.api-sports.io/football/teams/${c.apiFootballId}.png`,
    ]),
);

/** cbfId → shortName from clubs.json, fallback to first 3 uppercase chars */
const cbfIdToShort = new Map<string, string>(
  clubs
    .filter((c) => c.cbfId != null)
    .map((c) => [String(c.cbfId), c.shortName]),
);

function teamLogo(cbfId: string): string | null {
  return cbfIdToLogo.get(cbfId) ?? null;
}

function teamShort(cbfId: string, fallbackName: string): string {
  return cbfIdToShort.get(cbfId) ?? stripState(fallbackName).substring(0, 3).toUpperCase();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip " - UF" suffix CBF appends to club names (e.g. "Santos Fc - SP" → "Santos Fc") */
function stripState(name: string): string {
  return name.replace(/\s*-\s*[A-Z]{2}$/, '');
}

/** Parse "DD/MM/YYYY" (no time) → formatted pt-BR date */
function formatCbfDate(raw: string): string {
  const [day, month, year] = raw.split('/').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(year, month - 1, day));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type Outcome = 'W' | 'D' | 'L';

const OUTCOME: Record<Outcome, { label: string; bg: string; text: string }> = {
  W: { label: 'V', bg: 'bg-green-600', text: 'text-white' },
  D: { label: 'E', bg: 'bg-amber-500', text: 'text-white' },
  L: { label: 'D', bg: 'bg-red-700', text: 'text-white' },
};

const CARD_COLOR: Record<string, string> = {
  AMARELO: 'bg-yellow-400',
  VERMELHO: 'bg-red-600',
  VERMELHO2AMARELO: 'bg-red-600',
};

function TeamLogo({ cbfId, alt }: { cbfId: string; alt: string }) {
  const src = teamLogo(cbfId);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      width={32}
      height={32}
      className="object-contain shrink-0"
      style={{ width: 32, height: 32 }}
      aria-hidden="true"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

export function ResultCard({
  roundN,
  data,
  highlightCbfId,
}: {
  roundN: number;
  data: CbfMatchDetail;
  highlightCbfId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const isHome = data.mandante.id === highlightCbfId;
  const isAway = data.visitante.id === highlightCbfId;
  const hasResult = data.mandante.gols !== '' && data.visitante.gols !== '';

  let outcome: Outcome | null = null;
  if (hasResult) {
    const hg = Number(data.mandante.gols);
    const ag = Number(data.visitante.gols);
    if (isHome) outcome = hg > ag ? 'W' : hg === ag ? 'D' : 'L';
    if (isAway) outcome = ag > hg ? 'W' : ag === hg ? 'D' : 'L';
  }

  const homeGoals = data.gols.filter((g) => g.clubeId === data.mandante.id);
  const awayGoals = data.gols.filter((g) => g.clubeId === data.visitante.id);
  const homeCards = data.cartoes.filter((c) => c.clubeId === data.mandante.id);
  const awayCards = data.cartoes.filter((c) => c.clubeId === data.visitante.id);
  const mainRef = data.arbitros.find((a) => a.funcao === 'Arbitro');
  const venue = data.local?.split(' - ')[0];

  const hasDetails = homeCards.length + awayCards.length > 0 || !!mainRef;

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/60">
        <span className="text-xs font-medium text-zinc-400 truncate font-sans">
          {data.campeonato}
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
            Rodada {roundN}
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
                {stripState(data.mandante.nome)}
              </span>
              <span className="text-xs text-zinc-500 font-sans">
                {teamShort(data.mandante.id, data.mandante.nome)}
              </span>
            </div>
            <TeamLogo cbfId={data.mandante.id} alt={data.mandante.nome} />
          </div>

          {/* Score or pending */}
          <div className="flex-none px-1 text-center">
            {hasResult ? (
              <div className="flex items-center gap-1.5">
                <span className="text-2xl font-black font-display text-white tabular-nums">
                  {data.mandante.gols}
                </span>
                <span className="text-base font-black font-display text-zinc-600">–</span>
                <span className="text-2xl font-black font-display text-white tabular-nums">
                  {data.visitante.gols}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-black text-zinc-500 tracking-widest font-display">? – ?</span>
                <span className="text-[9px] font-semibold text-zinc-600 font-sans uppercase tracking-wide whitespace-nowrap">Aguardando</span>
              </div>
            )}
          </div>

          {/* Away */}
          <div
            className={[
              'flex-1 flex items-center gap-2',
              isAway ? 'text-white font-bold' : 'text-zinc-300 font-medium',
            ].join(' ')}
          >
            <TeamLogo cbfId={data.visitante.id} alt={data.visitante.nome} />
            <div>
              <span className="block text-xl leading-tight font-display tracking-wide">
                {stripState(data.visitante.nome)}
              </span>
              <span className="text-xs text-zinc-500 font-sans">
                {teamShort(data.visitante.id, data.visitante.nome)}
              </span>
            </div>
          </div>
        </div>

        {/* Date + Venue */}
        <div className="mt-2 flex items-center gap-2 text-xs font-sans text-zinc-500 flex-wrap">
          <span className="capitalize">{formatCbfDate(data.data)}</span>
          {venue && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{venue}</span>
            </>
          )}
        </div>

        {/* Scorers — always visible when present */}
        {data.gols.length > 0 && (
          <div className="mt-3 flex gap-3 text-xs font-sans">
            <div className="flex-1 text-right space-y-0.5">
              {homeGoals.map((g, i) => (
                <p key={i} className="text-zinc-400 truncate">
                  {g.atletaApelido || g.atletaNome}
                  <span className="text-zinc-600 ml-1">{g.minutos}&apos;</span>
                </p>
              ))}
            </div>
            <div className="w-px bg-zinc-800 flex-none" />
            <div className="flex-1 space-y-0.5">
              {awayGoals.map((g, i) => (
                <p key={i} className="text-zinc-400 truncate">
                  {g.atletaApelido || g.atletaNome}
                  <span className="text-zinc-600 ml-1">{g.minutos}&apos;</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Expand toggle */}
        {hasDetails && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-3 text-xs text-zinc-600 hover:text-zinc-400 font-sans transition-colors block"
          >
            {expanded ? '↑ Menos detalhes' : '↓ Cartões e árbitro'}
          </button>
        )}

        {expanded && (
          <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3">
            {/* Cards */}
            {homeCards.length + awayCards.length > 0 && (
              <div className="flex gap-3 text-xs font-sans">
                <div className="flex-1 text-right space-y-0.5">
                  {homeCards.map((c, i) => (
                    <p key={i} className="flex items-center justify-end gap-1 text-zinc-400">
                      <span className="truncate">{c.atletaApelido || c.atletaNome}</span>
                      <span
                        className={`inline-block w-2.5 h-3.5 rounded-sm shrink-0 ${CARD_COLOR[c.resultado] ?? 'bg-zinc-500'}`}
                        aria-hidden="true"
                      />
                    </p>
                  ))}
                </div>
                <div className="w-px bg-zinc-800 flex-none" />
                <div className="flex-1 space-y-0.5">
                  {awayCards.map((c, i) => (
                    <p key={i} className="flex items-center gap-1 text-zinc-400">
                      <span
                        className={`inline-block w-2.5 h-3.5 rounded-sm shrink-0 ${CARD_COLOR[c.resultado] ?? 'bg-zinc-500'}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{c.atletaApelido || c.atletaNome}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Referee */}
            {mainRef && (
              <p className="text-xs font-sans text-zinc-600">
                Árbitro:{' '}
                <span className="text-zinc-500">
                  {mainRef.nome}
                </span>{' '}
                <span className="text-zinc-700">({mainRef.uf})</span>
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
