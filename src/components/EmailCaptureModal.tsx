'use client';

import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '@/lib/useFocusTrap';

const EMAIL_REGISTERED_KEY = 'resenha-prejogo:email-registered';
const EMAIL_BANNER_DISMISSED_KEY = 'resenha-prejogo:email-banner-dismissed';
const BANNER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const JOURNEY_DELAY_MS = 45_000; // 45 seconds

// ─── Icons ────────────────────────────────────────────────────────────────────

function EnvelopeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 4a2 2 0 0 0-2 2v1.161l8.441 4.221a1.25 1.25 0 0 0 1.118 0L19 7.162V6a2 2 0 0 0-2-2H3Z" />
      <path d="m19 8.839-7.77 3.885a2.75 2.75 0 0 1-2.46 0L1 8.839V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.839Z" />
    </svg>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function EmailCaptureModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, onClose);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data?.error ?? 'Erro ao cadastrar. Tente novamente.');
        setStatus('error');
        return;
      }
      localStorage.setItem(EMAIL_REGISTERED_KEY, '1');
      setStatus('success');
    } catch {
      setErrorMsg('Erro de conexão. Tente novamente.');
      setStatus('error');
    }
  }

  return (
    <div
      className="fixed inset-x-0 top-0 h-dvh z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cadastrar e-mail para novidades"
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
        className="relative w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
              <EnvelopeIcon />
            </span>
            <p className="text-sm font-semibold text-white font-sans">Fique por dentro</p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer text-lg leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {status === 'success' ? (
          <div className="px-5 py-10 text-center">
            <p className="text-3xl mb-3">⚽</p>
            <p className="text-sm font-semibold text-white font-sans">Cadastro feito!</p>
            <p className="mt-1.5 text-xs text-zinc-400 font-sans leading-relaxed max-w-xs mx-auto">
              Você será notificado das novidades do Resenha Pré-Jogo.
            </p>
            <button
              onClick={onClose}
              className="mt-6 rounded-full bg-zinc-800 px-6 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <p className="text-sm text-zinc-400 font-sans leading-relaxed">
              Cadastre seu e-mail e receba novidades, melhorias e análises exclusivas do Resenha Pré-Jogo.
            </p>
            <div>
              <label htmlFor="email-input" className="sr-only">
                Seu e-mail
              </label>
              <input
                id="email-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') setStatus('idle');
                }}
                placeholder="seuemail@exemplo.com"
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-sm text-white placeholder-zinc-500 font-sans focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-zinc-600 transition-colors"
                aria-describedby={status === 'error' ? 'email-error' : undefined}
              />
              {status === 'error' && (
                <p id="email-error" role="alert" className="mt-1.5 text-xs text-red-400 font-sans">
                  {errorMsg}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full rounded-full min-h-[44px] px-5 text-sm font-semibold font-sans bg-white text-zinc-950 transition-colors hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {status === 'loading' ? 'Cadastrando…' : 'Cadastrar'}
            </button>
            <p className="text-center text-xs text-zinc-600 font-sans">
              Sem spam. Cancele quando quiser.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Trigger button (for placement in header/nav) ─────────────────────────────

export function EmailSubscribeButton() {
  const [open, setOpen] = useState(false);
  const [registered, setRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    setRegistered(localStorage.getItem(EMAIL_REGISTERED_KEY) === '1');
  }, []);

  // Avoid flash before localStorage is read
  if (registered === null || registered) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 cursor-pointer backdrop-blur-sm"
        aria-label="Cadastrar e-mail para novidades"
      >
        <EnvelopeIcon />
        <span>Novidades</span>
      </button>
      {open && (
        <EmailCaptureModal
          onClose={() => {
            setOpen(false);
            // Re-check registered state after modal closes
            setRegistered(localStorage.getItem(EMAIL_REGISTERED_KEY) === '1');
          }}
        />
      )}
    </>
  );
}

// ─── Journey banner (contextual time-delayed nudge) ───────────────────────────

export function EmailJourneyBanner() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(EMAIL_REGISTERED_KEY) === '1') return;

    const lastDismissed = localStorage.getItem(EMAIL_BANNER_DISMISSED_KEY);
    if (lastDismissed && Date.now() - Number(lastDismissed) < BANNER_COOLDOWN_MS) return;

    const timer = setTimeout(() => setVisible(true), JOURNEY_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  function handleDismiss() {
    setVisible(false);
    localStorage.setItem(EMAIL_BANNER_DISMISSED_KEY, String(Date.now()));
  }

  function handleOpenModal() {
    setOpen(true);
  }

  function handleModalClose() {
    setOpen(false);
    const isNowRegistered = localStorage.getItem(EMAIL_REGISTERED_KEY) === '1';
    if (isNowRegistered) {
      setRegistered(true);
      setVisible(false);
    }
  }

  if (!visible || registered) return null;

  return (
    <>
      <div
        className="fixed bottom-20 sm:bottom-6 left-4 sm:left-6 z-40 max-w-xs w-[calc(100%-2rem)] sm:w-auto animate-in slide-in-from-bottom-4 duration-300"
        role="complementary"
        aria-label="Sugestão de cadastro"
      >
        <div className="flex items-start gap-3 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl px-4 py-3.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 mt-0.5">
            <EnvelopeIcon />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white font-sans leading-snug">
              Gostou do Resenha Pré-Jogo?
            </p>
            <p className="text-xs text-zinc-400 font-sans leading-relaxed mt-0.5">
              Cadastre seu e-mail e fique por dentro das novidades.
            </p>
            <button
              onClick={handleOpenModal}
              className="mt-2 text-xs font-semibold text-white underline underline-offset-2 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              Quero me cadastrar
            </button>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-none h-6 w-6 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer text-base leading-none"
            aria-label="Fechar sugestão"
          >
            ×
          </button>
        </div>
      </div>
      {open && <EmailCaptureModal onClose={handleModalClose} />}
    </>
  );
}
