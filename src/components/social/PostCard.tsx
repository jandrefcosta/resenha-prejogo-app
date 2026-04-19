'use client';

import { useState, useCallback } from 'react';
import { HeartIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import type { Post } from '@/lib/socialRedis';

interface Props {
  post: Post;
  currentUserId?: string;
  initialLiked?: boolean;
  onProfileClick?: (username: string) => void;
}

export function PostCard({ post, currentUserId, initialLiked = false, onProfileClick }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [pending, setPending] = useState(false);

  const toggleLike = useCallback(async () => {
    if (!currentUserId || pending) return;
    setPending(true);

    // Optimistic update
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));

    try {
      const method = next ? 'POST' : 'DELETE';
      const res = await fetch(`/api/social/posts/${post.id}/like`, { method });
      if (!res.ok) {
        // Revert on failure
        setLiked(liked);
        setLikeCount((c) => c + (next ? -1 : 1));
      } else {
        const data = await res.json();
        setLikeCount(data.likeCount);
        if (next && data.alreadyLiked) setLiked(true);
      }
    } catch {
      setLiked(liked);
      setLikeCount((c) => c + (next ? -1 : 1));
    } finally {
      setPending(false);
    }
  }, [currentUserId, liked, pending, post.id]);

  return (
    <article className="bg-zinc-800/60 rounded-xl border border-zinc-700/60 p-4 space-y-3">
      {/* Author row */}
      <button
        onClick={() => onProfileClick?.(post.authorUsername)}
        disabled={!onProfileClick}
        className="flex items-center gap-2.5 text-left w-full cursor-pointer disabled:cursor-default group"
        aria-label={`Ver perfil de ${post.authorUsername}`}
      >
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-club-primary text-white text-xs font-bold font-sans uppercase select-none"
          aria-hidden="true"
        >
          {post.authorDisplayName?.[0] ?? post.authorUsername[0]}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white font-sans leading-tight truncate group-hover:underline underline-offset-2">
            {post.authorDisplayName}
          </p>
          <p className="text-[11px] text-zinc-500 font-sans truncate">
            @{post.authorUsername} · {relativeTime(post.createdAt)}
          </p>
        </div>
      </button>

      {/* Content */}
      <p className="text-sm text-zinc-100 font-sans leading-relaxed whitespace-pre-wrap break-words">
        {post.content}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-1 pt-0.5">
        <button
          onClick={toggleLike}
          disabled={!currentUserId || pending}
          aria-label={liked ? 'Descurtir' : 'Curtir'}
          aria-pressed={liked}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium font-sans transition-colors cursor-pointer disabled:cursor-default ${
            liked
              ? 'text-red-400 bg-red-400/10 hover:bg-red-400/20'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50'
          }`}
        >
          {liked
            ? <HeartSolid className="h-3.5 w-3.5" />
            : <HeartIcon className="h-3.5 w-3.5" />
          }
          <span>{likeCount > 0 ? likeCount : ''}</span>
        </button>
      </div>
    </article>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
