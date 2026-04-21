# E2E Tests: Auth + Bolão (stack completo) — Design Spec

**Data:** 2026-04-21
**Status:** Aprovado
**Escopo:** Testes end-to-end de cadastro, login, acesso restrito e fluxos básicos do Bolão Copa 2026

---

## Contexto

O projeto já tem 4 spec files Playwright em `tests/e2e/` usando a estratégia de mock de API (`page.route()`). Esta spec adiciona testes de stack completo — sem mocks — para os fluxos de auth e bolão recém-implementados. Os testes rodam contra o servidor local real com Redis e `.env.local` ativos.

---

## Decisões de design

| Decisão | Escolha |
|---------|---------|
| Estratégia de auth nos testes | Stack completo — sem mocks de API |
| Criação de usuário de teste | `POST /api/auth/register` via Playwright request API (não pela UI) |
| Injeção de sessão | `page.context().addCookies()` com cookie `sc_auth` obtido do login |
| Isolamento de dados | Cada execução gera email único (`e2e_${Date.now()}@test.com`) |
| Cleanup Redis | `afterAll` via script Node inline com `execSync` — sem endpoint novo |
| Escopo de bolão | Auth + bolão básico (criar, entrar por código, ranking privado) |

---

## Arquivos a criar

```
tests/e2e/helpers/authHelper.ts   — registro, login, cleanup Redis
tests/e2e/auth.spec.ts            — cadastro, login, logout, rotas restritas
tests/e2e/bolao.spec.ts           — criar bolão, entrar por código, ranking privado
```

---

## `authHelper.ts`

### `createTestUser(request)`

Chama `POST /api/auth/register` via `request.newContext()` do Playwright. Retorna credenciais para uso no teste.

```typescript
interface TestUser {
  userId: string;
  email: string;
  password: string;
  username: string;
}

async function createTestUser(request: APIRequestContext): Promise<TestUser>
```

- Email: `e2e_${Date.now()}@test.com`
- Username: `e2e_${Date.now()}`
- Password: `TestPass123!`
- Lança erro se o registro falhar (não engole falhas silenciosamente)

### `loginAs(page, email, password)`

Faz `POST /api/auth/login` via `page.request` e injeta o cookie `sc_auth` no contexto da página. Mais rápido que navegar pela UI de login em cada teste.

```typescript
async function loginAs(page: Page, email: string, password: string): Promise<void>
```

- Extrai `sc_auth` do header `set-cookie` da resposta
- Injeta via `page.context().addCookies([{ name: 'sc_auth', value, ... }])`
- Lança erro se login retornar status != 200

### `cleanupTestUser(userId, email, bolaoIds?, codigo?)`

Executa cleanup das chaves Redis criadas durante o teste via script Node inline no `afterAll`.

```typescript
async function cleanupTestUser(opts: {
  userId: string;
  email: string;
  username: string;
  bolaoIds?: string[];
  codigos?: string[];
}): Promise<void>
```

Chaves deletadas:
- `user:{userId}` — registro do usuário
- `user:email:{email}` — índice de email
- `session:*` — sessões JWT (via SCAN por padrão `session:*` + verificação de jti)
- `bolao:{id}:meta`, `bolao:{id}:members`, `bolao:{id}:ranking` — por cada bolaoId
- `bolao:code:{codigo}` — por cada código de convite
- `bolao:user:{userId}:boloes` — set de bolões do usuário
- `palpite:user:{userId}:fixtures` — index de palpites
- ZREM cirúrgico em `bolao:global:ranking` — remove apenas o membro, não o sorted set

---

## `auth.spec.ts`

### Setup

```typescript
// Sem beforeEach global — cada teste é independente
// setupStorage() para pular OnboardingModal
```

### Testes

| # | Nome | Descrição |
|---|------|-----------|
| 1 | Cadastro via UI | Navega para `/login`, clica tab "Criar conta", preenche username/email/senha, submete. Verifica redirecionamento e cookie `sc_auth` presente. |
| 2 | Login via UI | Navega para `/login` (tab "Entrar" é o default), insere credenciais válidas, submete. Verifica cookie e estado logado. |
| 3 | Login com credenciais inválidas | Submete senha errada. Verifica mensagem de erro — sem redirecionamento. |
| 4 | Logout | Usuário logado clica no botão de logout. Verifica que `sc_auth` é removido. |
| 5 | Sessão persiste após refresh | Injeta sessão via `loginAs`, recarrega a página. Verifica estado logado mantido. |
| 6 | `/bolao/[id]` sem auth → redirect | Acessa URL de bolão sem cookie. Verifica redirecionamento para `/?bolao=...`. |
| 7 | `GET /api/bolao` sem auth → 401 | Request direto sem cookie. Verifica `status: 401`. |
| 8 | `PUT /api/palpites/[id]` sem auth → 401 | Request direto sem cookie. Verifica `status: 401`. |
| 9 | `POST /api/bolao` sem auth → 401 | Request direto sem cookie. Verifica `status: 401`. |

