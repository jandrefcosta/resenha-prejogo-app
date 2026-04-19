'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { PostCard } from './PostCard';
import type { Post } from '@/lib/socialRedis';

interface Props {
  /** 'club' fetches by clubId; 'personal' fetches the logged-in user's follow feed */
  feedType: 'club' | 'personal';
  clubId?: string;
  currentUserId?: string;
  onProfileClick?: (username: string) => void;
}

export function SocialFeed({ feedType, clubId, currentUserId, onProfileClick }: Props) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const buildUrl = useCallback((cursor?: number) => {
    const params = new URLSearchParams();
    if (feedType === 'personal') {
      params.set('feed', 'personal');
    } else {
      params.set('clubId', clubId ?? '');
    }
    if (cursor) params.set('cursor', String(cursor));
    params.set('limit', '20');
    return `/api/social/posts?${params.toString()}`;
  }, [feedType, clubId]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(buildUrl());
      if (!res.ok) throw new Error('Erro ao carregar feed');
      const data = await res.json();
      setPosts(data.posts ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      setError('Não foi possível carregar o feed.');
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !nextCursor) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || loadingMore || !nextCursor) return;
        setLoadingMore(true);
        try {
          const res = await fetch(buildUrl(nextCursor));
          if (!res.ok) return;
          const data = await res.json();
          setPosts((prev) => [...prev, ...(data.posts ?? [])]);
          setNextCursor(data.nextCursor ?? null);
        } finally {
          setLoadingMore(false);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, buildUrl]);

  if (loading) return <FeedSkeleton />;
  if (error) return (
    <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
      <p className="text-xs text-zinc-500 font-sans">{error}</p>
      <button
        onClick={loadInitial}
        className="text-xs text-zinc-400 underline underline-offset-2 cursor-pointer"
      >
        Tentar novamente
      </button>
    </div>
  );
  if (posts.length === 0) return <EmptyState feedType={feedType} />;

  return (
    <div className="flex flex-col">
      {posts.map((post) => (
        <div key={post.id} className="px-4 py-3 border-b border-zinc-800/60 last:border-b-0">
          <PostCard
            post={post}
            currentUserId={currentUserId}
            onProfileClick={onProfileClick}
          />
        </div>
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />

      {loadingMore && (
        <div className="flex justify-center py-4">
          <span className="text-xs text-zinc-600 font-sans animate-pulse">Carregando…</span>
        </div>
      )}
    </div>
  );

  // expose prependPost so parent can call it after PostComposer submits
  // (done via a different pattern — see SocialDrawer usage)
}


/* ─── Empty states ────────────────────────────────────────────────────────── */

function EmptyState({ feedType }: { feedType: 'club' | 'personal' }) {
  if (feedType === 'personal') {
    return (
      <div className="flex flex-col items-center gap-2 py-12 px-6 text-center">
        <p className="text-sm font-medium text-zinc-300 font-sans">Seu feed está vazio</p>
        <p className="text-xs text-zinc-500 font-sans leading-relaxed max-w-[200px]">
          Siga outros torcedores para ver os posts deles aqui.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 py-12 px-6 text-center">
      <p className="text-sm font-medium text-zinc-300 font-sans">Nenhum post ainda</p>
      <p className="text-xs text-zinc-500 font-sans">Seja o primeiro a postar!</p>
    </div>
  );
}

/* ─── Skeleton ────────────────────────────────────────────────────────────── */

function FeedSkeleton() {
  return (
    <div className="space-y-px">
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-4 py-3 border-b border-zinc-800/60 animate-pulse">
          <div className="flex gap-2.5">
            <div className="h-8 w-8 rounded-full bg-zinc-800 flex-shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-2.5 bg-zinc-800 rounded w-1/4" />
              <div className="h-2 bg-zinc-800 rounded w-full" />
              <div className="h-2 bg-zinc-800 rounded w-3/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
