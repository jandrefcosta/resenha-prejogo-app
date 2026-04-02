'use client';

import { useEffect, useRef, useState } from 'react';
import type { Match, H2HData, MatchPreview, TeamPlayersData, CbfMatchDetail } from '@/lib/types';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { LIVE_WINDOW_MS } from '@/lib/matchConstants';

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
    D: { label: 'E', bg: 'bg-amber-500' },
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


function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
    </svg>
  );
}

function PlayersIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 17a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z" />
    </svg>
  );
}

function FichaIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path fillRule="evenodd" d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6Zm2 7a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1Zm0 3a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H9a1 1 0 0 1-1-1Z" clipRule="evenodd" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
    </svg>
  );
}

// ─── WhatsApp share ───────────────────────────────────────────────────────────

function buildWhatsAppMessage(match: Match, broadcasters: string[]): string {
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
    `${match.round} — ${match.competition}`,
    '',
    `Data: ${date} às ${time} (Brasília)`,
  ];

  const venue = [match.stadium, match.city].filter(Boolean).join(', ');
  if (venue) lines.push(`Local: ${venue}`);

  if (broadcasters.length > 0) {
    lines.push(`Onde assistir: ${broadcasters.join(', ')}`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_BASE_URL ?? (typeof window !== 'undefined' ? window.location.origin : '');
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

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

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
            <CloseIcon />
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
                <span className="font-bold font-display text-white tabular-nums shrink-0 px-2">
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
                <span className="text-xs text-zinc-600 font-sans text-center w-7">G</span>
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
              <p className="text-xs text-zinc-700 pt-1 px-1 font-sans">G = Gols · A = Assistências · J = Jogos</p>
            </div>
          )}
        </section>
      ))}
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

