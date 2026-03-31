'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useFocusTrap } from '@/lib/useFocusTrap';
import type { ClubTheme } from '@/lib/types';

const ONBOARDING_KEY = 'resenha-prejogo:onboarded';
const CLUB_KEY = 'resenha-prejogo:club';

function dismiss() {
  localStorage.setItem(ONBOARDING_KEY, '1');
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CalendarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-none" aria-hidden="true">
      <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
    </svg>
  );
}

function TvIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-none" aria-hidden="true">
      <path d="M4.75 3a.75.75 0 0 0 0 1.5h.586l-1.293 1.293a.75.75 0 0 0 1.06 1.06L6.5 5.56V6.25a.75.75 0 0 0 1.5 0v-.69l1.397 1.397a.75.75 0 0 0 1.06-1.06L9.164 4.5h.836a.75.75 0 0 0 0-1.5H4.75Z" />
      <path fillRule="evenodd" d="M1 8.75A2.75 2.75 0 0 1 3.75 6h12.5A2.75 2.75 0 0 1 19 8.75v5.5A2.75 2.75 0 0 1 16.25 17H3.75A2.75 2.75 0 0 1 1 14.25v-5.5Zm2.75-1.25c-.69 0-1.25.56-1.25 1.25v5.5c0 .69.56 1.25 1.25 1.25h12.5c.69 0 1.25-.56 1.25-1.25v-5.5c0-.69-.56-1.25-1.25-1.25H3.75Z" clipRule="evenodd" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-none" aria-hidden="true">
      <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.184a1 1 0 0 0 0-1.897l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551Z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
    </svg>
  );
}

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
    icon: <CalendarIcon />,
    title: 'Próximos jogos',
    description: 'Veja os próximos jogos do seu time com data, horário e estádio.',
  },
  {
    icon: <TvIcon />,
    title: 'Onde assistir',
    description: 'Saiba em qual canal passa cada partida — buscado com IA em tempo real.',
  },
  {
    icon: <SparklesIcon />,
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

      {/* Feature list */}
      <ul className="space-y-2.5 flex-1" role="list">
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
          <ChevronRightIcon />
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
          <ArrowLeftIcon />
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
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

      {/* Panel — fixed height so both steps occupy the same space */}
      <div
        ref={panelRef}
        className="relative w-full max-w-md h-[480px] rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden"
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
