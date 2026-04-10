'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { XMarkIcon, ClockIcon, UsersIcon, DocumentTextIcon, ShareIcon } from '@heroicons/react/20/solid';
import { SoccerBallIcon } from '@/components/SoccerBallIcon';
import type { Match, H2HData, MatchPreview, TeamPlayersData, CbfMatchDetail, InjuredPlayer } from '@/lib/types';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useScrollLock } from '@/lib/useScrollLock';
import { LIVE_WINDOW_MS } from '@/lib/matchConstants';
import { EmailCaptureModal, EMAIL_REGISTERED_KEY } from '@/components/EmailCaptureModal';
import { BROADCASTER_COLORS } from '@/lib/broadcasterColors';

const DAYS_AHEAD_FOR_BROADCAST_SEARCH = 14;

// ─── Small reusable atoms ─────────────────────────────────────────────────────

function BroadcasterBadge({ name }: { name: string }) {
  const bg = BROADCASTER_COLORS[name] ?? '#374151';
  return (
    <span className="inline-block rounded px-2 py-0.5 text-xs font-bold text-white" style={{ backgroundColor: bg }}>
      {name}
    </span>
  );
}

function TeamLogo({ src, alt, size = 32 }: { src?: string; alt: string; size?: number }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) return null;
  return (
    <img src={src} alt="" width={size} height={size}
      className="object-contain shrink-0" style={{ width: size, height: size }}
      aria-hidden="true" onError={() => setErrored(true)}
    />
  );
}

