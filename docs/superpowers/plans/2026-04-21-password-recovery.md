# Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar fluxo completo de recuperação de senha via email — token opaco no Redis, envio via Resend, páginas `/esqueci-senha` e `/reset-senha`, link no login.

**Architecture:** Token de 256 bits gerado com `crypto.randomBytes`, armazenado em `reset:{token}` no Redis com TTL 1h. `POST /api/auth/forgot-password` gera e envia o token; `POST /api/auth/reset-password` valida, atualiza o `passwordHash` e invalida o token. Rate limit via `@upstash/ratelimit` (mesmo padrão do `suggestionsLimiter` existente).

**Tech Stack:** Next.js 15 App Router, Upstash Redis, `@upstash/ratelimit`, `resend` (npm), bcryptjs, TypeScript.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `src/lib/email.ts` | Criar | Wrapper Resend — `sendPasswordResetEmail(email, token)` |
| `src/lib/rateLimiter.ts` | Modificar | Adicionar `passwordResetLimiter` (3/hora por email) |
| `src/app/api/auth/forgot-password/route.ts` | Criar | POST — valida email, rate limit, gera token, envia email |
| `src/app/api/auth/reset-password/route.ts` | Criar | POST — valida token Redis, atualiza passwordHash, DEL token |
| `src/app/esqueci-senha/page.tsx` | Criar | Formulário de email — Client Component |
| `src/app/reset-senha/page.tsx` | Criar | Formulário de nova senha — Client Component + Suspense |
| `src/app/login/page.tsx` | Modificar | Adicionar link "Esqueci minha senha" na tab Entrar |

---

## Contexto de codebase para o implementador

### Padrões existentes a seguir

**Redis:** importar de `@/lib/redisCache`:
```typescript
import { redis } from '@/lib/redisCache';
```

**Rate limiting:** o projeto usa `@upstash/ratelimit` com `Ratelimit.slidingWindow`. Ver `src/lib/rateLimiter.ts`:
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redisCache';
export const suggestionsLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  prefix: 'rl:suggestions',
});
```

**Lookup de usuário por email:** usar `getUserByEmail(email)` de `@/lib/userIdentity`:
```typescript
import { getUserByEmail, getUserById, hashEmail } from '@/lib/userIdentity';
// getUserByEmail retorna: { userId: string; record: UserRecord } | null
// getUserById retorna: UserRecord | null
```

**Hash de senha:** usar `hashPassword` de `@/lib/passwordUtils`:
```typescript
import { hashPassword } from '@/lib/passwordUtils';
// hashPassword(plain: string): Promise<string>
```

**TTL Redis:**
```typescript
const TTL_1H = 3600;
const TTL_1Y = 60 * 60 * 24 * 365;
```

**Cookie / env:** `process.env.NODE_ENV === 'production'` para `secure` em cookies. Env var nova: `RESEND_API_KEY`.

**Padrão de route handler:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  // ...
}
```

**User record no Redis:**
```typescript
// user:{userId} → UserRecord (TTL 1 ano)
// UserRecord tem campo: passwordHash?: string
await redis.set(`user:${userId}`, { ...record, passwordHash: newHash }, { ex: TTL_1Y });
```

---

## Task 1: Instalar Resend + adicionar `passwordResetLimiter`

**Files:**
- Modify: `src/lib/rateLimiter.ts`

- [ ] **Step 1: Instalar o pacote resend**

```bash
cd c:\Projetos\Pessoal\sports-compile
npm install resend
```

Expected: `resend` aparece em `package.json` dependencies.

- [ ] **Step 2: Adicionar `passwordResetLimiter` em `src/lib/rateLimiter.ts`**

Adicionar ao final do arquivo existente (não apagar o `suggestionsLimiter`):

```typescript
/**
 * Password reset: 3 attempts per email hash per hour (sliding window).
 */
export const passwordResetLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  prefix: 'rl:password-reset',
});
```

O arquivo completo ficará:

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redisCache';

/**
 * Suggestions: 3 submissions per IP per hour (sliding window).
 */
export const suggestionsLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  prefix: 'rl:suggestions',
});

