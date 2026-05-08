'use client';

import { useCallback, useEffect, useState } from 'react';

interface SuggestionItem {
  index: number;
  text: string;
  createdAt: string;
}

interface Result {
  items: SuggestionItem[];
  total: number;
  offset: number;
  limit: number;
}

const PAGE_SIZE = 50;

export function SuggestionsList() {
  const [data, setData] = useState<Result | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (newOffset: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/suggestions?offset=${newOffset}&limit=${PAGE_SIZE}`, {
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setOffset(newOffset);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/suggestions?offset=0&limit=${PAGE_SIZE}`, {
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as Result;
        if (cancelled) return;
        setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(index: number) {
    try {
      const r = await fetch(`/api/admin/suggestions?index=${index}`, { method: 'DELETE' });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${r.status}`);
      }
      await load(offset);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (error) return <p role="alert" className="text-sm text-red-400">{error}</p>;
  if (!data) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-800 animate-pulse" />
        ))}
      </div>
    );
  }

  const hasNext = offset + PAGE_SIZE < data.total;
  const hasPrev = offset > 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-400 font-sans">
        {data.total} sugesto{data.total === 1 ? 'ão' : 'ões'} no total · página {Math.floor(offset / PAGE_SIZE) + 1}
      </p>

      {data.items.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">
          Nada por aqui.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((item) => (
            <li key={item.index} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
              <p className="whitespace-pre-wrap text-sm text-zinc-100">{item.text}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
                <span>{new Date(item.createdAt).toLocaleString('pt-BR')}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(item.index)}
                  className="rounded-full px-2.5 py-1 text-zinc-400 hover:bg-red-950 hover:text-red-400"
                >
                  Apagar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={!hasPrev || loading}
          onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          ← Anterior
        </button>
        <button
          type="button"
          disabled={!hasNext || loading}
          onClick={() => load(offset + PAGE_SIZE)}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          Próxima →
        </button>
      </div>
    </div>
  );
}
