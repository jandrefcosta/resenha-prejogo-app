'use client';

import { useState } from 'react';
import type { ReprocessResult } from '@/app/api/admin/force-reprocess-docs/route';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: ReprocessResult }
  | { status: 'error'; message: string };

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function DocsReprocessCard() {
  const [state, setState] = useState<State>({ status: 'idle' });

  async function handleReprocess() {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/admin/force-reprocess-docs', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ status: 'error', message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      const result: ReprocessResult = await res.json();
      setState({ status: 'done', result });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Erro desconhecido' });
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-bold">Re-processar PDFs da Season</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Re-baixa todos os PDFs do CBF, substitui no Postgres e re-parseia a season inteira.
          Operação pode levar alguns minutos.
        </p>
      </div>

      <button
        type="button"
        onClick={handleReprocess}
        disabled={state.status === 'loading'}
        className="self-start rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {state.status === 'loading' ? 'Processando…' : 'Re-processar tudo'}
      </button>

      {state.status === 'done' && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 text-sm font-mono flex flex-col gap-1">
          <span className="text-emerald-400">✓ Processados: {state.result.processed}</span>
          <span className="text-red-400">✗ Erros: {state.result.errors}</span>
          <span className="text-zinc-400">— Indisponíveis: {state.result.unavailable}</span>
          <span className="mt-1 text-zinc-500">
            Rodadas: {state.result.rounds} · Duração: {formatDuration(state.result.durationMs)}
          </span>
        </div>
      )}

      {state.status === 'error' && (
        <p className="text-sm text-red-400">Erro: {state.message}</p>
      )}
    </div>
  );
}
