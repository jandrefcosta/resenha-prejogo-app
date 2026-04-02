'use client';

import { useRef, useState } from 'react';
import { useFocusTrap } from '@/lib/useFocusTrap';

export function FloatingSuggestion() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-4 z-40 flex items-center gap-2 rounded-full bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-xs font-semibold text-zinc-300 shadow-lg hover:bg-zinc-700 hover:text-white transition-all cursor-pointer"
      >
        <span>🐛</span>
        <span>Achou algum erro?</span>
      </button>
      {open && <SuggestionModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function FooterSuggestion() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer underline underline-offset-2"
      >
        Sugestões
      </button>
      {open && <SuggestionModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function SuggestionModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) throw new Error();
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div
      className="fixed inset-x-0 top-0 h-dvh z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Enviar sugestão"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div ref={panelRef} className="relative w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <p className="text-sm font-semibold text-white font-sans">Enviar sugestão</p>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer text-lg leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {status === 'success' ? (
          <div className="px-5 py-8 text-center">
            <p className="text-2xl mb-2">🙌</p>
            <p className="text-sm font-semibold text-white font-sans">Sugestão enviada!</p>
            <p className="mt-1 text-xs text-zinc-400 font-sans">Obrigado pelo feedback.</p>
            <button
              onClick={onClose}
              className="mt-5 rounded-full bg-zinc-800 px-5 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <p className="text-xs text-zinc-400 font-sans leading-relaxed">
              Tem uma ideia, achou um erro ou quer pedir um clube? Manda aqui.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Sua sugestão..."
              rows={4}
              maxLength={500}
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 font-sans resize-none focus:outline-none focus:border-zinc-500 transition-colors"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-600 font-sans">{text.length}/500</span>
              <button
                type="submit"
                disabled={!text.trim() || status === 'loading'}
                className="rounded-full bg-[var(--club-on-dark)] px-5 py-2 text-sm font-semibold text-[var(--club-on-dark-text)] transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                {status === 'loading' ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
            {status === 'error' && (
              <p className="text-xs text-red-400 font-sans">Erro ao enviar. Tente novamente.</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
