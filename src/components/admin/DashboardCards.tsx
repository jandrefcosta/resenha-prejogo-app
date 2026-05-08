'use client';

import { useEffect, useState } from 'react';

interface DashboardData {
  pg: Record<string, number>;
  redis: Record<string, number>;
  timestamp: string;
}

const PG_LABELS: Record<string, string> = {
  users: 'Usuários',
  boloes: 'Bolões',
  bolaoMembers: 'Membros de bolão',
  palpites: 'Palpites',
  scores: 'Scores',
  posts: 'Posts',
  follows: 'Follows',
  matchSnapshots: 'Match snapshots',
};

const REDIS_LABELS: Record<string, string> = {
  suggestions: 'Sugestões pendentes',
  globalRanking: 'Ranking global (membros)',
};

export function DashboardCards() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/dashboard', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return <p role="alert" className="text-sm text-red-400">Erro ao carregar: {error}</p>;
  }

  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Postgres</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(data.pg).map(([key, value]) => (
            <MetricCard key={key} label={PG_LABELS[key] ?? key} value={value} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Redis</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(data.redis).map(([key, value]) => (
            <MetricCard key={key} label={REDIS_LABELS[key] ?? key} value={value} />
          ))}
        </div>
      </section>

      <p className="text-xs text-zinc-500 font-sans">
        Atualizado em {new Date(data.timestamp).toLocaleString('pt-BR')}
      </p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-400 font-sans">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-zinc-100">
        {value.toLocaleString('pt-BR')}
      </p>
    </div>
  );
}
