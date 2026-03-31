'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';

function HeroSkeleton() {
  return (
    <div
      className="px-4 pt-14 pb-12 sm:px-6"
      style={{
        background: 'linear-gradient(160deg, #27272a 0%, #18181b 65%, #09090b 100%)',
      }}
    >
      <div className="max-w-2xl mx-auto space-y-3 animate-pulse">
        <div className="h-3 w-36 rounded-full bg-zinc-700" />
        <div className="h-9 w-52 rounded-lg bg-zinc-700" />
        <div className="h-4 w-72 rounded-full bg-zinc-800" />
        <div className="mt-2 h-11 w-36 rounded-full bg-zinc-800" />
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden animate-pulse">
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

export function InitialLoader() {
  const { ready } = useTheme();
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    setFading(true);
    const t = setTimeout(() => setVisible(false), 250);
    return () => clearTimeout(t);
  }, [ready]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-zinc-950 transition-opacity duration-250"
      style={{ opacity: fading ? 0 : 1 }}
      aria-hidden="true"
    >
      <HeroSkeleton />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-12 space-y-4">
        <div className="h-7 w-44 rounded-lg bg-zinc-800 animate-pulse" />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}