function FormBadge({ result }: { result: string }) {
  const map: Record<string, { label: string; bg: string }> = {
    W: { label: 'V', bg: 'bg-green-600' },
    D: { label: 'E', bg: 'bg-amber-700' },
    L: { label: 'D', bg: 'bg-red-700' },
  };
  const entry = map[result] ?? { label: '?', bg: 'bg-zinc-600' };
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white font-display ${entry.bg}`}>
      {entry.label}
    </span>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────


// ─── Share ────────────────────────────────────────────────────────────────────

async function handleShare(text: string): Promise<void> {
  if (!text) return;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return;
    }
  }

  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer',
  );
}

function buildShareText(match: Match, broadcasters: string[]): string {
  const date = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(match.date));

  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(match.date));

  const lines = [
    `*${match.homeTeam.name} x ${match.awayTeam.name}*`,
    `${match.round} — ${match.competitionName}`,
    '',
    `Data: ${date} às ${time} (Brasília)`,
  ];

  const venue = [match.stadium, match.city].filter(Boolean).join(', ');
  if (venue) lines.push(`Local: ${venue}`);

  if (broadcasters.length > 0) {
    lines.push(`Onde assistir: ${broadcasters.join(', ')}`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.resenhaprejogo.app';
  if (siteUrl) lines.push('', siteUrl);

  return lines.join('\n');
}

// ─── Injury translations ──────────────────────────────────────────────────────

const INJURY_TYPE: Record<string, string> = {
  'Missing Fixture': 'Desfalque',
  'Questionable': 'Dúvida',
  'Doubtful': 'Dúvida',
};

const INJURY_REASON: Record<string, string> = {
  // Suspensions
  'Suspension': 'Suspensão',
  // Knee
  'Knee Injury': 'Lesão no joelho',
  'Knee Surgery': 'Cirurgia no joelho',
  'Knee Ligament Injury': 'Ligamento do joelho',
  'Cruciate Ligament Injury': 'Ligamento cruzado',
  'ACL': 'Lesão no LCA',
  // Leg / lower body
  'Hamstring Injury': 'Lesão na coxa posterior',
  'Thigh Injury': 'Lesão na coxa',
  'Calf Injury': 'Lesão na panturrilha',
  'Ankle Injury': 'Lesão no tornozelo',
  'Foot Injury': 'Lesão no pé',
  'Hip Injury': 'Lesão no quadril',
  'Groin Injury': 'Lesão na virilha',
  'Muscle Injury': 'Lesão muscular',
  // Upper body
  'Back Injury': 'Lesão nas costas',
  'Shoulder Injury': 'Lesão no ombro',
  'Elbow Injury': 'Lesão no cotovelo',
  'Wrist Injury': 'Lesão no pulso',
  'Rib Injury': 'Lesão na costela',
  'Neck Injury': 'Lesão no pescoço',
  'Head Injury': 'Lesão na cabeça',
  // Other
  'Fractured': 'Fratura',
  'Illness': 'Doença',
  'Knock': 'Pancada',
  'Fatigue': 'Fadiga',
  'Personal Reasons': 'Motivos pessoais',
  'International Duty': 'Seleção nacional',
  'Not in squad': 'Fora do elenco',
};

function translateInjuryType(raw: string): string {
  return INJURY_TYPE[raw] ?? raw;
}

function translateInjuryReason(raw: string): string {
  if (!raw) return '';
  // Try exact match first, then case-insensitive
  return INJURY_REASON[raw] ?? INJURY_REASON[raw.trim()] ?? raw;
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);
  useScrollLock();

  return (
    <div className="fixed inset-x-0 top-0 h-dvh z-50 flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef}
        className="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-800 flex-none">
          <div>
            <p className="text-sm font-semibold text-white font-sans">{title}</p>
            {subtitle && <p className="text-xs text-zinc-500 font-sans mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-600 ml-3 shrink-0"
            aria-label="Fechar">
            <XMarkIcon className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto scrollbar-none p-5 space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── H2H modal content ────────────────────────────────────────────────────────

function H2HModalContent({ data, match }: { data: H2HData; match: Match }) {
  const { stats, homeForm, awayForm, h2h, injuries } = data;
  const hasInjuries = injuries.length > 0;

  return (
    <>
      {/* Record */}
      {stats.totalGames > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 font-sans">
            Retrospecto — últimos {stats.totalGames} jogos
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-zinc-800 px-3 py-3 text-center">
              <p className="text-2xl font-black font-display text-green-400 leading-none">{stats.homeTeamWins}</p>
              <p className="text-xs text-zinc-500 font-sans mt-1 truncate">{match.homeTeam.shortName}</p>
            </div>
            <div className="rounded-xl bg-zinc-800 px-3 py-3 text-center">
              <p className="text-2xl font-black font-display text-zinc-400 leading-none">{stats.draws}</p>
              <p className="text-xs text-zinc-500 font-sans mt-1">Empates</p>
            </div>
            <div className="rounded-xl bg-zinc-800 px-3 py-3 text-center">
              <p className="text-2xl font-black font-display text-green-400 leading-none">{stats.awayTeamWins}</p>
              <p className="text-xs text-zinc-500 font-sans mt-1 truncate">{match.awayTeam.shortName}</p>
            </div>
          </div>
        </section>
      )}

      {/* Form */}
      {(homeForm.length > 0 || awayForm.length > 0) && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 font-sans">
            Forma na temporada
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 font-sans w-8 shrink-0">{match.homeTeam.shortName}</span>
              <div className="flex gap-1.5">
                {homeForm.map((r, i) => <FormBadge key={i} result={r} />)}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 font-sans w-8 shrink-0">{match.awayTeam.shortName}</span>
              <div className="flex gap-1.5">
                {awayForm.map((r, i) => <FormBadge key={i} result={r} />)}
              </div>
            </div>
          </div>
          <p className="text-xs text-zinc-700 mt-2 font-sans">Mais recente à esquerda</p>
        </section>
      )}

      {/* Recent encounters */}
      {h2h.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 font-sans">
            Confrontos recentes
          </p>
          <div className="space-y-1.5">
            {h2h.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className="flex-1 text-right text-zinc-300 truncate">{m.homeTeam}</span>
                <span className="flex items-center gap-1 font-bold font-display text-white tabular-nums shrink-0 px-2">
                  <SoccerBallIcon className="w-2.5 h-2.5 shrink-0" />
                  {m.homeScore ?? '–'}&thinsp;–&thinsp;{m.awayScore ?? '–'}
                </span>
                <span className="flex-1 text-zinc-300 truncate">{m.awayTeam}</span>
                <span className="text-zinc-600 shrink-0">{m.season}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {stats.totalGames === 0 && h2h.length === 0 && (
        <p className="text-sm text-zinc-500 font-sans text-center py-4">Sem confrontos anteriores registrados.</p>
      )}

      {/* Desfalques */}
      {hasInjuries && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 font-sans">
            Principais desfalques
          </p>
          <div className="space-y-2">
            {injuries.map((p, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 shrink-0" aria-hidden="true" />
                <span className="text-zinc-300 flex-1">{p.name}</span>
                <span className="text-zinc-500 shrink-0">{p.teamName}</span>
                <span className="text-zinc-600 shrink-0">{translateInjuryReason(p.reason) || translateInjuryType(p.type)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ─── Players modal content ────────────────────────────────────────────────────

function PlayersModalContent({ data, match }: { data: TeamPlayersData; match: Match }) {
  const teams = [
    { label: match.homeTeam.name, shortName: match.homeTeam.shortName, players: data.home },
    { label: match.awayTeam.name, shortName: match.awayTeam.shortName, players: data.away },
  ];

  return (
    <>
      {teams.map((team) => (
        <section key={team.label}>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 font-sans">
            {team.label}
          </p>
          {team.players.length === 0 ? (
            <p className="text-xs text-zinc-600 font-sans">Dados não disponíveis.</p>
          ) : (
            <div className="space-y-1">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-3 pb-1">
                <span className="text-xs text-zinc-600 font-sans">Jogador</span>
                <span className="flex items-center justify-center w-7 text-zinc-600" title="Gols"><SoccerBallIcon className="w-3 h-3" /></span>
                <span className="text-xs text-zinc-600 font-sans text-center w-7">A</span>
                <span className="text-xs text-zinc-600 font-sans text-center w-7">J</span>
              </div>
              {team.players.map((p, i) => (
                <div key={i}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center rounded-lg bg-zinc-800/50 px-3 py-2.5">
                  <span className="text-sm text-zinc-200 font-sans truncate">{p.name}</span>
                  <span className="text-sm font-bold font-display text-white tabular-nums text-center w-7">{p.goals}</span>
                  <span className="text-sm font-bold font-display text-zinc-400 tabular-nums text-center w-7">{p.assists}</span>
                  <span className="text-xs text-zinc-600 font-sans tabular-nums text-center w-7">{p.appearances}</span>
                </div>
              ))}
              <p className="flex items-center gap-1 text-xs text-zinc-700 pt-1 px-1 font-sans"><SoccerBallIcon className="w-3 h-3 shrink-0" /> = Gols · A = Assistências · J = Jogos</p>
            </div>
          )}
        </section>
      ))}
    </>
  );
}

// ─── Non-CBF match modal (Libertadores, Copa do Brasil, Sul-Americana) ───────

/**
 * Simplified ficha for competitions not covered by CBF.
 * Shows phase banner, score from the API-Football match object, and injuries.
 */
function NonCbfFichaContent({
  match,
  isLive,
  hoursUntilKickoff,
  injuries,
  injuriesLoading,
}: {
  match: Match;
  isLive: boolean;
  hoursUntilKickoff: number;
  injuries: InjuredPlayer[];
  injuriesLoading: boolean;
}) {
  const isPostMatch = hoursUntilKickoff < -(LIVE_WINDOW_MS / 3_600_000);

  const phaseBanner = isLive
    ? { label: 'Ao Vivo', cls: 'text-green-400 border-green-400/30 bg-green-400/10' }
    : isPostMatch
    ? { label: 'Encerrado', cls: 'text-zinc-400 border-zinc-700 bg-zinc-800' }
    : { label: `Pré-jogo · ${hoursUntilKickoff > 24 ? `${Math.ceil(hoursUntilKickoff / 24)}d` : `${Math.round(hoursUntilKickoff)}h`}`, cls: 'text-zinc-400 border-zinc-700 bg-zinc-800' };

  const hasScore = isPostMatch && match.score?.home !== null && match.score?.away !== null;

  return (
    <>
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold font-sans mb-1 ${phaseBanner.cls}`}>
        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" aria-hidden="true" />}
        {phaseBanner.label}
      </div>

      {/* Score — available from API-Football for finished matches */}
      <section>
        <SectionHeader label="Resultado" />
        {hasScore ? (
          <div className="flex items-center justify-center gap-6 rounded-xl bg-zinc-800 py-4 px-4">
            <p className="flex-1 text-right text-xs text-zinc-400 font-sans truncate">{match.homeTeam.name}</p>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-4xl font-black font-display text-white tabular-nums">{match.score!.home}</span>
              <span className="text-xl font-black font-display text-zinc-600">–</span>
              <span className="text-4xl font-black font-display text-white tabular-nums">{match.score!.away}</span>
            </div>
            <p className="flex-1 text-left text-xs text-zinc-400 font-sans truncate">{match.awayTeam.name}</p>
          </div>
        ) : isLive ? (
          <Pending>Jogo em andamento — placar atualizado após o apito final</Pending>
        ) : (
          <Pending>Disponível após o apito final</Pending>
        )}
      </section>

      {/* Injuries — fetched via H2H endpoint, available for all competitions */}
      <section>
        <SectionHeader label="Principais Desfalques" />
        {injuriesLoading ? (
          <div className="space-y-1 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-zinc-800 rounded-lg" />
            ))}
          </div>
        ) : injuries.length > 0 ? (
          <div className="space-y-1">
            {injuries.map((p, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 shrink-0" aria-hidden="true" />
                <span className="text-zinc-200 flex-1 truncate">{p.name}</span>
                <span className="text-zinc-500 shrink-0">{p.teamName}</span>
                <span className="text-zinc-600 shrink-0">{translateInjuryReason(p.reason) || translateInjuryType(p.type)}</span>
              </div>
            ))}
          </div>
        ) : (
          <Pending>Sem desfalques confirmados</Pending>
        )}
      </section>

      <p className="text-xs text-zinc-700 font-sans text-center">
        Ficha detalhada disponível apenas para Brasileirão Série A
      </p>
    </>
  );
}

