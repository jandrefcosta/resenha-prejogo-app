# Recuperação de Senha — Design Spec

**Data:** 2026-04-21
**Status:** Aprovado
**Escopo:** Fluxo completo de recuperação de senha via email com token opaco no Redis

---

## Contexto

O projeto já tem auth completa (register/login/logout/me) com JWT + bcrypt + Redis. Não há provedor de email configurado. Este spec adiciona recuperação de senha usando Resend como provedor de email e token opaco armazenado no Redis.

---

## Decisões de design

| Decisão | Escolha |
|---------|---------|
| Provedor de email | Resend (`resend` npm package) |
| Endereço de envio | `noreply@resenhaprejogo.app` |
| Estratégia de token | Token opaco — `crypto.randomBytes(32).toString('hex')` (256 bits) |
| Armazenamento | Redis `reset:{token}` → `{ userId }` com TTL 1h |
| Rate limiting | 3 requests por email por hora — chave `ratelimit:reset:{emailHash}` |
| Uso único | `DEL reset:{token}` imediato após reset bem-sucedido |
| Enumeração de usuários | Resposta sempre `{ ok: true }` independente de o email existir |
| Idioma das rotas | Português (`/esqueci-senha`, `/reset-senha`) |

---

## Arquivos

### Novos

```
src/lib/email.ts                              — wrapper Resend: sendPasswordResetEmail()
src/app/api/auth/forgot-password/route.ts     — POST: gera token, envia email
src/app/api/auth/reset-password/route.ts      — POST: valida token, atualiza senha
src/app/esqueci-senha/page.tsx                — formulário de email
src/app/reset-senha/page.tsx                  — formulário de nova senha (lê ?token)
```

### Modificados

```
src/app/login/page.tsx    — adicionar link "Esqueci minha senha" na tab Entrar
```

### Variáveis de ambiente novas

```
RESEND_API_KEY=re_...
```

---

## `src/lib/email.ts`

Wrapper fino sobre o SDK Resend. Única responsabilidade: enviar o email de reset.

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

**Env vars necessárias:**
- `RESEND_API_KEY` — chave da conta Resend
- `NEXT_PUBLIC_BASE_URL` — URL base da aplicação (já pode existir no projeto)

---

## `POST /api/auth/forgot-password`

### Request
```json
{ "email": "usuario@exemplo.com" }
```

### Lógica

1. Valida formato de email — retorna 400 se inválido
2. Verifica rate limit: `INCR ratelimit:reset:{emailHash}` com TTL 1h
   - Se contador > 3 → retorna 429 `{ error: 'Muitas tentativas. Tente novamente em 1 hora.' }`
3. Busca usuário por email via `getUserByEmail(email)`
4. **Se não existir:** retorna `{ ok: true }` (não revela se o email está cadastrado)
5. **Se existir:**
   - Gera token: `randomBytes(32).toString('hex')`
   - Armazena `reset:{token}` → `{ userId }` com TTL 3600s
   - Chama `sendPasswordResetEmail(email, token)` — se falhar, loga o erro mas não expõe ao usuário
   - Retorna `{ ok: true }`

### Response
Sempre `200 { ok: true }` (sucesso ou email não encontrado).
`400` se email mal formatado. `429` se rate limit excedido.

---

## `POST /api/auth/reset-password`

### Request
```json
{ "token": "abc123...", "password": "NovaSenha123!" }
```

### Lógica

1. Valida presença de `token` e `password` (mínimo 8 chars)
2. Busca `reset:{token}` no Redis → `{ userId }`
3. Se não existir ou expirado → `404 { error: 'Link inválido ou expirado.' }`
4. Busca `user:{userId}` → `UserRecord`
5. Faz `hashPassword(password)` e atualiza `user:{userId}` com novo `passwordHash`
6. `DEL reset:{token}` — invalida o token imediatamente
7. Retorna `200 { ok: true }`
8. **Não** cria sessão automaticamente — usuário faz login manualmente após reset

---

## `/esqueci-senha` — Formulário de email

**Client Component** (mesma abordagem da página `/login`).

- Campo email + botão "Enviar link"
- Após submit (sucesso ou email não encontrado): exibe mensagem genérica:
  > "Se esse email estiver cadastrado, você receberá um link em breve."
- Erro 429: exibe "Muitas tentativas. Tente novamente em 1 hora."
- Erro 400: exibe "Email inválido."
- Link "Voltar para o login" → `/login`
- Visual: mesmo estilo dark (zinc-900) da página de login

---

## `/reset-senha` — Formulário de nova senha

**Client Component** com `useSearchParams()` para ler `?token`.

- Se `token` ausente na URL: exibe erro imediatamente com link para `/esqueci-senha`
- Campos: "Nova senha" + "Confirmar nova senha" (ambos `type="password"`)
- Validação client-side: senhas devem coincidir, mínimo 8 chars
- Após submit com sucesso: exibe mensagem "Senha alterada com sucesso!" + link para `/login`
- Erro 404 (token inválido/expirado): exibe "Link inválido ou expirado." + link para `/esqueci-senha`
- Wrapped em `<Suspense>` (necessário por usar `useSearchParams`)

---

## `/login` — Modificação

Na tab "Entrar", adicionar abaixo do campo de senha:

```tsx
<div className="text-right">
  <Link href="/esqueci-senha" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
    Esqueci minha senha
  </Link>
</div>
```

Visível apenas quando `tab === 'login'`.

---

## Redis keys

| Chave | Valor | TTL |
|-------|-------|-----|
| `reset:{token}` | `{ userId: string }` | 3600s (1h) |
| `ratelimit:reset:{emailHash}` | número inteiro (contador) | 3600s (1h) |

---

## Segurança

- Token de 256 bits — impossível de adivinhar por força bruta
- Uso único — invalidado imediatamente após uso
- TTL curto — expira em 1 hora
- Rate limit — máximo 3 tentativas por email por hora
- Resposta genérica — não revela se o email está cadastrado
- Sem login automático após reset — usuário deve autenticar explicitamente

---

## Definition of Done

- [ ] `resend` instalado como dependência
- [ ] `RESEND_API_KEY` documentado no `.env.example` (ou equivalente)
- [ ] `src/lib/email.ts` implementado
- [ ] `POST /api/auth/forgot-password` — rate limit + geração de token + envio de email
- [ ] `POST /api/auth/reset-password` — validação + atualização de senha + DEL token
- [ ] `/esqueci-senha` — formulário funcional com feedback correto
- [ ] `/reset-senha` — formulário com validação client-side + feedback de erro/sucesso
- [ ] `/login` — link "Esqueci minha senha" visível na tab Entrar
- [ ] Testado manualmente: email recebido, link funciona, token expira após uso, tentativa repetida retorna erro
