'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/cache', label: 'Cache' },
  { href: '/admin/clubs', label: 'Clubes' },
  { href: '/admin/sugestoes', label: 'Sugestões' },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-10 -mx-4 mb-6 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-1 overflow-x-auto">
        {LINKS.map((l) => {
          const active = l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium font-sans whitespace-nowrap transition-colors ${
                active
                  ? 'bg-white text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={logout}
          className="ml-auto rounded-full px-3 py-1.5 text-sm font-medium font-sans text-zinc-400 hover:text-red-400 transition-colors"
        >
          Sair
        </button>
      </div>
    </nav>
  );
}