/** Extracts the real client IP from Vercel/Next.js request headers. */
export function getClientIp(request: Request): string {
  const forwarded = (request.headers as Headers).get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

/**
 * Password reset: 3 attempts per email hash per hour (sliding window).
 */
export const passwordResetLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  prefix: 'rl:password-reset',
});
```

- [ ] **Step 3: Verificar TypeScript**

```bash
rtk npx tsc --noEmit 2>&1 | head -20
```

Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
rtk git add package.json package-lock.json src/lib/rateLimiter.ts
rtk git commit -m "feat: install resend, add passwordResetLimiter"
```

---

## Task 2: `src/lib/email.ts` — wrapper Resend

**Files:**
- Create: `src/lib/email.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'noreply@resenhaprejogo.app';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://resenhaprejogo.app';

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const link = `${BASE_URL}/reset-senha?token=${token}`;
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Recuperação de senha — Resenha Pré-Jogo',
    html: `
      <p>Você solicitou a recuperação de senha.</p>
      <p><a href="${link}">Clique aqui para criar uma nova senha</a> (válido por 1 hora).</p>
      <p>Se não foi você, ignore este email.</p>
    `,
    text: `Você solicitou a recuperação de senha.\n\nLink (válido por 1 hora):\n${link}\n\nSe não foi você, ignore este email.`,
  });
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
rtk npx tsc --noEmit 2>&1 | head -20
```

Expected: sem erros em `src/lib/email.ts`.

- [ ] **Step 3: Commit**

```bash
rtk git add src/lib/email.ts
rtk git commit -m "feat: add email wrapper (sendPasswordResetEmail via Resend)"
```

---

## Task 3: `POST /api/auth/forgot-password`

**Files:**
- Create: `src/app/api/auth/forgot-password/route.ts`

- [ ] **Step 1: Criar o route handler**

```typescript
import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, hashEmail } from '@/lib/userIdentity';
import { redis } from '@/lib/redisCache';
import { passwordResetLimiter } from '@/lib/rateLimiter';
import { sendPasswordResetEmail } from '@/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TTL_1H = 3600;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { email } = body as Record<string, string>;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Email inválido.' }, { status: 400 });
  }

  // Rate limit por email hash (não por IP — evita punir usuários em redes compartilhadas)
  const emailHash = hashEmail(email);
  const { success } = await passwordResetLimiter.limit(emailHash);
  if (!success) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em 1 hora.' },
      { status: 429 },
    );
  }

  // Lookup silencioso — não revela se o email existe
  const found = await getUserByEmail(email);
  if (!found) {
    return NextResponse.json({ ok: true });
  }

  const { userId } = found;
  const token = randomBytes(32).toString('hex');

  await redis.set(`reset:${token}`, { userId }, { ex: TTL_1H });

  try {
    await sendPasswordResetEmail(email, token);
  } catch (err) {
    console.error('[forgot-password] email send failed:', err);
    // Não expõe o erro ao usuário — o token está salvo, pode tentar de novo
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Testar manualmente — email inválido**

Com o servidor rodando (`npm run dev`):

```bash
curl -s -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"nao-e-email"}' | jq .
```

Expected:
```json
{ "error": "Email inválido." }
```

- [ ] **Step 3: Testar manualmente — email não cadastrado**

```bash
curl -s -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"naoexiste@test.invalid"}' | jq .
```

Expected:
```json
{ "ok": true }
```

(Sem envio de email — email não existe no Redis.)

- [ ] **Step 4: Testar manualmente — email cadastrado**

Substitua `SEU_EMAIL_REAL` por um email registrado na aplicação:

```bash
curl -s -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"SEU_EMAIL_REAL"}' | jq .
```

Expected: `{ "ok": true }` e email recebido na caixa de entrada com link `/reset-senha?token=...`.

Se `RESEND_API_KEY` não estiver no `.env.local`, adicionar antes de testar:
```
RESEND_API_KEY=re_SuaChaveAqui
```

- [ ] **Step 5: Commit**

```bash
rtk git add src/app/api/auth/forgot-password/route.ts
rtk git commit -m "feat: POST /api/auth/forgot-password — rate limit, token Redis, email"
```

---

## Task 4: `POST /api/auth/reset-password`

**Files:**
- Create: `src/app/api/auth/reset-password/route.ts`

- [ ] **Step 1: Criar o route handler**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redisCache';
import { getUserById } from '@/lib/userIdentity';
import { hashPassword } from '@/lib/passwordUtils';

const TTL_1Y = 60 * 60 * 24 * 365;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { token, password } = body as Record<string, string>;

  if (!token || typeof token !== 'string' || token.length !== 64) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Senha deve ter pelo menos 8 caracteres.' }, { status: 400 });
  }

  // Buscar token no Redis
  const data = await redis.get<{ userId: string }>(`reset:${token}`);
  if (!data?.userId) {
    return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 });
  }

  const { userId } = data;

  // Buscar user record atual
  const record = await getUserById(userId);
  if (!record) {
    // Usuário foi deletado após o token ser gerado
    await redis.del(`reset:${token}`);
    return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 404 });
  }

  // Atualizar passwordHash
  const passwordHash = await hashPassword(password);
  await redis.set(`user:${userId}`, { ...record, passwordHash }, { ex: TTL_1Y });

  // Invalidar token — uso único
  await redis.del(`reset:${token}`);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Testar manualmente — token inválido**

```bash
curl -s -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","password":"NovaSenha123!"}' | jq .
```

Expected:
```json
{ "error": "Link inválido ou expirado." }
```

- [ ] **Step 3: Testar fluxo completo (manual)**

1. Chamar `POST /api/auth/forgot-password` com email real → receber email
2. Copiar o token da URL do link recebido
3. Chamar `POST /api/auth/reset-password` com o token e nova senha
4. Expected: `{ "ok": true }`
5. Tentar chamar novamente com o mesmo token → Expected: `{ "error": "Link inválido ou expirado." }` (uso único)
6. Fazer login com a nova senha → deve funcionar

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/api/auth/reset-password/route.ts
rtk git commit -m "feat: POST /api/auth/reset-password — validate token, update passwordHash, DEL token"
```

