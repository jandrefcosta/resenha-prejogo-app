'use client';

import { useState, useRef } from 'react';
import type { Post } from '@/lib/socialRedis';

const MAX = 280;

interface Props {
  authorDisplayName: string;
  clubId: string;
  onPost: (post: Post) => void;
}

export function PostComposer({ authorDisplayName, clubId, onPost }: Props) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const remaining = MAX - content.length;
  const canSubmit = content.trim().length > 0 && remaining >= 0 && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/social/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), clubId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Erro ao publicar');
        return;
      }
      setContent('');
      onPost(data.post as Post);
      textareaRef.current?.focus();
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 pt-3 pb-3 border-b border-zinc-800">
      {/* Textarea row */}
      <div className="flex gap-2.5 mb-2">
        <div
          className="flex h-8 w-8 flex-shrink-0 mt-0.5 items-center justify-center rounded-full bg-club-primary text-white text-xs font-bold font-sans uppercase select-none"
          aria-hidden="true"
        >
          {authorDisplayName[0]}
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (error) setError('');
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          placeholder="O que você acha?"
          rows={2}
          maxLength={MAX + 10}
          className="flex-1 resize-none bg-transparent text-sm text-white placeholder-zinc-500 font-sans focus:outline-none leading-relaxed min-h-[52px]"
          aria-label="Escrever post"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-400 font-sans mb-2 pl-10">{error}</p>
      )}

      {/* Action row — always visible */}
      <div className="flex items-center justify-between pl-10">
        <span className={`text-xs font-sans tabular-nums ${
          remaining < 20 ? (remaining < 0 ? 'text-red-400' : 'text-amber-400') : 'text-zinc-600'
        }`}>
          {remaining < 60 ? remaining : ''}
        </span>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full px-5 py-2 text-sm font-semibold font-sans text-zinc-950 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 active:scale-95"
          style={{ backgroundColor: 'var(--club-primary)' }}
        >
          {loading ? 'Publicando…' : 'Postar'}
        </button>
      </div>
    </form>
  );
}
