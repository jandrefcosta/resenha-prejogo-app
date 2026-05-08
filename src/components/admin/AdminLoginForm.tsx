'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AdminLoginForm() {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Falha na autenticação');
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="secret" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Senha admin
        </label>
        <input
          id="secret"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-white/20"
          required
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading || secret.length === 0}
        className="rounded-full bg-white px-4 min-h-[44px] text-sm font-semibold font-sans text-zinc-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
