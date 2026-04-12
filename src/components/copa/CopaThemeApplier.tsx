'use client';

import { useEffect } from 'react';
import type { ClubTheme } from '@/lib/types';

/**
 * Applies the Copa do Mundo theme (verde/amarelo) to CSS custom properties
 * on mount, and restores user's saved club theme on unmount.
 *
 * This is a thin client wrapper — the Copa page is a Server Component,
 * so theme application must happen client-side via useEffect.
 * Does NOT touch ThemeProvider state or localStorage.
 */
export function CopaThemeApplier({ theme }: { theme: ClubTheme }) {
  useEffect(() => {
    const root = document.documentElement;

    // Snapshot existing values so we can restore them when navigating away
    const prev = {
      primary:        root.style.getPropertyValue('--club-primary'),
      secondary:      root.style.getPropertyValue('--club-secondary'),
      accent:         root.style.getPropertyValue('--club-accent'),
      textOnPrimary:  root.style.getPropertyValue('--club-text-on-primary'),
      onDark:         root.style.getPropertyValue('--club-on-dark'),
      onDarkText:     root.style.getPropertyValue('--club-on-dark-text'),
      gradientEnd:    root.style.getPropertyValue('--club-gradient-end'),
    };

    // Apply Copa theme
    root.style.setProperty('--club-primary',       theme.colors.primary);
    root.style.setProperty('--club-secondary',     theme.colors.secondary);
    root.style.setProperty('--club-accent',        theme.colors.accent);
    root.style.setProperty('--club-text-on-primary', '#ffffff');
    root.style.setProperty('--club-on-dark',       theme.colors.primary);
    root.style.setProperty('--club-on-dark-text',  '#ffffff');
    // FFDF00 (yellow) is very light — darken it for the gradient to avoid a white wash
    root.style.setProperty('--club-gradient-end',  '#a08800');

    return () => {
      // Restore previous theme when unmounting (e.g. navigating to / Série A)
      root.style.setProperty('--club-primary',        prev.primary);
      root.style.setProperty('--club-secondary',      prev.secondary);
      root.style.setProperty('--club-accent',         prev.accent);
      root.style.setProperty('--club-text-on-primary',prev.textOnPrimary);
      root.style.setProperty('--club-on-dark',        prev.onDark);
      root.style.setProperty('--club-on-dark-text',   prev.onDarkText);
      root.style.setProperty('--club-gradient-end',   prev.gradientEnd);
    };
  }, [theme]);

  return null;
}
