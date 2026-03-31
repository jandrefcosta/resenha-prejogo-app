'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import clubsData from '@/data/clubs.json';
import type { ClubTheme } from '@/lib/types';
import { recordClub } from '@/lib/freeLimit';

const clubs = clubsData as ClubTheme[];

interface ThemeContextValue {
  club: ClubTheme | null;
  clubs: ClubTheme[];
  setClub: (club: ClubTheme) => void;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  club: null,
  clubs,
  setClub: () => {},
  ready: false,
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getLuminance(hex: string): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * toLinear(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * toLinear(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * toLinear(parseInt(hex.slice(5, 7), 16))
  );
}

function mixWithWhite(hex: string, ratio: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r + (255 - r) * ratio)},${Math.round(g + (255 - g) * ratio)},${Math.round(b + (255 - b) * ratio)})`;
}

function mixWithBlack(hex: string, ratio: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * (1 - ratio))},${Math.round(g * (1 - ratio))},${Math.round(b * (1 - ratio))})`;
}

function applyClubTheme(club: ClubTheme) {
  const root = document.documentElement;
  root.style.setProperty('--club-primary', club.colors.primary);
  root.style.setProperty('--club-secondary', club.colors.secondary);
  root.style.setProperty('--club-accent', club.colors.accent);
  root.style.setProperty(
    '--club-text-on-primary',
    club.textOnPrimary === 'white' ? '#ffffff' : '#1a1a1a',
  );

  // Safe primary for use as text/border on dark backgrounds.
  // Near-black primaries (lum < 0.05) become invisible on zinc-900 — brighten them.
  const primaryLum = getLuminance(club.colors.primary);
  const isNearBlack = primaryLum < 0.05;
  const onDark = isNearBlack ? mixWithWhite(club.colors.primary, 0.6) : club.colors.primary;
  root.style.setProperty('--club-on-dark', onDark);
  // Text to use ON a --club-on-dark background (brightened grays need dark text)
  root.style.setProperty('--club-on-dark-text', isNearBlack ? '#1a1a1a' : (club.textOnPrimary === 'white' ? '#ffffff' : '#1a1a1a'));

  // Safe secondary for hero gradient.
  // Light/white secondaries (lum > 0.35) create a white band — darken them.
  const secondaryLum = getLuminance(club.colors.secondary);
  root.style.setProperty(
    '--club-gradient-end',
    secondaryLum > 0.35 ? mixWithBlack(club.colors.secondary, 0.7) : club.colors.secondary,
  );
}

const STORAGE_KEY = 'resenha-prejogo:club';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [club, setClubState] = useState<ClubTheme | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const savedId =
      typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const saved = savedId ? clubs.find((c) => c.id === savedId) : null;
    const initial = saved ?? clubs[0];
    setClubState(initial);
    applyClubTheme(initial);
    // Record the initial club so it counts as one of the week's slots.
    recordClub(initial.id);
    setReady(true);
  }, []);

  function setClub(newClub: ClubTheme) {
    setClubState(newClub);
    applyClubTheme(newClub);
    localStorage.setItem(STORAGE_KEY, newClub.id);
  }

  return (
    <ThemeContext.Provider value={{ club, clubs, setClub, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}
