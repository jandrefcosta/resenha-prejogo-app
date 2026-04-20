'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeftIcon } from '@heroicons/react/20/solid';
import Link from 'next/link';

export default function NovoBolaoPage() {
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!nome.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/bolao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Erro ao criar bolão');
        return;
      }
      const { bolao } = await res.json();
      router.push(`/bolao/${bolao.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-lg mx-auto w-full px-4 py-6 flex-1">
      <Link
        href="/bolao"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 mb-4 transition-colors"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Ranking
      </Link>
      <h1 className="text-xl font-bold text-zinc-100 mb-6">Criar Bolão Privado</h1>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Nome do bolão
          </label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Bolão do Trabalho"
            maxLength={50}
            className="w-full border border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={loading || !nome.trim()}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {loading ? 'Criando…' : 'Criar Bolão'}
        </button>
      </div>
      <p className="text-xs text-zinc-500 mt-4 text-center">
        Um código de convite será gerado automaticamente.
      </p>
    </main>
  );
}
