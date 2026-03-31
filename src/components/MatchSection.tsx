'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { MatchCard } from '@/components/MatchCard';
import type { Match, MatchPreview } from '@/lib/types';

function MatchCardSkeleton() {
  return (
    <div
      className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden animate-pulse"
      aria-hidden="true"
    >
      <div className="h-9 bg-zinc-800/60" />
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-zinc-700 rounded w-3/4 ml-auto" />
            <div className="h-3 bg-zinc-800 rounded w-1/4 ml-auto" />
          </div>
          <div className="w-6 h-4 bg-zinc-700 rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-zinc-700 rounded w-3/4" />
            <div className="h-3 bg-zinc-800 rounded w-1/4" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 bg-zinc-800 rounded-lg" />
          <div className="h-16 bg-zinc-800 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function MatchSection() {
  const { club } = useTheme();

  const [allFixtures, setAllFixtures] = useState<Record<string, Match[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);

  const [previews, setPreviews] = useState<Record<string, MatchPreview> | null>(null);
  const [previewsLoading, setPreviewsLoading] = useState(false);

  // Load all fixtures once
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch('/api/fixtures')
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json() as Promise<Record<string, Match[]>>;
      })
      .then((data) => {
        setAllFixtures(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  // Fetch previews (form + broadcasters) for current club's matches in one batch request
  const matches: Match[] = club && allFixtures ? (allFixtures[club.id] ?? []) : [];
  const idsKey = matches.map((m) => m.id).join(',');

  useEffect(() => {
    if (!idsKey) return;

    setPreviewsLoading(true);
    setPreviews(null);

    fetch(`/api/previews?ids=${idsKey}`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, MatchPreview>>) : null))
      .then((data) => { if (data) setPreviews(data); })
      .catch(() => {})
      .finally(() => setPreviewsLoading(false));
  }, [idsKey]);

  if (!club) return null;

  return (
    <section aria-label={`Próximos jogos — ${club.name}`}>
      <div className="mb-6 flex items-baseline gap-2">
        <h2 className="text-2xl font-bold text-white font-display uppercase tracking-wide">
          Próximos Jogos
        </h2>
        <span className="text-sm text-zinc-400 font-sans">{club.name}</span>
      </div>

      {loading && (
        <div className="space-y-4" role="status" aria-label="Carregando jogos">
          <MatchCardSkeleton />
          <MatchCardSkeleton />
          <MatchCardSkeleton />
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400 font-sans">
          Não foi possível carregar os jogos. Tente novamente.
        </p>
      )}

      {!loading && !error && matches.length === 0 && (
        <p className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400 font-sans">
          Nenhum jogo encontrado para {club.name}.
        </p>
      )}

      {!loading && !error && matches.length > 0 && (
        <div className="space-y-4">
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              highlightClubId={club.id}
              preview={previews?.[match.id]}
              previewLoading={previewsLoading}
            />
          ))}
        </div>
      )}
    </section>
  );
}