function CbfMatchModalContent({ data, match }: { data: CbfMatchDetail; match: Match }) {
  const mainRef = data.arbitros.find((a) => a.funcao === 'Arbitro');
  const varRef = data.arbitros.find((a) => a.funcao === 'VAR');
  const otherRefs = data.arbitros.filter(
    (a) => a.funcao !== 'Arbitro' && a.funcao !== 'VAR' && a.funcao !== 'Inspetor' && a.funcao !== 'Assessor' && a.funcao !== 'Quality manager' && a.funcao !== 'Observador de VAR',
  );

  const hasScore = data.mandante.gols !== '' && data.visitante.gols !== '';
  const homeGoals = data.gols.filter((g) => g.clubeId === data.mandante.id);
  const awayGoals = data.gols.filter((g) => g.clubeId === data.visitante.id);
  const homeCards = data.cartoes.filter((c) => c.clubeId === data.mandante.id);
  const awayCards = data.cartoes.filter((c) => c.clubeId === data.visitante.id);

  const homeStarters = data.mandante.atletas.filter((a) => !a.reserva && a.entrouJogando);
  const awayStarters = data.visitante.atletas.filter((a) => !a.reserva && a.entrouJogando);

  return (
    <>
      {/* Score */}
      {hasScore && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 font-sans">Resultado</p>
          <div className="flex items-center justify-center gap-6 rounded-xl bg-zinc-800 py-4 px-4">
            <div className="flex-1 text-right">
              <p className="text-xs text-zinc-400 font-sans truncate">{match.homeTeam.name}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-4xl font-black font-display text-white tabular-nums">{data.mandante.gols}</span>
              <span className="text-xl font-black font-display text-zinc-600">–</span>
              <span className="text-4xl font-black font-display text-white tabular-nums">{data.visitante.gols}</span>
            </div>
            <div className="flex-1 text-left">
              <p className="text-xs text-zinc-400 font-sans truncate">{match.awayTeam.name}</p>
            </div>
          </div>
        </section>
      )}

      {/* Goals */}
      {data.gols.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 font-sans">Gols</p>
          <div className="space-y-1">
            {homeGoals.map((g, i) => (
              <div key={`hg-${i}`} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className="text-base leading-none">⚽</span>
                <span className="font-medium text-zinc-200 flex-1">{g.atletaApelido || g.atletaNome}</span>
                <span className="text-zinc-500">{match.homeTeam.shortName}</span>
                <span className="text-zinc-600 tabular-nums">{g.minutos}&apos;</span>
              </div>
            ))}
            {awayGoals.map((g, i) => (
              <div key={`ag-${i}`} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className="text-base leading-none">⚽</span>
                <span className="font-medium text-zinc-200 flex-1">{g.atletaApelido || g.atletaNome}</span>
                <span className="text-zinc-500">{match.awayTeam.shortName}</span>
                <span className="text-zinc-600 tabular-nums">{g.minutos}&apos;</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cards */}
      {data.cartoes.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 font-sans">Cartões</p>
          <div className="space-y-1">
            {[...homeCards, ...awayCards].map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className={`inline-block w-2.5 h-3.5 rounded-sm shrink-0 ${CARD_COLORS[c.resultado] ?? 'bg-zinc-500'}`} aria-hidden="true" />
                <span className="font-medium text-zinc-200 flex-1">{c.atletaApelido || c.atletaNome}</span>
                <span className="text-zinc-500 shrink-0">
                  {c.clubeId === data.mandante.id ? match.homeTeam.shortName : match.awayTeam.shortName}
                </span>
                <span className="text-zinc-600 shrink-0">{CARD_LABELS[c.resultado] ?? c.resultado}</span>
                <span className="text-zinc-600 tabular-nums shrink-0">{c.minutos}&apos;</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lineups */}
      {(homeStarters.length > 0 || awayStarters.length > 0) && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 font-sans">Escalação</p>
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
        </section>
      )}

      {/* Referee panel */}
      {data.arbitros.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 font-sans">Arbitragem</p>
          <div className="space-y-1">
            {mainRef && (
              <div className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2 text-xs font-sans">
                <span className="text-zinc-400 font-medium w-20 shrink-0">Principal</span>
                <span className="text-zinc-200 flex-1">{mainRef.nome}</span>
                <span className="text-zinc-600 shrink-0">{mainRef.uf}</span>
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
        </section>
      )}

      {!hasScore && data.gols.length === 0 && data.arbitros.length === 0 && (
        <p className="text-sm text-zinc-500 font-sans text-center py-4">Ficha ainda não disponível.</p>
      )}
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
type FetchStatus = 'idle' | 'loading' | 'done' | 'error';

export function MatchCard({
  match,
  highlightClubId,
  preview,
  previewLoading,
}: {
  match: Match;
  highlightClubId: string;
  preview?: MatchPreview;
  previewLoading: boolean;
}) {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [h2hData, setH2hData] = useState<H2HData | null>(null);
  const [h2hStatus, setH2hStatus] = useState<FetchStatus>('idle');
  const [playersData, setPlayersData] = useState<TeamPlayersData | null>(null);
  const [playersStatus, setPlayersStatus] = useState<FetchStatus>('idle');
  const [fichaData, setFichaData] = useState<CbfMatchDetail | null>(null);
  const [fichaStatus, setFichaStatus] = useState<FetchStatus>('idle');

  function openH2HModal() {
    setActiveModal('h2h');
    if (h2hStatus !== 'idle') return;
    setH2hStatus('loading');
    const params = new URLSearchParams({ home: match.homeTeam.id, away: match.awayTeam.id, fixture: match.id });
    fetch(`/api/h2h?${params}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<H2HData>; })
      .then((d) => { setH2hData(d); setH2hStatus('done'); })
      .catch(() => setH2hStatus('error'));
  }

  function openPlayersModal() {
    setActiveModal('players');
    if (playersStatus !== 'idle') return;
    setPlayersStatus('loading');
    fetch(`/api/players?home=${match.homeTeam.id}&away=${match.awayTeam.id}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<TeamPlayersData>; })
      .then((d) => { setPlayersData(d); setPlayersStatus('done'); })
      .catch(() => setPlayersStatus('error'));
  }

  function openFichaModal() {
    setActiveModal('ficha');
    if (fichaStatus !== 'idle') return;
    setFichaStatus('loading');
    const round = match.round.match(/(\d+)/)?.[1] ?? '';
    const params = new URLSearchParams({ home: match.homeTeam.id, away: match.awayTeam.id, round });
    fetch(`/api/cbf/match?${params}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<CbfMatchDetail>; })
      .then((d) => { setFichaData(d); setFichaStatus('done'); })
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

  return (
    <>
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/60">
          <span className="text-xs font-medium text-zinc-400 truncate font-sans">{match.competition}</span>
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
                {outsideSearchWindow ? 'disponível em breve' : 'não encontrado'}
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
              onClick={openH2HModal}
              aria-label="Ver confronto direto"
              className="flex flex-col items-center justify-center gap-1 rounded-xl border bg-zinc-800/60 border-zinc-700/50 px-1 min-h-[52px] text-[10px] font-medium font-sans text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-600 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
            >
              <HistoryIcon />
              Confronto
            </button>
            <button
              onClick={openPlayersModal}
              aria-label="Ver jogadores"
              className="flex flex-col items-center justify-center gap-1 rounded-xl border bg-zinc-800/60 border-zinc-700/50 px-1 min-h-[52px] text-[10px] font-medium font-sans text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-600 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
            >
              <PlayersIcon />
              Jogadores
            </button>
            <button
              onClick={openFichaModal}
              aria-label="Ver ficha do jogo"
              className="flex flex-col items-center justify-center gap-1 rounded-xl border bg-zinc-800/60 border-zinc-700/50 px-1 min-h-[52px] text-[10px] font-medium font-sans text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-600 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
            >
              <FichaIcon />
              Ficha
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(buildWhatsAppMessage(match, broadcasters))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center justify-center gap-1 rounded-xl bg-zinc-800/60 border border-zinc-700/50 px-1 min-h-[52px] text-[10px] font-medium font-sans text-zinc-400 hover:text-[#25D366] hover:bg-zinc-800 hover:border-[#25D366]/40 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
              aria-label="Compartilhar no WhatsApp"
            >
              <WhatsAppIcon />
              Enviar
            </a>
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
          subtitle={`${match.homeTeam.shortName} × ${match.awayTeam.shortName} · Brasileirão ${new Date().getFullYear()}`}
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

      {/* Ficha Modal */}
      {activeModal === 'ficha' && (
        <ModalShell
          title="Ficha do Jogo"
          subtitle={`${match.homeTeam.shortName} × ${match.awayTeam.shortName} · ${match.round}`}
          onClose={() => setActiveModal(null)}
        >
          {fichaStatus === 'loading' && (
            <div className="space-y-4 animate-pulse">
              <div className="h-16 bg-zinc-800 rounded-xl" />
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 bg-zinc-800 rounded-lg" />)}</div>
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 bg-zinc-800 rounded-lg" />)}</div>
            </div>
          )}
          {fichaStatus === 'error' && <p className="text-sm text-zinc-500 font-sans text-center py-4">Não foi possível carregar a ficha do jogo.</p>}
          {fichaStatus === 'done' && fichaData && <CbfMatchModalContent data={fichaData} match={match} />}
        </ModalShell>
      )}

    </>
  );
}
