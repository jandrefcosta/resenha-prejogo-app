'use client';

import { useEffect, useRef } from 'react';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { FREE_CLUB_LIMIT, FREE_DETAIL_LIMIT } from '@/lib/freeLimit';

export type PaywallContext = 'club' | 'detail';

interface Props {
  context: PaywallContext;
  onClose: () => void;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-7 h-7"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4 shrink-0"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ─── Features list ────────────────────────────────────────────────────────────

const CLUB_FEATURES = [
  'Acesso ilimitado a todos os 20 times',
  'Troque de time quantas vezes quiser',
  'Confrontos detalhados em todas as rodadas',
  'Elenco e estatísticas completas',
  'Análise editorial IA sem restrições',
];

const DETAIL_FEATURES = [
  'Detalhes completos de todas as partidas',
  'Histórico ampliado de confrontos diretos',
  'Estatísticas completas dos jogadores',
  'Desfalques e lesionados em tempo real',
  'Análise editorial IA sem restrições',
];

// ─── Component ────────────────────────────────────────────────────────────────

export function PaywallModal({ context, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const isClub = context === 'club';
  const features = isClub ? CLUB_FEATURES : DETAIL_FEATURES;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Recursos Premium"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden"
      >
        {/* Amber glow at top */}
        <div
          className="absolute -top-8 left-1/2 -translate-x-1/2 w-56 h-28 rounded-full blur-3xl pointer-events-none"
          style={{ backgroundColor: 'rgba(251,191,36,0.22)' }}
          aria-hidden="true"
        />

        <div className="relative p-6 text-center">
          {/* Lock icon */}
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{
              backgroundColor: 'rgba(251,191,36,0.12)',
              border: '1px solid rgba(251,191,36,0.30)',
              color: '#fbbf24',
            }}
          >
            <LockIcon />
          </div>

          {/* Headline */}
          <h2 className="text-base font-bold text-white font-display mb-1.5">
            {isClub
              ? `Limite de ${FREE_CLUB_LIMIT} times por semana`
              : `Limite de ${FREE_DETAIL_LIMIT} partidas por time`}
          </h2>
          <p className="text-sm text-zinc-400 font-sans mb-6 leading-relaxed">
            {isClub
              ? 'No plano gratuito você pode acompanhar até 3 times diferentes por semana. Assine para acesso ilimitado.'
              : 'No plano gratuito você pode abrir os detalhes de 2 partidas por time por semana. Assine para ver tudo.'}
          </p>

          {/* Feature list */}
          <div
            className="text-left rounded-xl p-4 mb-6 space-y-2.5"
            style={{
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 font-sans mb-3">
              Com o Premium
            </p>
            {features.map((feat) => (
              <div key={feat} className="flex items-center gap-3">
                <span style={{ color: '#4ade80' }}>
                  <CheckIcon />
                </span>
                <span className="text-sm text-zinc-300 font-sans">{feat}</span>
              </div>
            ))}
          </div>

          {/* Primary CTA */}
          <button
            className="w-full rounded-xl min-h-[48px] text-sm font-bold font-sans mb-3 transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer"
            style={{ backgroundColor: '#fbbf24', color: '#1a1a1a' }}
            onClick={onClose}
            aria-label="Ver planos premium"
          >
            Quero o Premium
          </button>

          {/* Dismiss */}
          <button
            onClick={onClose}
            className="w-full text-sm text-zinc-500 hover:text-zinc-300 font-sans transition-colors py-2 cursor-pointer"
          >
            Continuar no gratuito
          </button>

          <p className="text-xs text-zinc-700 font-sans mt-4">
            Limites renovam toda segunda-feira
          </p>
        </div>
      </div>
    </div>
  );
}
