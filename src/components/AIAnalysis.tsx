'use client';

import { useState } from 'react';
import type { Match } from '@/lib/types';

const COLLAPSED_LINES = 4;

export function AIAnalysis({ match }: { match: Match }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);

  async function fetchAnalysis() {
    setStatus('loading');
    setText('');
    try {
      const res = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match }),
      });
      if (!res.ok || !res.body) throw new Error('Falha na requisição');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      setStatus('done');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setText((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch {
      setStatus('error');
    }
  }

  if (status === 'idle') {
    return (
      <button
        onClick={fetchAnalysis}
        className="mt-4 w-full rounded-lg border border-[var(--club-on-dark)] py-2.5 text-sm font-semibold text-[var(--club-on-dark)] transition-colors hover:bg-[var(--club-on-dark)] hover:text-[var(--club-on-dark-text)] active:scale-95 cursor-pointer"
      >
        Análise IA — Pré-jogo
      </button>
    );
  }

  if (status === 'loading' && !text) {
    return (
      <div className="mt-4 rounded-lg bg-zinc-800/50 p-4 text-sm text-zinc-400 animate-pulse">
        Analisando o confronto...
      </div>
    );
  }

  if (status === 'error') {
    return (
      <p className="mt-4 text-xs text-red-400">
        Não foi possível carregar a análise. Verifique sua chave de API.
      </p>
    );
  }

  const lines = text.split('\n');
  const isLong = lines.length > COLLAPSED_LINES;
  const visibleText = isLong && !expanded
    ? lines.slice(0, COLLAPSED_LINES).join('\n')
    : text;

  return (
    <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--club-on-dark)]">
        Análise IA — Pré-jogo
      </p>
      <div className="relative">
        <p className="text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">
          {visibleText}
          {status === 'loading' && (
            <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-zinc-400 animate-pulse rounded-sm align-middle" />
          )}
        </p>
        {isLong && !expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-zinc-800/90 to-transparent pointer-events-none" />
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-semibold text-[var(--club-on-dark)] hover:opacity-80 transition-opacity cursor-pointer"
        >
          {expanded ? 'Ver menos ↑' : 'Ver mais ↓'}
        </button>
      )}
    </div>
  );
}

