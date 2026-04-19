'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { PostCard } from './PostCard';
import type { Post } from '@/lib/socialRedis';

interface Profile {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  clubId: string | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
  viewerFollows: boolean;
}

interface Props {
  username: string;
  currentUserId?: string;
  onClose: () => void;
}

export function ProfilePanel({ username, currentUserId, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, onClose);

  // Load profile
  useEffect(() => {
    setLoadingProfile(true);
    fetch(`/api/social/users/${username}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          setProfile(data.profile);
          setFollowing(data.profile.viewerFollows);
        }
      })
      .finally(() => setLoadingProfile(false));
  }, [username]);

  // Load posts
  const loadPosts = useCallback(async (cursor?: number) => {
    const url = `/api/social/users/${username}/posts?limit=20${cursor ? `&cursor=${cursor}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (cursor) {
      setPosts((prev) => [...prev, ...(data.posts ?? [])]);
    } else {
      setPosts(data.posts ?? []);
    }
    setNextCursor(data.nextCursor ?? null);
  }, [username]);

  useEffect(() => {
    setLoadingPosts(true);
    loadPosts().finally(() => setLoadingPosts(false));
  }, [loadPosts]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !nextCursor) return;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loadingMore || !nextCursor) return;
      setLoadingMore(true);
      await loadPosts(nextCursor);
      setLoadingMore(false);
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, loadPosts]);

  const toggleFollow = useCallback(async () => {
    if (!currentUserId || !profile || followPending) return;
    setFollowPending(true);
    const next = !following;
    setFollowing(next);
    setProfile((p) => p ? {
      ...p,
      followerCount: p.followerCount + (next ? 1 : -1),
    } : p);

    try {
      const method = next ? 'POST' : 'DELETE';
      await fetch(`/api/social/follow/${profile.id}`, { method });
    } catch {
      setFollowing(following);
      setProfile((p) => p ? {
        ...p,
        followerCount: p.followerCount + (next ? -1 : 1),
      } : p);
    } finally {
      setFollowPending(false);
    }
  }, [currentUserId, profile, following, followPending]);

  const isSelf = currentUserId && profile?.id === currentUserId;

  return (
    <div
      ref={panelRef}
      className="absolute inset-0 z-20 bg-zinc-900 flex flex-col overflow-hidden"
      role="dialog"
      aria-label={`Perfil de ${username}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <button
          onClick={onClose}
          className="h-8 w-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Voltar"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-white font-sans truncate">
          {loadingProfile ? '…' : profile?.displayName ?? username}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none">
        {loadingProfile ? (
          <ProfileSkeleton />
        ) : profile ? (
          <>
            {/* Profile card */}
            <div className="px-5 py-5 border-b border-zinc-800">
              {/* Avatar + follow button */}
              <div className="flex items-start justify-between mb-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-club-primary text-white text-xl font-bold font-sans uppercase select-none"
                  aria-hidden="true"
                >
                  {profile.displayName[0]}
                </div>
                {!isSelf && currentUserId && (
                  <button
                    onClick={toggleFollow}
                    disabled={followPending}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold font-sans transition-all cursor-pointer disabled:opacity-50 ${
                      following
                        ? 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
                        : 'bg-white text-zinc-950 hover:bg-zinc-100'
                    }`}
                  >
                    {following ? 'Seguindo' : 'Seguir'}
                  </button>
                )}
              </div>

              {/* Name + username */}
              <p className="text-sm font-semibold text-white font-sans">{profile.displayName}</p>
              <p className="text-xs text-zinc-500 font-sans mb-2">@{profile.username}</p>

              {profile.bio && (
                <p className="text-xs text-zinc-400 font-sans leading-relaxed mb-3">{profile.bio}</p>
              )}

              {/* Stats */}
              <div className="flex gap-4">
                <Stat value={profile.postCount} label="Posts" />
                <Stat value={profile.followerCount} label="Seguidores" />
                <Stat value={profile.followingCount} label="Seguindo" />
              </div>
            </div>

            {/* Posts */}
            {loadingPosts ? (
              <PostsSkeleton />
            ) : posts.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-xs text-zinc-600 font-sans">Nenhum post ainda.</p>
              </div>
            ) : (
              <>
                {posts.map((post) => (
                  <div key={post.id} className="px-4 py-3 border-b border-zinc-800/60 last:border-b-0">
                    <PostCard post={post} currentUserId={currentUserId} />
                  </div>
                ))}
                <div ref={sentinelRef} className="h-4" />
                {loadingMore && (
                  <div className="flex justify-center py-4">
                    <span className="text-xs text-zinc-600 font-sans animate-pulse">Carregando…</span>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="py-12 text-center">
            <p className="text-xs text-zinc-500 font-sans">Usuário não encontrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-sm font-bold text-white font-sans tabular-nums">{value}</span>
      <span className="text-[11px] text-zinc-500 font-sans">{label}</span>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="px-5 py-5 animate-pulse space-y-3">
      <div className="flex items-start justify-between">
        <div className="h-14 w-14 rounded-full bg-zinc-800" />
        <div className="h-7 w-20 rounded-full bg-zinc-800" />
      </div>
      <div className="h-3 bg-zinc-800 rounded w-1/3" />
      <div className="h-2.5 bg-zinc-800 rounded w-1/4" />
      <div className="h-2 bg-zinc-800 rounded w-3/4" />
    </div>
  );
}

function PostsSkeleton() {
  return (
    <div className="space-y-px animate-pulse">
      {[1, 2].map((i) => (
        <div key={i} className="px-4 py-3 border-b border-zinc-800/60">
          <div className="space-y-2">
            <div className="h-2.5 bg-zinc-800 rounded w-full" />
            <div className="h-2 bg-zinc-800 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
