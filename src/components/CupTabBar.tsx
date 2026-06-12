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
 * Fixed bottom navigation shown only during the Copa 2026 takeover window.
 * Visibility is decided after mount (renders null on the server and on the
 * first client render) to keep the time-based check out of statically
 * rendered layout output — same SSR-safe pattern as BrazilCountdown.
 */
export function CupTabBar() {
  const pathname = usePathname();
  // null = SSR / not yet hydrated → renders nothing to avoid hydration mismatch
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(isCupTakeover());
  }, []);

  if (!active || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  const isCurrent = (href: string): boolean =>
    href === '/bolao' ? pathname.startsWith('/bolao') : pathname === href;

  return (
    <>
      {/* In-flow spacer so fixed bar doesn't cover page footers */}
      <div className="h-16" aria-hidden="true" />
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
                  : 'text-zinc-500 hover:text-zinc-300'
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
