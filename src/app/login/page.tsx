'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

function LoginPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get('returnTo') ?? '/';
  const { login, register } = useAuth();

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    let err: string | null;
    if (tab === 'login') {
      err = await login(email.trim(), password);
    } else {
      err = await register(username.trim().toLowerCase(), email.trim(), password);
    }
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      router.replace(returnTo);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-zinc-100 text-center mb-6">
          {tab === 'login' ? 'Entrar' : 'Criar conta'}
        </h1>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5 mb-6">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(''); }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'login' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'register' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                autoComplete="username"
                placeholder="seu_usuario"
                required
                className="w-full border border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-zinc-500 mt-1">3–20 caracteres: letras minúsculas, números, _</p>
            </div>
          )}
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
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-zinc-300">Senha</label>
              {tab === 'login' && (
                <Link
                  href="/esqueci-senha"
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Esqueci minha senha
                </Link>
              )}
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              required
              minLength={tab === 'register' ? 8 : undefined}
              className="w-full border border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? 'Aguarde…' : tab === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