---

## Task 5: `/esqueci-senha` — Formulário de email

**Files:**
- Create: `src/app/esqueci-senha/page.tsx`

- [ ] **Step 1: Criar a página**

```typescript
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

    // 200 — sucesso ou email não cadastrado (resposta genérica)
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
```

- [ ] **Step 2: Verificar no browser**

Navegar para `http://localhost:3000/esqueci-senha`. Verificar:
- Formulário renderiza corretamente no fundo escuro
- Submeter email inexistente → mensagem genérica de sucesso aparece
- Submeter email inválido (`abc`) → mensagem de erro "Email inválido."

- [ ] **Step 3: Commit**

```bash
rtk git add src/app/esqueci-senha/page.tsx
rtk git commit -m "feat: /esqueci-senha page — email form with rate limit and success feedback"
```

---

## Task 6: `/reset-senha` — Formulário de nova senha

**Files:**
- Create: `src/app/reset-senha/page.tsx`

- [ ] **Step 1: Criar a página**

```typescript
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

  // Token ausente na URL
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
```

- [ ] **Step 2: Verificar no browser**

Testar os seguintes cenários em `http://localhost:3000/reset-senha`:

1. **Sem token na URL:** página deve exibir "Link inválido. Verifique o email ou solicite um novo link." com link para `/esqueci-senha`
2. **Token inválido na URL** (`?token=abc`): submeter senhas → API retorna 400 (token length inválido — 3 chars ≠ 64 chars) → exibe "Token inválido."
3. **Token expirado/inexistente 64 chars:** `?token=` + 64 `a`s → submeter → API retorna 404 → exibe "Link inválido ou expirado."
4. **Senhas não coincidem:** erro client-side "As senhas não coincidem." sem fazer request
5. **Fluxo completo com token real:** solicitar reset via `/esqueci-senha`, clicar no link do email, definir nova senha → "Senha alterada com sucesso!"

- [ ] **Step 3: Commit**

```bash
rtk git add src/app/reset-senha/page.tsx
rtk git commit -m "feat: /reset-senha page — nova senha com validação client-side e feedback"
```

---

## Task 7: `/login` — Adicionar link "Esqueci minha senha"

