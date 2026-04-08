'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarIcon, TvIcon, SparklesIcon, ChevronRightIcon, ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useTheme } from '@/components/ThemeProvider';
import { useFocusTrap } from '@/lib/useFocusTrap';
import type { ClubTheme } from '@/lib/types';

const ONBOARDING_KEY = 'resenha-prejogo:onboarded';
const CLUB_KEY = 'resenha-prejogo:club';

function dismiss() {
  localStorage.setItem(ONBOARDING_KEY, '1');
}

// ─── Icons ────────────────────────────────────────────────────────────────────

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ active }: { active: 1 | 2 }) {
  return (
    <div
      className="flex items-center justify-center gap-1.5"
      aria-label={`Passo ${active} de 2`}
    >
      <span className={`h-1.5 rounded-full transition-all duration-200 ${active === 1 ? 'w-4 bg-zinc-400' : 'w-1.5 bg-zinc-700'}`} />
      <span className={`h-1.5 rounded-full transition-all duration-200 ${active === 2 ? 'w-4 bg-zinc-400' : 'w-1.5 bg-zinc-700'}`} />
    </div>
  );
}

// ─── Feature list ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: <CalendarIcon className="w-5 h-5 flex-none" aria-hidden="true" />,
    title: 'Próximos jogos',
    description: 'Veja os próximos jogos do seu time com data, horário e estádio.',
  },
  {
    icon: <TvIcon className="w-5 h-5 flex-none" aria-hidden="true" />,
    title: 'Onde assistir',
    description: 'Saiba em qual canal passa cada partida — buscado com IA em tempo real.',
  },
  {
    icon: <SparklesIcon className="w-5 h-5 flex-none" aria-hidden="true" />,
    title: 'Análise pré-jogo',
    description: 'Análise gerada por IA antes de cada jogo, disponível direto no card da partida.',
  },
] as const;

// ─── Step 1: Welcome ───────────────────────────────────────────────────────────

function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-1 font-sans">
          Bem-vindo
        </p>
        <h2 className="text-2xl font-black font-display tracking-wide text-white leading-tight">
          Resenha Pré-Jogo
        </h2>
        <p className="mt-1.5 text-sm text-zinc-400 font-sans leading-relaxed">
          Tudo que você precisa saber antes de cada partida, num só lugar.
        </p>
      </div>

      {/* Feature list — min-h-0 allows flex to shrink it on short screens */}
      <ul className="space-y-2.5 flex-1 min-h-0 overflow-y-auto" role="list">
        {FEATURES.map((f) => (
          <li key={f.title} className="flex items-start gap-3 rounded-xl bg-zinc-800/60 px-4 py-3">
            <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-zinc-700 text-zinc-200">
              {f.icon}
            </span>
            <div>
              <p className="text-sm font-semibold text-white font-sans">{f.title}</p>
              <p className="text-xs text-zinc-400 font-sans leading-relaxed mt-0.5">{f.description}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Actions */}
      <div className="mt-5 flex flex-col gap-2">
        <button
          onClick={onNext}
          className="flex items-center justify-center gap-2 w-full rounded-full min-h-[44px] px-5 text-sm font-semibold font-sans bg-white text-zinc-950 transition-colors duration-200 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white cursor-pointer"
        >
          Escolher meu clube
          <ChevronRightIcon className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          onClick={onSkip}
          className="w-full rounded-full min-h-[44px] px-5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors duration-200 font-sans cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-600"
        >
          Pular
        </button>
      </div>

      <div className="mt-4">
        <StepDots active={1} />
      </div>
    </div>
  );
}

// ─── Step 2: Club selection ────────────────────────────────────────────────────

function ClubStep({
  clubs,
  onSelect,
  onBack,
}: {
  clubs: ClubTheme[];
  onSelect: (c: ClubTheme) => void;
  onBack: () => void;
}) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800 flex-none">
        <button
          onClick={onBack}
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-600"
          aria-label="Voltar"
        >
          <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
        </button>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white font-sans">Escolha seu clube</p>
          <p className="text-xs text-zinc-500 font-sans">Personalize o app com as cores do seu time</p>
        </div>
      </div>

      {/* Club grid — fills remaining height */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-3 grid grid-cols-2 gap-2 content-start">
        {clubs.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="flex items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-800/50 px-3 min-h-[44px] text-sm font-medium font-sans text-zinc-300 text-left w-full transition-all duration-150 cursor-pointer hover:bg-zinc-700/50 hover:text-white hover:border-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
          >
            {c.apiFootballId ? (
              <img
                src={`https://media.api-sports.io/football/teams/${c.apiFootballId}.png`}
                alt=""
                width={20}
                height={20}
                className="object-contain shrink-0"
                aria-hidden="true"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full flex-none border border-white/20 shrink-0"
                style={{ backgroundColor: c.colors.primary }}
                aria-hidden="true"
              />
            )}
            <span className="truncate">{c.name}</span>
          </button>
        ))}
      </div>

      {/* Footer with step indicator */}
      <div className="flex-none px-5 py-4 border-t border-zinc-800">
        <StepDots active={2} />
      </div>
    </div>
  );
}

// ─── Root modal ────────────────────────────────────────────────────────────────

export function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<'welcome' | 'clubs'>('welcome');
  const { clubs, setClub } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);

  function handleClose() {
    dismiss();
    setVisible(false);
    document.body.style.overflow = '';
  }

  useFocusTrap(panelRef, handleClose);

  useEffect(() => {
    const alreadyOnboarded = localStorage.getItem(ONBOARDING_KEY);
    const hasSavedClub = localStorage.getItem(CLUB_KEY);
    if (!alreadyOnboarded && !hasSavedClub) {
      setVisible(true);
      document.body.style.overflow = 'hidden';
    }
  }, []);

  function handleSelectClub(c: ClubTheme) {
    setClub(c);
    dismiss();
    setVisible(false);
    document.body.style.overflow = '';
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 h-dvh z-50 flex items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-top))]"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      role="dialog"
      aria-modal="true"
      aria-label="Bem-vindo ao Resenha Pré-Jogo"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Panel — height capped at viewport so buttons never get cut off on short screens */}
      <div
        ref={panelRef}
        className="relative w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden"
        style={{ height: 'min(640px, calc(100dvh - 2rem))' }}
      >
        {step === 'welcome' ? (
          <WelcomeStep onNext={() => setStep('clubs')} onSkip={handleClose} />
        ) : (
          <ClubStep clubs={clubs} onSelect={handleSelectClub} onBack={() => setStep('welcome')} />
        )}
      </div>
    </div>
  );
}
