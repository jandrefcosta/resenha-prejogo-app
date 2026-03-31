'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/components/ThemeProvider';
import { useFocusTrap } from '@/lib/useFocusTrap';
import type { ClubTheme } from '@/lib/types';
import {
  canSelectClub,
  recordClub,
  readClubs,
  FREE_CLUB_LIMIT,
} from '@/lib/freeLimit';
import { PaywallModal } from '@/components/PaywallModal';

export function ClubSelector() {
  const { club: activeClub, clubs, setClub } = useTheme();
  const [open, setOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [visitedIds, setVisitedIds] = useState<string[]>([]);

  // Sync visitedIds on mount so we can drive the locked UI immediately.
  useEffect(() => {
    setVisitedIds(readClubs().ids);
  }, []);

  function openModal() {
    setVisitedIds(readClubs().ids); // refresh on every open
    setOpen(true);
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    setOpen(false);
    document.body.style.overflow = '';
  }

  function handleSelect(c: ClubTheme) {
    // Re-selecting the active club always succeeds (no slot cost).
    if (c.id === activeClub?.id) {
      closeModal();
      return;
    }
    if (!canSelectClub(c.id)) {
      setPaywallOpen(true);
      return;
    }
    recordClub(c.id);
    setVisitedIds(readClubs().ids);
    setClub(c);
    closeModal();
  }

  return (
    <>
      <button
        onClick={() => openModal()}
        className="flex items-center gap-2.5 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 cursor-pointer backdrop-blur-sm"
      >
        {activeClub ? (
          <>
            {activeClub.apiFootballId ? (
              <img
                src={`https://media.api-sports.io/football/teams/${activeClub.apiFootballId}.png`}
                alt=""
                width={20}
                height={20}
                className="object-contain shrink-0"
                aria-hidden="true"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full flex-none border border-white/20"
                style={{ backgroundColor: activeClub.colors.primary }}
                aria-hidden="true"
              />
            )}
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
          visitedIds={visitedIds}
          onSelect={handleSelect}
          onClose={closeModal}
        />
      )}

      {paywallOpen && (
        <PaywallModal context="club" onClose={() => setPaywallOpen(false)} />
      )}
    </>
  );
}

function SmallLockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5 shrink-0"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v4A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-4A1.5 1.5 0 0 0 11 7V4.5A3.5 3.5 0 0 0 8 1Zm2.5 6V4.5a2.5 2.5 0 0 0-5 0V7h5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ClubModal({
  clubs,
  activeClub,
  visitedIds,
  onSelect,
  onClose,
}: {
  clubs: ClubTheme[];
  activeClub: ClubTheme | null;
  visitedIds: string[];
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
          <div>
            <p className="text-sm font-semibold text-white font-sans">Escolha seu clube</p>
            {/* Free tier counter */}
            <p className="text-xs font-sans mt-0.5"
              style={{ color: visitedIds.length >= FREE_CLUB_LIMIT ? '#f97316' : '#71717a' }}>
              Plano gratuito&nbsp;·&nbsp;
              <span style={{ color: visitedIds.length >= FREE_CLUB_LIMIT ? '#f97316' : '#a1a1aa' }}>
                {visitedIds.length}/{FREE_CLUB_LIMIT} times esta semana
              </span>
            </p>
          </div>
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
            // A club is locked when the limit is reached and it hasn't been visited yet.
            // The currently active club is never locked (always accessible).
            const isLocked =
              !isActive &&
              !visitedIds.includes(c.id) &&
              visitedIds.length >= FREE_CLUB_LIMIT;
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
                    : isLocked
                    ? 'border-zinc-800 bg-zinc-800/30 text-zinc-600'
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
                {c.apiFootballId ? (
                  <img
                    src={`https://media.api-sports.io/football/teams/${c.apiFootballId}.png`}
                    alt=""
                    width={20}
                    height={20}
                    className={['object-contain shrink-0', isLocked ? 'opacity-40' : ''].join(' ')}
                    aria-hidden="true"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full flex-none border border-white/20 shrink-0"
                    style={{ backgroundColor: c.colors.primary, opacity: isLocked ? 0.4 : 1 }}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate flex-1">{c.name}</span>
                {isLocked && (
                  <span style={{ color: '#d97706' }} className="ml-auto shrink-0">
                    <SmallLockIcon />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