**Files:**
- Modify: `src/app/login/page.tsx` (linhas 95–107 — bloco do campo senha)

- [ ] **Step 1: Adicionar import de Link e o link no formulário**

No topo do arquivo, adicionar o import (após os imports existentes):

```typescript
import Link from 'next/link';
```

No JSX, substituir o bloco do campo senha (atualmente linhas 95–107):

```tsx
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
```

- [ ] **Step 2: Verificar no browser**

Navegar para `http://localhost:3000/login`:
- Tab "Entrar": link "Esqueci minha senha" visível à direita do label "Senha"
- Tab "Criar conta": link NÃO visível (condicional `tab === 'login'`)
- Clicar no link → navega para `/esqueci-senha`

- [ ] **Step 3: Verificar TypeScript**

```bash
rtk npx tsc --noEmit 2>&1 | head -20
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
rtk git add src/app/login/page.tsx
rtk git commit -m "feat: add 'Esqueci minha senha' link to login page"
```

---

## Task 8: Verificação final

**Files:** nenhum — só verificação.

- [ ] **Step 1: Verificar build de produção**

```bash
rtk npx next build 2>&1 | tail -20
```

Expected: build sem erros. As novas rotas `/esqueci-senha` e `/reset-senha` devem aparecer na lista de páginas geradas.

- [ ] **Step 2: Teste de ponta a ponta manual completo**

Executar o seguinte roteiro completo:

1. Ir para `http://localhost:3000/login`
2. Verificar link "Esqueci minha senha" visível na tab Entrar e invisível na tab Criar conta
3. Clicar no link → chegar em `/esqueci-senha`
4. Submeter email não cadastrado → mensagem genérica de sucesso (sem email enviado)
5. Submeter email cadastrado → `{ ok: true }` + email recebido com link válido
6. Clicar no link do email → chegar em `/reset-senha?token=...` com formulário
7. Submeter senhas que não coincidem → erro client-side
8. Submeter nova senha válida → "Senha alterada com sucesso!" com botão "Entrar"
9. Clicar "Entrar" → ir para `/login`
10. Fazer login com a nova senha → sucesso
11. Tentar usar o mesmo link de reset novamente → "Link inválido ou expirado."
12. Submeter o email 4 vezes seguidas → na 4ª vez retorna 429 "Muitas tentativas"

- [ ] **Step 3: Commit final (se houver ajustes)**

```bash
rtk git add -A
rtk git commit -m "feat: password recovery flow complete — forgot + reset + email"
```

---

## Variáveis de ambiente

Adicionar ao `.env.local` antes de testar:

```env
RESEND_API_KEY=re_SuaChaveAqui
```

A `NEXT_PUBLIC_BASE_URL` é opcional — sem ela, o link no email usa `https://resenhaprejogo.app` (correto em produção). Em desenvolvimento local, o link aponta para produção mas o token é válido pois está no Redis de desenvolvimento.

---

## Self-Review — Cobertura da Spec

| Requisito da Spec | Task |
|---|---|
| `resend` instalado | Task 1 |
| `passwordResetLimiter` (3/hora por email) | Task 1 |
| `src/lib/email.ts` com `sendPasswordResetEmail` | Task 2 |
| `POST /api/auth/forgot-password` — validação email | Task 3 |
| `POST /api/auth/forgot-password` — rate limit | Task 3 |
| `POST /api/auth/forgot-password` — token Redis TTL 1h | Task 3 |
| `POST /api/auth/forgot-password` — resposta genérica (não revela email) | Task 3 |
| `POST /api/auth/reset-password` — validação token | Task 4 |
| `POST /api/auth/reset-password` — atualiza passwordHash | Task 4 |
| `POST /api/auth/reset-password` — DEL token (uso único) | Task 4 |
| `/esqueci-senha` — formulário + feedback correto | Task 5 |
| `/reset-senha` — validação client-side + feedback | Task 6 |
| `/reset-senha` — Suspense wrapper | Task 6 |
| `/login` — link "Esqueci minha senha" na tab Entrar | Task 7 |
| Build de produção sem erros | Task 8 |
| Teste e2e manual completo | Task 8 |
