'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useScrollLock } from '@/lib/useScrollLock';
import { useAuth } from '@/hooks/useAuth';

type Tab = 'login' | 'register';

interface Props {
  onClose: () => void;
}

export function AuthModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('login');
  const panelRef = useRef<HTMLDivElement>(null);
  const { login, register } = useAuth();

  useFocusTrap(panelRef, onClose);
  useScrollLock();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={tab === 'login' ? 'Entrar na conta' : 'Criar conta'}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
            <TabButton active={tab === 'login'} onClick={() => setTab('login')}>Entrar</TabButton>
            <TabButton active={tab === 'register'} onClick={() => setTab('register')}>Criar conta</TabButton>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer text-lg leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {tab === 'login'
            ? <LoginForm onClose={onClose} />
            : <RegisterForm onClose={onClose} onSwitchToLogin={() => setTab('login')} />
          }
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium font-sans transition-colors cursor-pointer ${
        active ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

function LoginForm({ onClose }: { onClose: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    const err = await login(email.trim(), password);
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      onClose();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="seuemail@exemplo.com"
      />
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-zinc-400 font-sans">Senha</label>
          <Link
            href="/esqueci-senha"
            onClick={onClose}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors font-sans"
          >
            Esqueci minha senha
          </Link>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
          className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-sm text-white placeholder-zinc-500 font-sans focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-zinc-600 transition-colors"
        />
      </div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <SubmitButton loading={loading}>
        {loading ? 'Entrando…' : 'Entrar'}
      </SubmitButton>
    </form>
  );
}

function RegisterForm({
  onClose,
  onSwitchToLogin,
}: {
  onClose: () => void;
  onSwitchToLogin: () => void;
}) {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const usernameValid = /^[a-z0-9_]{3,20}$/.test(username);
  const passwordValid = password.length >= 8;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    const err = await register(username.trim().toLowerCase(), email.trim(), password);
    if (err) {
      setError(err);
      setLoading(false);
    } else {
      onClose();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-zinc-400 font-sans mb-1">
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          autoComplete="username"
          placeholder="seu_usuario"
          maxLength={20}
          className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-sm text-white placeholder-zinc-500 font-sans focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-zinc-600 transition-colors"
        />
        {username.length > 0 && !usernameValid && (
          <p className="mt-1 text-xs text-zinc-500 font-sans">
            3-20 caracteres: letras minúsculas, números e _
          </p>
        )}
      </div>
      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="seuemail@exemplo.com"
      />
      <div>
        <Field
          label="Senha"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
        />
        {password.length > 0 && !passwordValid && (
          <p className="mt-1 text-xs text-zinc-500 font-sans">Mínimo 8 caracteres</p>
        )}
      </div>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <SubmitButton loading={loading} disabled={!usernameValid || !passwordValid}>
        {loading ? 'Criando conta…' : 'Criar conta'}
      </SubmitButton>
    </form>
  );
}

function Field({
  label, type, value, onChange, autoComplete, placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 font-sans mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-2.5 text-sm text-white placeholder-zinc-500 font-sans focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-zinc-600 transition-colors"
      />
    </div>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-xs text-red-400 font-sans">{children}</p>
  );
}

function SubmitButton({
  loading,
  disabled,
  children,
}: {
  loading: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full rounded-full min-h-[44px] px-5 text-sm font-semibold font-sans bg-white text-zinc-950 transition-colors hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white mt-1"
    >
      {children}
    </button>
  );
}