// ─── CBF match sheet modal content ───────────────────────────────────────────

const CARD_COLORS: Record<string, string> = {
  AMARELO: 'bg-yellow-400',
  VERMELHO: 'bg-red-600',
  VERMELHO2AMARELO: 'bg-red-600',
};

const CARD_LABELS: Record<string, string> = {
  AMARELO: 'Amarelo',
  VERMELHO: 'Vermelho',
  VERMELHO2AMARELO: '2º Amarelo',
};

const REFEREE_ROLES: Record<string, string> = {
  Arbitro: 'Principal',
  'Arbitro Assistente 1': 'Assistente 1',
  'Arbitro Assistente 2': 'Assistente 2',
  'Quarto Arbitro': '4º Árbitro',
  VAR: 'VAR',
  AVAR: 'AVAR',
  AVAR2: 'AVAR2',
};

/** Pill showing that a section's data isn't published yet */
function Pending({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-3 py-2.5 text-xs font-sans text-zinc-500">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" aria-hidden="true" />
      {children}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 font-sans">
      {label}
    </p>
  );
}

/**
 * Ficha modal content with explicit availability stages.
 *
 * Phases (derived from kickoff time):
 *  - future   : kickoff > 48 h away — referee not yet confirmed, no game data
 *  - upcoming  : kickoff ≤ 48 h away — referee likely confirmed
 *  - live      : currently being played — referee confirmed, score updating
 *  - post_match: kickoff + LIVE_WINDOW_MS passed — full data expected
 */
