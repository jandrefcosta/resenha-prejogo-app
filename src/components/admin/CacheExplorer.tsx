'use client';

import { useEffect, useState } from 'react';
import { ConfirmModal } from './ConfirmModal';

interface GroupSummary {
  label: string;
  total: number;
  patterns: string[];
  destructive: boolean;
}

interface ScanResult {
  cursor: number;
  keys: string[];
  done: boolean;
}

export function CacheExplorer() {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const [pattern, setPattern] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [confirmFor, setConfirmFor] = useState<{ pattern: string; destructive: boolean } | null>(null);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  async function loadSummary() {
    try {
      const r = await fetch('/api/admin/cache?summary=1', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setGroups(data.groups);
      setGroupsError(null);
    } catch (e) {
      setGroupsError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/cache?summary=1', { cache: 'no-store' });
        if (cancelled) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        setGroups(data.groups);
      } catch (e) {
        if (!cancelled) setGroupsError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runScan(p: string, cursor = 0, append = false) {
    setScanLoading(true);
    setScanError(null);
    try {
      const url = `/api/admin/cache?pattern=${encodeURIComponent(p)}&cursor=${cursor}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as ScanResult;
      setScanResult((prev) =>
        append && prev ? { ...data, keys: [...prev.keys, ...data.keys] } : data,
      );
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanLoading(false);
    }
  }

  async function performDelete(p: string, destructive: boolean) {
    setDeleteResult(null);
    try {
      const r = await fetch(`/api/admin/cache?pattern=${encodeURIComponent(p)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: destructive }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setDeleteResult(`${data.deleted} chaves removidas${data.truncated ? ' (truncado)' : ''}`);
      await loadSummary();
      if (pattern && scanResult) await runScan(pattern, 0, false);
    } catch (e) {
      setDeleteResult(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Grupos de cache
        </h2>
        {groupsError ? (
          <p role="alert" className="text-sm text-red-400">{groupsError}</p>
        ) : !groups ? (
          <div className="grid grid-cols-1 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <div key={g.label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-100">{g.label}</p>
                  <span className="font-display text-lg font-bold text-zinc-100">
                    {g.total.toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.patterns.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPattern(p);
                        setScanResult(null);
                        runScan(p);
                      }}
                      className="rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-mono text-zinc-300 hover:bg-zinc-700"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Inspecionar padrão
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="ex: fixtures:*"
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 font-mono text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
          <button
            type="button"
            disabled={!pattern || scanLoading}
            onClick={() => {
              setScanResult(null);
              runScan(pattern);
            }}
            className="rounded-full bg-white px-4 min-h-[44px] text-sm font-semibold text-zinc-950 disabled:opacity-40"
          >
            {scanLoading ? '…' : 'Buscar'}
          </button>
        </div>

        {scanError ? <p role="alert" className="mt-2 text-sm text-red-400">{scanError}</p> : null}

        {scanResult ? (
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
              <span className="text-xs text-zinc-400">
                {scanResult.keys.length} chave{scanResult.keys.length === 1 ? '' : 's'} listada{scanResult.keys.length === 1 ? '' : 's'}
                {scanResult.done ? '' : ' (mais disponíveis)'}
              </span>
              <button
                type="button"
                onClick={() => {
                  const isDestructive = isDestructive_(pattern);
                  setConfirmFor({ pattern, destructive: isDestructive });
                }}
                className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500"
              >
                Invalidar padrão
              </button>
            </div>
            <ul className="max-h-96 divide-y divide-zinc-800 overflow-y-auto">
              {scanResult.keys.map((k) => (
                <li key={k} className="px-3 py-1.5 font-mono text-xs text-zinc-300">{k}</li>
              ))}
              {scanResult.keys.length === 0 ? (
                <li className="px-3 py-3 text-xs text-zinc-500">Nenhuma chave encontrada.</li>
              ) : null}
            </ul>
            {!scanResult.done ? (
              <div className="border-t border-zinc-800 px-3 py-2">
                <button
                  type="button"
                  disabled={scanLoading}
                  onClick={() => runScan(pattern, scanResult.cursor, true)}
                  className="text-xs font-semibold text-zinc-300 hover:text-white disabled:opacity-40"
                >
                  Carregar mais
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {deleteResult ? (
          <p className="mt-2 text-sm text-zinc-400" role="status">{deleteResult}</p>
        ) : null}
      </section>

      <ConfirmModal
        open={!!confirmFor}
        title="Invalidar cache"
        message={
          confirmFor
            ? `Remover todas as chaves Redis que correspondem a "${confirmFor.pattern}"?${
                confirmFor.destructive ? ' Esta operação afeta dados persistidos no Redis.' : ''
              }`
            : ''
        }
        confirmLabel="Invalidar"
        destructive={!!confirmFor?.destructive}
        onCancel={() => setConfirmFor(null)}
        onConfirm={async () => {
          if (!confirmFor) return;
          const target = confirmFor;
          setConfirmFor(null);
          await performDelete(target.pattern, target.destructive);
        }}
      />
    </div>
  );
}

const DESTRUCTIVE_PREFIXES = [
  'user:', 'bolao:', 'palpite:', 'score:', 'post:', 'feed:',
  'session:', 'email:', 'username:', 'club:posts:', 'user:posts:',
  'user:liked:', 'following:', 'followers:', 'reset:',
];

function isDestructive_(pattern: string): boolean {
  if (pattern === '*' || pattern.trim() === '') return true;
  return DESTRUCTIVE_PREFIXES.some((p) => pattern.startsWith(p));
}