**Cleanup:** `afterAll` deleta o usuário de teste criado.

---

## `bolao.spec.ts`

### Setup

```typescript
// beforeAll: cria usuário via createTestUser()
// loginAs() chamado por teste ou em beforeEach conforme necessidade
// afterAll: cleanupTestUser() com todos os bolaoIds criados
```

### Testes

| # | Nome | Descrição |
|---|------|-----------|
| 1 | Hub `/bolao` — visitante | Sem auth. Ranking global visível. Seção "Meus Bolões" ausente. CTA de login presente. |
| 2 | Hub `/bolao` — logado | Com auth. CTA "Meus Palpites (0/48)" visível. Seção "Meus Bolões Privados" presente. |
| 3 | Criar bolão via UI | Navega para `/bolao/novo`, preenche nome, submete. Verifica redirecionamento para `/bolao/[id]` com código gerado visível. |
| 4 | Código de convite é exibido | Após criar bolão, verifica que o código (6 chars uppercase) está visível na página `/bolao/[id]`. |
| 5 | Entrar por código — válido | Usuário 2 (segundo usuário de teste) digita código no form da hub. Verifica redirecionamento para `/bolao/[id]` correto. |
| 6 | Entrar por código — inválido | Digita `XXXXXX`. Verifica que não há redirecionamento e que o form permanece (sem crash). |
| 7 | Ranking privado — criador aparece | Após criar bolão, abre `/bolao/[id]`. Verifica que o displayName do criador está na tabela de ranking com `0 pts`. |
| 8 | Não-membro → 404 | Usuário 2 tenta acessar `/bolao/[id]` de bolão que não pertence. Verifica página 404. |
| 9 | `/bolao/[id]` sem auth → redirect | Sem cookie, acessa URL de bolão privado. Verifica redirecionamento para `/?bolao=...`. |

**Cleanup:** `afterAll` deleta ambos os usuários de teste e todos os bolões criados.

---

## Estratégia de cleanup Redis

O `afterAll` usa `execSync` para rodar um script Node inline que acessa o Redis diretamente com as mesmas credenciais do `.env.local`:

```typescript
import { execSync } from 'child_process';

execSync(`node --input-type=module`, {
  input: `
    import { Redis } from '@upstash/redis';
    const r = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
    await Promise.all([
      r.del(${JSON.stringify(keysToDelete)}),
      r.zrem('bolao:global:ranking', ...${JSON.stringify(userIds)}),
    ]);
  `,
  env: process.env,
});
```

Esse approach:
- Não requer endpoint de admin novo
- Usa as mesmas credenciais já carregadas pelo `webServer` do Playwright
- É síncrono — garante execução antes do processo Playwright encerrar
- Falhas de cleanup são logadas mas não falham o teste (dado que os testes já passaram)

---

## Considerações de CI

- Os testes de auth/bolão requerem `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` e `JWT_SECRET` no ambiente de CI
- São isolados dos spec files existentes (que usam mocks) — podem rodar em paralelo sem conflito
- `workers: 1` para os novos specs se necessário para evitar race conditions na criação de usuários simultâneos (improvável com emails únicos por timestamp, mas defensivo)
- Tempo estimado por suite: ~15-20s (dominated by Redis round trips e navegação real)

---

## Definition of Done

- [ ] `createTestUser` + `loginAs` + `cleanupTestUser` implementados e funcionando
- [ ] `auth.spec.ts` — 9 testes passando (desktop + mobile)
- [ ] `bolao.spec.ts` — 9 testes passando (desktop + mobile)
- [ ] `afterAll` cleanup remove todas as chaves Redis criadas — verificado manualmente
- [ ] `npx playwright test tests/e2e/auth.spec.ts tests/e2e/bolao.spec.ts` passa sem erros
- [ ] Testes existentes (`mobile.spec.ts`, `club-selector.spec.ts`, etc.) continuam passando
