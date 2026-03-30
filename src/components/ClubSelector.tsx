'use client';

import { useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useFocusTrap } from '@/lib/useFocusTrap';
import type { ClubTheme } from '@/lib/types';

export function ClubSelector() {
  const { club: activeClub, clubs, setClub } = useTheme();
  const [open, setOpen] = useState(false);

  function handleSelect(c: ClubTheme) {
    setClub(c);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 cursor-pointer backdrop-blur-sm"
      >
        {activeClub ? (
          <>
            <span
              className="inline-block h-2.5 w-2.5 rounded-full flex-none border border-white/20"
              style={{ backgroundColor: activeClub.colors.primary }}
              aria-hidden="true"
            />
            <span>{activeClub.name}</span>
            <span className="text-white/30">·</span>
            <span className="text-white/50">Alterar</span>
          </>
        ) : (
          <span>Escolher clube</span>
        )}
      </button>

      {open && (
        <ClubModal
          clubs={clubs}
          activeClub={activeClub}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ClubModal({
  clubs,
  activeClub,
  onSelect,
  onClose,
}: {
  clubs: ClubTheme[];
  activeClub: ClubTheme | null;
  onSelect: (c: ClubTheme) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Escolher clube"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div ref={panelRef} className="relative w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <p className="text-sm font-semibold text-white font-sans">Escolha seu clube</p>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer text-lg leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="p-3 grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
          {clubs.map((c) => {
            const isActive = activeClub?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                aria-pressed={isActive}
                className={[
                  'flex items-center gap-2.5 rounded-xl px-3 min-h-[44px] text-sm font-medium font-sans text-left w-full',
                  'transition-all duration-150 cursor-pointer border focus-visible:outline-2 focus-visible:outline-offset-2',
                  isActive
                    ? 'border-transparent shadow-md'
                    : 'border-zinc-800 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700/50 hover:text-white hover:border-zinc-600',
                ].join(' ')}
                style={
                  isActive
                    ? {
                        backgroundColor: c.colors.primary,
                        color: c.textOnPrimary === 'white' ? '#ffffff' : '#1a1a1a',
                        outlineColor: c.colors.primary,
                      }
                    : { outlineColor: '#71717a' }
                }
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full flex-none border border-white/20 shrink-0"
                  style={{ backgroundColor: c.colors.primary }}
                  aria-hidden="true"
                />
                <span className="truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

