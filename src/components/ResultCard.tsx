'use client';

import { useRef, useState, useCallback } from 'react';
import { XMarkIcon, DocumentTextIcon } from '@heroicons/react/20/solid';
import { SoccerBallIcon } from '@/components/SoccerBallIcon';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useScrollLock } from '@/lib/useScrollLock';
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

// ─── Ficha modal (post-match) ─────────────────────────────────────────────────

function FichaResultModal({ data, onClose }: { data: CbfMatchDetail; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);
  useScrollLock();

  const homeStarters = data.mandante.atletas.filter((a) => !a.reserva && a.entrouJogando);
  const awayStarters = data.visitante.atletas.filter((a) => !a.reserva && a.entrouJogando);
  const homeReserves = data.mandante.atletas.filter((a) => a.reserva && a.entrouJogando);
  const awayReserves = data.visitante.atletas.filter((a) => a.reserva && a.entrouJogando);
  const mainRef = data.arbitros.find((a) => a.funcao === 'Arbitro');
  const varRef  = data.arbitros.find((a) => a.funcao === 'VAR');
  const hasLineup = homeStarters.length > 0 || awayStarters.length > 0;
  const hasSubs   = homeReserves.length > 0 || awayReserves.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ficha-result-title"
        className="relative z-10 flex flex-col w-full max-w-lg max-h-[90dvh] bg-zinc-900 rounded-t-2xl sm:rounded-2xl border border-zinc-800 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 id="ficha-result-title" className="text-sm font-bold text-white font-sans">Ficha do Jogo</h2>
            <p className="text-xs text-zinc-500 font-sans mt-0.5">
              {stripState(data.mandante.nome)} × {stripState(data.visitante.nome)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-600 ml-3 shrink-0"
            aria-label="Fechar"
          >
            <XMarkIcon className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-none p-5 space-y-6">
          {/* Phase banner */}
          <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold font-sans text-zinc-400 border-zinc-700 bg-zinc-800">
            Encerrado
          </div>

          {/* Escalação */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 font-sans">Escalação</p>
            {hasLineup ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: teamShort(data.mandante.id, data.mandante.nome), players: homeStarters },
                  { label: teamShort(data.visitante.id, data.visitante.nome), players: awayStarters },
                ].map(({ label, players }) => (
                  <div key={label}>
                    <p className="text-xs text-zinc-500 font-sans mb-1.5">{label}</p>
                    <div className="space-y-0.5">
                      {players.map((p) => (
                        <div key={p.id} className="flex items-center gap-1.5 text-xs font-sans">
                          <span className="text-zinc-600 tabular-nums w-4 text-right shrink-0">{p.numeroCamisa}</span>
                          <span className="text-zinc-300 truncate">{p.apelido.replace(/^\d+\s+-\s+/, '')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-3 py-2.5 text-xs font-sans text-zinc-500">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" aria-hidden="true" />
                Escalação não publicada pelo CBF
              </div>
            )}
          </section>

          {/* Substituições */}
          {hasSubs && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 font-sans">Substituições</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: teamShort(data.mandante.id, data.mandante.nome), players: homeReserves },
                  { label: teamShort(data.visitante.id, data.visitante.nome), players: awayReserves },
                ].map(({ label, players }) => (
                  <div key={label}>
                    <p className="text-xs text-zinc-500 font-sans mb-1.5">{label}</p>
                    <div className="space-y-0.5">
                      {players.map((p) => (
                        <div key={p.id} className="flex items-center gap-1.5 text-xs font-sans">
                          <span className="text-zinc-600 tabular-nums w-4 text-right shrink-0">{p.numeroCamisa}</span>
                          <span className="text-zinc-300 truncate">{p.apelido.replace(/^\d+\s+-\s+/, '')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Arbitragem */}
          {(mainRef || varRef) && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 font-sans">Arbitragem</p>
              <div className="space-y-1">
                {mainRef && (
                  <div className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                    <span className="text-zinc-400 font-medium w-20 shrink-0">Principal</span>
                    <span className="text-zinc-200 flex-1">{mainRef.nome}</span>
                    {mainRef.uf && <span className="text-zinc-600 shrink-0">{mainRef.uf}</span>}
                  </div>
                )}
                {varRef && (
                  <div className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                    <span className="text-zinc-400 font-medium w-20 shrink-0">VAR</span>
                    <span className="text-zinc-200 flex-1">{varRef.nome}</span>
                    {varRef.uf && <span className="text-zinc-600 shrink-0">{varRef.uf}</span>}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
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
  const [fichaOpen, setFichaOpen] = useState(false);
  const closeFicha = useCallback(() => setFichaOpen(false), []);

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
              <div className="flex flex-col items-center gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-2xl font-black font-display text-white tabular-nums">
                    {data.mandante.gols}
                  </span>
                  <span className="text-base font-black font-display text-zinc-600">–</span>
                  <span className="text-2xl font-black font-display text-white tabular-nums">
                    {data.visitante.gols}
                  </span>
                </div>
                <span className="flex items-center gap-0.5 text-[9px] font-semibold text-zinc-600 font-sans uppercase tracking-wide whitespace-nowrap">
                  <SoccerBallIcon className="w-2.5 h-2.5 shrink-0" /> Gols
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

        {/* Actions */}
        <div className="mt-3 flex items-center gap-4">
          {hasDetails && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-zinc-600 hover:text-zinc-400 font-sans transition-colors cursor-pointer"
            >
              {expanded ? '↑ Menos detalhes' : '↓ Cartões e árbitro'}
            </button>
          )}
          <button
            onClick={() => setFichaOpen(true)}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 font-sans transition-colors cursor-pointer"
          >
            <DocumentTextIcon className="w-3 h-3 shrink-0" aria-hidden="true" />
            Ficha
          </button>
        </div>

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

      {fichaOpen && <FichaResultModal data={data} onClose={closeFicha} />}
    </article>
  );
}
