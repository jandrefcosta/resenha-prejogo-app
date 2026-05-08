'use client';

import { useEffect, useState } from 'react';

interface ClubValidation {
  slug: string;
  name: string;
  shortName: string;
  apiFootballId: number | null;
  cbfId: number | null | undefined;
  conmebolId: number | null;
  issues: string[];
}

interface Result {
  total: number;
  okCount: number;
  issueCount: number;
  clubs: ClubValidation[];
}

export function ClubsTable() {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/clubs', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <p role="alert" className="text-sm text-red-400">{error}</p>;
  if (!data) {
    return (
      <div className="flex flex-col gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 rounded bg-zinc-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-zinc-400 font-sans">
        <span>{data.total} clubes</span>
        <span className="text-emerald-400">{data.okCount} ok</span>
        {data.issueCount > 0 ? (
          <span className="text-amber-400">{data.issueCount} com issues</span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <div className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px_24px] sticky top-0 bg-zinc-900/95 px-3 py-2 backdrop-blur-sm text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <span>Clube</span>
          <span className="text-right">API-F</span>
          <span className="text-right">CBF</span>
          <span className="text-right">CONM</span>
          <span></span>
        </div>
        <ul className="divide-y divide-zinc-800">
          {data.clubs.map((c) => (
            <li
              key={c.slug}
              className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px_24px] items-center px-3 py-2 text-sm"
              title={c.issues.join(' • ')}
            >
              <span className="truncate font-medium text-zinc-100">{c.name}</span>
              <span className="text-right font-mono text-xs text-zinc-300">
                {c.apiFootballId ?? '—'}
              </span>
              <span className="text-right font-mono text-xs text-zinc-300">
                {c.cbfId ?? '—'}
              </span>
              <span className="text-right font-mono text-xs text-zinc-300">
                {c.conmebolId ?? '—'}
              </span>
              <span className="text-center" aria-label={c.issues.length === 0 ? 'OK' : 'Issue'}>
                {c.issues.length === 0 ? (
                  <span className="text-emerald-400">●</span>
                ) : (
                  <span className="text-amber-400">●</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {data.clubs.some((c) => c.issues.length > 0) ? (
        <details className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-amber-400">
            Detalhes das issues
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {data.clubs
              .filter((c) => c.issues.length > 0)
              .map((c) => (
                <li key={c.slug} className="text-xs">
                  <span className="font-semibold text-zinc-100">{c.name}:</span>{' '}
                  <span className="text-zinc-400">{c.issues.join(' • ')}</span>
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
