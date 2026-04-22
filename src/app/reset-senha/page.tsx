'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetSenhaInner() {
  const params = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-red-400 text-sm">Link inválido. Verifique o email ou solicite um novo link.</p>
        <Link
          href="/esqueci-senha"
          className="inline-block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Solicitar novo link
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'loading') return;

    if (password !== confirm) {
      setErrorMsg('As senhas não coincidem.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Senha deve ter pelo menos 8 caracteres.');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });

    if (res.ok) {
      setStatus('done');
      return;
    }

    const data = await res.json().catch(() => ({}));
    setErrorMsg(data.error ?? 'Erro ao redefinir senha. Tente novamente.');
    setStatus('error');
  }

  if (status === 'done') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-zinc-100 font-semibold">Senha alterada com sucesso!</p>
        <Link
          href="/login"
          className="inline-block bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
        >
          Entrar
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Nova senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
          required
          minLength={8}
          className="w-full border border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Confirmar nova senha</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
          required
          minLength={8}
          className="w-full border border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
      >
        {status === 'loading' ? 'Aguarde…' : 'Redefinir senha'}
      </button>

      <div className="text-center">
        <Link
          href="/esqueci-senha"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Solicitar novo link
        </Link>
      </div>
    </form>
  );
}

export default function ResetSenhaPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-zinc-100 text-center mb-6">
          Redefinir senha
        </h1>
        <Suspense>
          <ResetSenhaInner />
        </Suspense>
      </div>
    </main>
  );
}
