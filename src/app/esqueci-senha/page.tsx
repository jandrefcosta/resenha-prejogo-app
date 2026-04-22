'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });

    if (res.status === 429) {
      setErrorMsg('Muitas tentativas. Tente novamente em 1 hora.');
      setStatus('error');
      return;
    }

    if (res.status === 400) {
      setErrorMsg('Email inválido.');
      setStatus('error');
      return;
    }

    // 200 ou 500 — mostrar mensagem genérica (não revelar detalhes internos)
    setStatus('sent');
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-zinc-100 text-center mb-6">
          Esqueci minha senha
        </h1>

        {status === 'sent' ? (
          <div className="space-y-4 text-center">
            <p className="text-zinc-300 text-sm">
              Se esse email estiver cadastrado, você receberá um link em breve.
            </p>
            <Link
              href="/login"
              className="inline-block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="seuemail@exemplo.com"
                required
                className="w-full border border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {status === 'loading' ? 'Aguarde…' : 'Enviar link'}
            </button>

            <div className="text-center">
              <Link
                href="/login"
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Voltar para o login
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
