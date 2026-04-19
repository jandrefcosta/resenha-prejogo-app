'use client';

import { useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useScrollLock } from '@/lib/useScrollLock';
import { BROADCASTER_COLORS } from '@/lib/broadcasterColors';
import type { BroadcasterInfo } from '@/lib/types';

interface Props {
  broadcasters: BroadcasterInfo[];
  isOpen: boolean;
  onClose: () => void;
}

export function BroadcasterModal({ broadcasters, isOpen, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);
  useScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 h-dvh z-50 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Onde assistir"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full sm:max-w-sm max-h-[80dvh] rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white font-sans">Onde assistir</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
            aria-label="Fechar"
          >
            <XMarkIcon className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Broadcaster list */}
        <ul className="overflow-y-auto flex-1 divide-y divide-zinc-800">
          {broadcasters.map((b) => {
            const bg = BROADCASTER_COLORS[b.name] ?? '#666666';
            const initial = b.name.charAt(0).toUpperCase();
            return (
              <li key={b.name} className="flex items-center gap-3 px-4 py-3">
                {/* Icon */}
                <span
                  className="w-8 h-8 rounded flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: bg }}
                  aria-hidden="true"
                >
                  {initial}
                </span>

                {/* Name */}
                <span className="flex-1 text-sm text-white font-sans">{b.name}</span>

                {/* Link */}
                {b.url && (
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs font-semibold text-white bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
                  >
                    Assistir →
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