function CbfMatchModalContent({
  data,
  match,
  isLive,
  hoursUntilKickoff,
  injuries,
  injuriesLoading,
}: {
  data: CbfMatchDetail | null;
  match: Match;
  isLive: boolean;
  hoursUntilKickoff: number; // negative = kickoff already passed
  injuries: InjuredPlayer[];
  injuriesLoading: boolean;
}) {
  const isPostMatch = hoursUntilKickoff < -(LIVE_WINDOW_MS / 3_600_000);
  const refereeLikelyConfirmed = hoursUntilKickoff <= 48;

  // ── Derived data ──────────────────────────────────────────────────────────
  const hasScore = !!(data && data.mandante.gols !== '' && data.mandante.gols !== null &&
                      data.visitante.gols !== '' && data.visitante.gols !== null);
  const homeGoals  = data?.gols.filter((g) => g.clubeId === data.mandante.id) ?? [];
  const awayGoals  = data?.gols.filter((g) => g.clubeId === data.visitante.id) ?? [];
  const homeCards  = data?.cartoes.filter((c) => c.clubeId === data.mandante.id) ?? [];
  const awayCards  = data?.cartoes.filter((c) => c.clubeId === data.visitante.id) ?? [];
  const homeStarters = data?.mandante.atletas.filter((a) => !a.reserva && a.entrouJogando) ?? [];
  const awayStarters = data?.visitante.atletas.filter((a) => !a.reserva && a.entrouJogando) ?? [];

  const mainRef  = data?.arbitros.find((a) => a.funcao === 'Arbitro');
  const varRef   = data?.arbitros.find((a) => a.funcao === 'VAR');
  const otherRefs = data?.arbitros.filter(
    (a) => a.funcao !== 'Arbitro' && a.funcao !== 'VAR' &&
           !['Inspetor','Assessor','Quality manager','Observador de VAR'].includes(a.funcao),
  ) ?? [];

  // Fallback: referee from API-Football when CBF hasn't published yet
  const refName = mainRef?.nome ?? match.referee;

  // ── Phase banner ──────────────────────────────────────────────────────────
  const phaseBanner = isLive
    ? { label: 'Ao Vivo', cls: 'text-green-400 border-green-400/30 bg-green-400/10' }
    : isPostMatch
    ? { label: 'Encerrado', cls: 'text-zinc-400 border-zinc-700 bg-zinc-800' }
    : hoursUntilKickoff <= 48
    ? { label: `Pré-jogo · ${Math.round(hoursUntilKickoff)}h`, cls: 'text-amber-400 border-amber-400/30 bg-amber-400/10' }
    : { label: `Pré-jogo · ${Math.ceil(hoursUntilKickoff / 24)}d`, cls: 'text-zinc-400 border-zinc-700 bg-zinc-800' };

  return (
    <>
      {/* Phase banner */}
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold font-sans mb-1 ${phaseBanner.cls}`}>
        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" aria-hidden="true" />}
        {phaseBanner.label}
      </div>
      {!isLive && !isPostMatch && hoursUntilKickoff > 48 && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-600 font-sans mb-1">
          <ClockIcon className="w-3 h-3 shrink-0" />
          Árbitros e escalações ficam disponíveis ~48h antes do jogo
        </p>
      )}

      {/* ── Resultado ─────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Resultado" />
        {hasScore ? (
          <div className="flex items-center justify-center gap-6 rounded-xl bg-zinc-800 py-4 px-4">
            <p className="flex-1 text-right text-xs text-zinc-400 font-sans truncate">{match.homeTeam.name}</p>
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-4xl font-black font-display text-white tabular-nums">{data!.mandante.gols}</span>
                <span className="text-xl font-black font-display text-zinc-600">–</span>
                <span className="text-4xl font-black font-display text-white tabular-nums">{data!.visitante.gols}</span>
              </div>
              <span className="flex items-center gap-0.5 text-[9px] font-semibold text-zinc-600 font-sans uppercase tracking-wide">
                <SoccerBallIcon className="w-2.5 h-2.5 shrink-0" /> Gols
              </span>
            </div>
            <p className="flex-1 text-left text-xs text-zinc-400 font-sans truncate">{match.awayTeam.name}</p>
          </div>
        ) : (
          <Pending>
            {isLive ? 'Jogo em andamento — placar não disponível aqui' : 'Disponível após o apito final'}
          </Pending>
        )}
      </section>

      {/* ── Gols ──────────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Gols" />
        {(homeGoals.length > 0 || awayGoals.length > 0) ? (
          <div className="space-y-1">
            {[...homeGoals.map(g => ({ ...g, short: match.homeTeam.shortName })),
               ...awayGoals.map(g => ({ ...g, short: match.awayTeam.shortName }))].map((g, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <SoccerBallIcon className="w-4 h-4 shrink-0" />
                <span className="font-medium text-zinc-200 flex-1">{g.atletaApelido || g.atletaNome}</span>
                <span className="text-zinc-500">{g.short}</span>
                <span className="text-zinc-600 tabular-nums">{g.minutos}&apos;</span>
              </div>
            ))}
          </div>
        ) : (
          <Pending>{isPostMatch ? 'Sem gols registrados' : 'Disponível após o apito final'}</Pending>
        )}
      </section>

      {/* ── Cartões ───────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Cartões" />
        {(homeCards.length > 0 || awayCards.length > 0) ? (
          <div className="space-y-1">
            {[...homeCards, ...awayCards].map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className={`inline-block w-2.5 h-3.5 rounded-sm shrink-0 ${CARD_COLORS[c.resultado] ?? 'bg-zinc-500'}`} aria-hidden="true" />
                <span className="font-medium text-zinc-200 flex-1">{c.atletaApelido || c.atletaNome}</span>
                <span className="text-zinc-500 shrink-0">
                  {c.clubeId === data!.mandante.id ? match.homeTeam.shortName : match.awayTeam.shortName}
                </span>
                <span className="text-zinc-600 shrink-0">{CARD_LABELS[c.resultado] ?? c.resultado}</span>
                <span className="text-zinc-600 tabular-nums shrink-0">{c.minutos}&apos;</span>
              </div>
            ))}
          </div>
        ) : (
          <Pending>{isPostMatch ? 'Sem cartões registrados' : 'Disponível após o apito final'}</Pending>
        )}
      </section>

      {/* ── Escalação ─────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Escalação" />
        {(homeStarters.length > 0 || awayStarters.length > 0) ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: match.homeTeam.shortName, players: homeStarters },
              { label: match.awayTeam.shortName, players: awayStarters },
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
          <Pending>
            {isPostMatch
              ? 'Escalação não publicada'
              : isLive
              ? 'Sendo confirmada'
              : 'Publicada ~48h antes do jogo'}
          </Pending>
        )}
      </section>

      {/* ── Arbitragem ────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="Arbitragem" />
        {refName || mainRef ? (
          <div className="space-y-1">
            {(mainRef || refName) && (
              <div className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className="text-zinc-400 font-medium w-20 shrink-0">Principal</span>
                <span className="text-zinc-200 flex-1">{mainRef?.nome ?? refName}</span>
                {mainRef?.uf && <span className="text-zinc-600 shrink-0">{mainRef.uf}</span>}
              </div>
            )}
            {varRef && (
              <div className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className="text-zinc-400 font-medium w-20 shrink-0">VAR</span>
                <span className="text-zinc-200 flex-1">{varRef.nome}</span>
                <span className="text-zinc-600 shrink-0">{varRef.uf}</span>
              </div>
            )}
            {otherRefs.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className="text-zinc-500 w-20 shrink-0">{REFEREE_ROLES[r.funcao] ?? r.funcao}</span>
                <span className="text-zinc-400 flex-1">{r.nome}</span>
                <span className="text-zinc-600 shrink-0">{r.uf}</span>
              </div>
            ))}
          </div>
        ) : (
          <Pending>
            {refereeLikelyConfirmed ? 'Não publicada pelo CBF' : 'Confirmada ~48h antes do jogo'}
          </Pending>
        )}
      </section>

      {/* ── Principais Desfalques ──────────────────────────────────────── */}
      <section>
        <SectionHeader label="Principais Desfalques" />
        {injuriesLoading ? (
          <div className="space-y-1 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-zinc-800 rounded-lg" />
            ))}
          </div>
        ) : injuries.length > 0 ? (
          <div className="space-y-1">
            {injuries.map((p, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 shrink-0" aria-hidden="true" />
                <span className="text-zinc-200 flex-1 truncate">{p.name}</span>
                <span className="text-zinc-500 shrink-0">{p.teamName}</span>
                <span className="text-zinc-600 shrink-0">{translateInjuryReason(p.reason) || translateInjuryType(p.type)}</span>
              </div>
            ))}
          </div>
        ) : (
          <Pending>Sem desfalques confirmados</Pending>
        )}
      </section>
    </>
  );
}

// ─── Inline form strip ────────────────────────────────────────────────────────

function FormStrip({ homeForm, awayForm, loading }: { homeForm: string[]; awayForm: string[]; loading: boolean }) {

  const noData = !loading && homeForm.length === 0 && awayForm.length === 0;
  if (noData) return null;

  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      {loading ? (
        <>
          <div className="flex gap-1 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="w-5 h-5 bg-zinc-800 rounded" />)}
          </div>
          <div className="flex gap-1 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="w-5 h-5 bg-zinc-800 rounded" />)}
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-1">
            {homeForm.map((r, i) => <FormBadge key={i} result={r} />)}
          </div>
          <div className="flex gap-1">
            {awayForm.map((r, i) => <FormBadge key={i} result={r} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

type ActiveModal = 'h2h' | 'players' | 'ficha' | null;
type FetchStatus = 'idle' | 'loading' | 'done' | 'not_found' | 'error';

export function MatchCard({
  match,
  highlightClubId,
  preview,
  previewLoading,
  noEmailGate = false,
}: {
  match: Match;
  highlightClubId: string;
  preview?: MatchPreview;
  previewLoading: boolean;
  noEmailGate?: boolean;
}) {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [h2hData, setH2hData] = useState<H2HData | null>(null);
  const [h2hStatus, setH2hStatus] = useState<FetchStatus>('idle');
  const [playersData, setPlayersData] = useState<TeamPlayersData | null>(null);
  const [playersStatus, setPlayersStatus] = useState<FetchStatus>('idle');
  const [fichaData, setFichaData] = useState<CbfMatchDetail | null>(null);
  const [fichaStatus, setFichaStatus] = useState<FetchStatus>('idle');

  const [emailRegistered, setEmailRegistered] = useState(false);
  const [emailGateOpen, setEmailGateOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setEmailRegistered(localStorage.getItem(EMAIL_REGISTERED_KEY) === '1');
  }, []);

  function withEmailGate(action: () => void) {
    if (noEmailGate || emailRegistered) {
      action();
    } else {
      pendingActionRef.current = action;
      setEmailGateOpen(true);
    }
  }

  function handleEmailGateClose() {
    const nowRegistered = localStorage.getItem(EMAIL_REGISTERED_KEY) === '1';
    if (nowRegistered) {
      setEmailRegistered(true);
      pendingActionRef.current?.();
    }
    pendingActionRef.current = null;
    setEmailGateOpen(false);
  }

  function openH2HModal() {
    setActiveModal('h2h');
    if (h2hStatus !== 'idle') return;
    setH2hStatus('loading');
    const params = new URLSearchParams({ home: match.homeTeam.id, away: match.awayTeam.id, fixture: match.id, leagueId: String(match.leagueId) });
    fetch(`/api/h2h?${params}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<H2HData>; })
      .then((d) => { setH2hData(d); setH2hStatus('done'); })
      .catch(() => setH2hStatus('error'));
  }

  function openPlayersModal() {
    setActiveModal('players');
    if (playersStatus !== 'idle') return;
    setPlayersStatus('loading');
    fetch(`/api/players?home=${match.homeTeam.id}&away=${match.awayTeam.id}&leagueId=${match.leagueId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<TeamPlayersData>; })
      .then((d) => { setPlayersData(d); setPlayersStatus('done'); })
      .catch(() => setPlayersStatus('error'));
  }

  function openFichaModal() {
    setActiveModal('ficha');
    // Always fetch h2h in background for injuries data (all competitions)
    if (h2hStatus === 'idle') {
      setH2hStatus('loading');
      const h2hParams = new URLSearchParams({ home: match.homeTeam.id, away: match.awayTeam.id, fixture: match.id, leagueId: String(match.leagueId) });
      fetch(`/api/h2h?${h2hParams}`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<H2HData>; })
        .then((d) => { setH2hData(d); setH2hStatus('done'); })
        .catch(() => setH2hStatus('error'));
    }
    if (fichaStatus !== 'idle') return;
    // Non-Série-A: CBF does not cover this competition — skip the CBF fetch entirely
    if (match.leagueId !== 71) {
      setFichaStatus('not_found');
      return;
    }
    setFichaStatus('loading');
    const round = match.round.match(/(\d+)/)?.[1] ?? '';
    const params = new URLSearchParams({ home: match.homeTeam.id, away: match.awayTeam.id, round });
    fetch(`/api/cbf/match?${params}`)
      .then((r) => {
        // 4xx = CBF doesn't have the data yet (round not published) — not an error
        if (r.status >= 400 && r.status < 500) { setFichaStatus('not_found'); return null; }
        if (!r.ok) throw new Error();
        return r.json() as Promise<CbfMatchDetail>;
      })
      .then((d) => { if (d) { setFichaData(d); setFichaStatus('done'); } })
      .catch(() => setFichaStatus('error'));
  }

  const homeIsHighlighted = match.homeTeam.id === highlightClubId;
  const awayIsHighlighted = match.awayTeam.id === highlightClubId;
  const hasVenue = match.stadium !== null || match.city !== null;
  const broadcasters = preview?.broadcasters ?? [];
  const kickoffMs = new Date(match.date).getTime();
  const nowMs = Date.now();
  const live = match.status !== 'postponed' && nowMs >= kickoffMs && nowMs <= kickoffMs + LIVE_WINDOW_MS;
  const daysUntilRender = (kickoffMs - nowMs) / 86_400_000;
  const outsideSearchWindow = !live && (daysUntilRender < 0 || daysUntilRender > DAYS_AHEAD_FOR_BROADCAST_SEARCH);

  // Hours until kickoff — used for ficha availability labelling (negative = past)
  const hoursUntilKickoff = (kickoffMs - nowMs) / 3_600_000;
  const isPostMatch = hoursUntilKickoff < -(LIVE_WINDOW_MS / 3_600_000);
  // Label shown inside the Ficha button to communicate what's available.
  // Non-Série-A competitions are not covered by CBF, so pre-match hints differ.
  const fichaHint = live
    ? 'Ao vivo'
    : isPostMatch
    ? 'Resultado'
    : match.leagueId === 71
    ? hoursUntilKickoff <= 48 ? 'Árbitro' : '48h antes'
    : 'Lesões';

  return (
    <>
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/60">
          <span className="text-xs font-medium text-zinc-400 truncate font-sans">{match.competitionName}</span>
          <div className="ml-2 flex-none flex items-center gap-2">
            {live && (
              <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-green-400 border border-green-400/30 bg-green-400/10 font-sans">
                <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
                Ao Vivo
              </span>
            )}
            <span className="rounded-full px-3 py-0.5 text-xs font-bold font-display tracking-wide"
              style={{ backgroundColor: 'var(--club-primary)', color: 'var(--club-text-on-primary)' }}>
              {match.round}
            </span>
          </div>
        </div>

        <div className="p-4">
          {/* Teams */}
          <div className="flex items-center gap-3">
            <div className={['flex-1 flex items-center justify-end gap-2',
              homeIsHighlighted ? 'text-white font-bold' : 'text-zinc-300 font-medium'].join(' ')}>
              <div className="text-right">
                <span className="block text-xl leading-tight font-display tracking-wide">{match.homeTeam.name}</span>
                <span className="text-xs text-zinc-500 font-sans">{match.homeTeam.shortName}</span>
              </div>
              <TeamLogo src={match.homeTeam.logo} alt={match.homeTeam.name} size={32} />
            </div>
            <div className="flex-none px-1">
              <span className="text-sm font-black text-zinc-500 tracking-widest font-display">VS</span>
            </div>
            <div className={['flex-1 flex items-center gap-2',
              awayIsHighlighted ? 'text-white font-bold' : 'text-zinc-300 font-medium'].join(' ')}>
              <TeamLogo src={match.awayTeam.logo} alt={match.awayTeam.name} size={32} />
              <div>
                <span className="block text-xl leading-tight font-display tracking-wide">{match.awayTeam.name}</span>
                <span className="text-xs text-zinc-500 font-sans">{match.awayTeam.shortName}</span>
              </div>
            </div>
          </div>

          {/* Date / Venue */}
          <div className={`mt-4 grid gap-3 text-sm ${hasVenue ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="rounded-lg bg-zinc-800 px-3 py-2.5">
              <p className="text-xs text-zinc-500 mb-0.5 font-sans">Data &amp; Hora</p>
              <p className="font-semibold text-white capitalize font-display tracking-wide">{formatDate(match.date)}</p>
              {live ? (
                <p className="flex items-center gap-1.5 text-green-400 text-sm font-bold font-sans">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" aria-hidden="true" />
                  Em andamento
                </p>
              ) : (
                <p className="text-zinc-300 text-sm font-sans">{formatTime(match.date)} · Brasília</p>
              )}
            </div>
            {hasVenue && (
              <div className="rounded-lg bg-zinc-800 px-3 py-2.5">
                <p className="text-xs text-zinc-500 mb-0.5 font-sans">Local</p>
                {match.stadium && <p className="font-semibold text-white font-display tracking-wide">{match.stadium}</p>}
                {match.city && <p className="text-zinc-300 text-xs font-sans">{match.city}</p>}
              </div>
            )}
          </div>

          {/* Broadcasters */}
          <div className="mt-3 flex items-center gap-2 flex-wrap min-h-[22px]">
            <span className="text-xs text-zinc-500 font-sans">Onde assistir:</span>
            {previewLoading && (
              <span className="inline-block h-4 w-24 rounded bg-zinc-700 animate-pulse" aria-hidden="true" />
            )}
            {!previewLoading && broadcasters.length > 0 && broadcasters.map((b: string) => <BroadcasterBadge key={b} name={b} />)}
            {!previewLoading && broadcasters.length === 0 && (
              <span className="text-xs text-zinc-600 font-sans italic">
                {outsideSearchWindow
                  ? 'disponível em breve'
                  : daysUntilRender >= 2
                    ? 'grade ainda não publicada'
                    : 'transmissão não confirmada'}
              </span>
            )}
          </div>

          {/* Form strip */}
          <FormStrip
            homeForm={preview?.homeForm ?? []}
            awayForm={preview?.awayForm ?? []}
            loading={previewLoading}
          />

          {/* Action buttons */}
          <div className="mt-4 pt-4 border-t border-zinc-800 grid grid-cols-4 gap-2">
            <button
              onClick={() => withEmailGate(openH2HModal)}
              aria-label="Ver confronto direto"
              className="flex flex-col items-center justify-center gap-1 rounded-xl border bg-zinc-800/60 border-zinc-700/50 px-1 min-h-[52px] text-[10px] font-medium font-sans text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-600 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
            >
              <ClockIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
              Confronto
            </button>
            <button
              onClick={() => withEmailGate(openPlayersModal)}
              aria-label="Ver jogadores"
              className="flex flex-col items-center justify-center gap-1 rounded-xl border bg-zinc-800/60 border-zinc-700/50 px-1 min-h-[52px] text-[10px] font-medium font-sans text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-600 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
            >
              <UsersIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
              Jogadores
            </button>
            <button
              onClick={() => withEmailGate(openFichaModal)}
              aria-label="Ver ficha do jogo"
              className="flex flex-col items-center justify-center gap-0.5 rounded-xl border bg-zinc-800/60 border-zinc-700/50 px-1 min-h-[52px] text-[10px] font-medium font-sans text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-600 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
            >
              <DocumentTextIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Ficha</span>
              <span className={`text-[9px] font-sans leading-none ${live ? 'text-green-400' : 'text-zinc-600'}`}>{fichaHint}</span>
            </button>
            <button
              onClick={() => handleShare(buildShareText(match, broadcasters))}
              className="flex flex-col items-center justify-center gap-1 rounded-xl bg-zinc-800/60 border border-zinc-700/50 px-1 min-h-[52px] text-[10px] font-medium font-sans text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-600 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
              aria-label="Compartilhar jogo"
            >
              <ShareIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
              Enviar
            </button>
          </div>

          {/* Referee */}
          <div className="mt-3 flex items-center gap-2 text-xs font-sans">
            <span className="text-zinc-500">Arbitragem:</span>
            {fichaData?.arbitros?.find((a) => a.funcao === 'Arbitro')?.nome
              ? <span className="text-zinc-300">{fichaData.arbitros.find((a) => a.funcao === 'Arbitro')!.nome}</span>
              : match.referee
                ? <span className="text-zinc-300">{match.referee}</span>
                : <span className="text-zinc-600 italic">a confirmar</span>
            }
          </div>
        </div>
      </article>

      {/* H2H Modal */}
      {activeModal === 'h2h' && (
        <ModalShell
          title="Confronto Direto"
          subtitle={`${match.homeTeam.shortName} × ${match.awayTeam.shortName}`}
          onClose={() => setActiveModal(null)}
        >
          {h2hStatus === 'loading' && (
            <div className="space-y-4 animate-pulse">
              <div className="grid grid-cols-3 gap-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 bg-zinc-800 rounded-xl" />)}</div>
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-zinc-800 rounded-lg" />)}</div>
            </div>
          )}
          {h2hStatus === 'error' && <p className="text-sm text-zinc-500 font-sans text-center py-4">Não foi possível carregar os dados.</p>}
          {h2hStatus === 'done' && h2hData && <H2HModalContent data={h2hData} match={match} />}
        </ModalShell>
      )}

      {/* Players Modal */}
      {activeModal === 'players' && (
        <ModalShell
          title="Destaques da Temporada"
          subtitle={`${match.homeTeam.shortName} × ${match.awayTeam.shortName} · ${match.competitionName} ${new Date().getFullYear()}`}
          onClose={() => setActiveModal(null)}
        >
          {playersStatus === 'loading' && (
            <div className="space-y-4 animate-pulse">
              {Array.from({ length: 2 }).map((_, s) => (
                <div key={s} className="space-y-2">
                  <div className="h-4 w-32 bg-zinc-800 rounded" />
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-zinc-800 rounded-lg" />)}
                </div>
              ))}
            </div>
          )}
          {playersStatus === 'error' && <p className="text-sm text-zinc-500 font-sans text-center py-4">Não foi possível carregar os dados.</p>}
          {playersStatus === 'done' && playersData && <PlayersModalContent data={playersData} match={match} />}
        </ModalShell>
      )}

      {/* Email gate */}
      {emailGateOpen && (
        <EmailCaptureModal onClose={handleEmailGateClose} />
      )}

      {/* Ficha Modal */}
      {activeModal === 'ficha' && (
        <ModalShell
          title="Ficha do Jogo"
          subtitle={`${match.homeTeam.shortName} × ${match.awayTeam.shortName} · ${match.round}`}
          onClose={() => setActiveModal(null)}
        >
          {fichaStatus === 'loading' && (
            <div className="space-y-4 animate-pulse">
              <div className="h-6 w-24 bg-zinc-800 rounded-full" />
              <div className="h-16 bg-zinc-800 rounded-xl" />
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-zinc-800 rounded-lg" />)}</div>
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 bg-zinc-800 rounded-lg" />)}</div>
            </div>
          )}
          {fichaStatus === 'error' && (
            <p className="text-sm text-zinc-500 font-sans text-center py-4">
              Erro ao carregar a ficha. Tente novamente.
            </p>
          )}
          {fichaStatus === 'not_found' && match.leagueId !== 71 && (
            <NonCbfFichaContent
              match={match}
              isLive={live}
              hoursUntilKickoff={hoursUntilKickoff}
              injuries={h2hData?.injuries ?? []}
              injuriesLoading={h2hStatus === 'loading'}
            />
          )}
          {fichaStatus === 'not_found' && match.leagueId === 71 && (
            <CbfMatchModalContent
              data={null}
              match={match}
              isLive={live}
              hoursUntilKickoff={hoursUntilKickoff}
              injuries={h2hData?.injuries ?? []}
              injuriesLoading={h2hStatus === 'loading'}
            />
          )}
          {fichaStatus === 'done' && fichaData && (
            <CbfMatchModalContent
              data={fichaData}
              match={match}
              isLive={live}
              hoursUntilKickoff={hoursUntilKickoff}
              injuries={h2hData?.injuries ?? []}
              injuriesLoading={h2hStatus === 'loading'}
            />
          )}
        </ModalShell>
      )}

    </>
  );
}
