'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isCupTakeover } from '@/lib/cupTakeover';

const TABS = [
  { href: '/copa-2026', label: 'Copa', icon: '⚽' },
  { href: '/bolao', label: 'Bolão', icon: '🏆' },
  { href: '/meu-clube', label: 'Meu Clube', icon: '🛡️' },
] as const;

const HIDDEN_PREFIXES = ['/admin', '/login', '/esqueci-senha', '/reset-senha'];

/**
 * True when the cup tab bar is currently shown. Shared so other fixed
 * bottom elements (e.g. the social FAB) can move out of its way.
 */
export function useCupTabBarVisible(): boolean {
  const pathname = usePathname();
  // false on SSR / first client render — same SSR-safe pattern as before
  const [inWindow, setInWindow] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInWindow(isCupTakeover());
  }, []);

  return inWindow && !HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Fixed bottom navigation shown only during the Copa 2026 takeover window.
 * Visibility is decided after mount (renders null on the server and on the
 * first client render) to keep the time-based check out of statically
 * rendered layout output — same SSR-safe pattern as BrazilCountdown.
 */
export function CupTabBar() {
  const visible = useCupTabBarVisible();
  const pathname = usePathname();

  if (!visible) return null;

  const isCurrent = (href: string): boolean =>
    href === '/bolao' ? pathname.startsWith('/bolao') : pathname === href;

  return (
    <>
      {/* In-flow spacer so fixed bar doesn't cover page footers */}
      <div style={{ height: 'calc(4rem + env(safe-area-inset-bottom))' }} aria-hidden="true" />
      <nav
        aria-label="Navegação da Copa"
        className="fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-zinc-950/90 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isCurrent(tab.href) ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-1 min-h-[56px] transition-colors ${
                isCurrent(tab.href)
                  ? 'text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {tab.icon}
              </span>
              <span className="text-[11px] font-medium font-sans">{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
