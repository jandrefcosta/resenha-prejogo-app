# Remoção da captura de e-mail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover toda a funcionalidade de captura de e-mail do app (botão "Novidades", banner flutuante e o email-gate de H2H/Escalações/Ficha), incluindo a rota `/api/identity` e o código morto associado, sem conteúdo substituto.

**Architecture:** A captura é uma camada fina sobre `userIdentity.ts` (infra compartilhada de auth/social, que **permanece intocada**). Removemos as superfícies de UI primeiro (assim o componente fica sem importadores), depois apagamos o componente, depois a rota e o código órfão da lib, depois docs. Cada tarefa compila e é commitada isoladamente.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React client components, Drizzle/Postgres + Upstash Redis (não tocados aqui), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-06-13-remover-captura-email-design.md`

---

## File structure / blast radius

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/components/MatchCard.tsx` | Card de jogo + modais | Remover gate (prop, estado, helpers, render, import) |
| `src/components/MatchSection.tsx` | Lista de cards | Parar de passar a prop `noEmailGate` (3x) |
| `src/app/copa-2026/page.tsx` | Página da Copa | Remover botão + banner + import |
| `src/components/home/ClubHome.tsx` | Home do clube/Brasileirão | Remover botão + banner + import |
| `src/components/EmailCaptureModal.tsx` | Modal + triggers de captura | **Apagar** |
| `src/app/api/identity/route.ts` | Endpoint de cadastro | **Apagar** |
| `src/lib/userIdentity.ts` | Infra de identidade (compartilhada) | Remover só `IDENTITY_COOKIE` + `registerOrUpdateUser` |
| `docs/features/10-email-capture.md` + refs técnicas | Documentação | Atualizar/remover |

**Intocável:** resto de `userIdentity.ts`, `auth.ts`, `/api/auth/*`, `/api/social/*`, `email.ts`, tabela `users`, dados existentes.

---

## Task 0: Branch de trabalho

**Files:** nenhum (git)

- [ ] **Step 1: Criar branch a partir de `main`**

Run:
```bash
git switch -c chore/remove-email-capture
```
Expected: `Switched to a new branch 'chore/remove-email-capture'`

---

## Task 1: Remover o email-gate do `MatchCard` e parar de passá-lo no `MatchSection`

Estas duas mudanças vão juntas: ao remover a prop `noEmailGate` do `MatchCard`, o `MatchSection` não pode mais passá-la (TypeScript falharia). Resultado: H2H/Escalações/Ficha abrem direto.

**Files:**
- Modify: `src/components/MatchCard.tsx`
- Modify: `src/components/MatchSection.tsx`

- [ ] **Step 1: Remover o import de `EmailCaptureModal` no `MatchCard`**

Em `src/components/MatchCard.tsx`, apagar o bloco de import (linhas 30-33):
```tsx
import {
  EmailCaptureModal,
  EMAIL_REGISTERED_KEY,
} from "@/components/EmailCaptureModal";
```
(Deixar os imports vizinhos `LIVE_WINDOW_MS` e `BROADCASTER_COLORS` intactos.)

- [ ] **Step 2: Remover a prop `noEmailGate` da assinatura e do tipo**

Apagar a linha `  noEmailGate = false,` (l.1601) da desestruturação e a linha `  noEmailGate?: boolean;` (l.1613) do tipo de props.

- [ ] **Step 3: Remover estado, effect e helpers do gate**

Apagar o bloco de estado (l.1650-1654):
```tsx
  const [emailRegistered, setEmailRegistered] = useState(false);
  const [emailGateOpen, setEmailGateOpen] = useState(false);
  const [broadcasterModalOpen, setBroadcasterModalOpen] = useState(false);
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);
```
substituindo por (preserva `broadcasterModalOpen` e `liveModalOpen`, que NÃO são do gate):
```tsx
  const [broadcasterModalOpen, setBroadcasterModalOpen] = useState(false);
  const [liveModalOpen, setLiveModalOpen] = useState(false);
```

Apagar o `useEffect` que lê o flag (l.1656-1658):
```tsx
  useEffect(() => {
    setEmailRegistered(localStorage.getItem(EMAIL_REGISTERED_KEY) === "1");
  }, []);
```

Apagar `withEmailGate` (l.1660-1667):
```tsx
  function withEmailGate(action: () => void) {
    if (noEmailGate || emailRegistered) {
      action();
    } else {
      pendingActionRef.current = action;
      setEmailGateOpen(true);
    }
  }
```

Apagar `handleEmailGateClose` (l.1669-1677):
```tsx
  function handleEmailGateClose() {
    const nowRegistered = localStorage.getItem(EMAIL_REGISTERED_KEY) === "1";
    if (nowRegistered) {
      setEmailRegistered(true);
      pendingActionRef.current?.();
    }
    pendingActionRef.current = null;
    setEmailGateOpen(false);
  }
```

- [ ] **Step 4: Desembrulhar os 3 callsites dos botões**

Trocar os `onClick` dos botões de ação (l.2124, 2132, 2140):
```tsx
              onClick={() => withEmailGate(openH2HModal)}
```
→
```tsx
              onClick={openH2HModal}
```
E analogamente:
`onClick={() => withEmailGate(openPlayersModal)}` → `onClick={openPlayersModal}`
`onClick={() => withEmailGate(openFichaModal)}` → `onClick={openFichaModal}`

- [ ] **Step 5: Remover o render do modal de gate**

Apagar (l.2246-2247):
```tsx
      {/* Email gate */}
      {emailGateOpen && <EmailCaptureModal onClose={handleEmailGateClose} />}
```

- [ ] **Step 6: Remover as 3 passagens de `noEmailGate` no `MatchSection`**

Em `src/components/MatchSection.tsx`:
- l.586: apagar a linha `                        noEmailGate={groupIndex <= 1}`
- l.637: apagar a linha `                      noEmailGate`
- l.655: apagar a linha `                    noEmailGate`

- [ ] **Step 7: Verificar que `useRef` ainda é usado (evitar import órfão)**

Run:
```bash
grep -n "useRef" src/components/MatchCard.tsx | head
```
Expected: ainda há outras ocorrências de `useRef` no arquivo. Se NÃO houver mais nenhuma, remover `useRef` do import de `react` no topo. (Idem para `useEffect`/`useState` — só remover do import se ficarem totalmente sem uso, o que é improvável neste arquivo grande.)

- [ ] **Step 8: Type-check / build incremental**

Run:
```bash
npx tsc --noEmit
```
Expected: sem erros relacionados a `noEmailGate`, `withEmailGate`, `EmailCaptureModal`, `EMAIL_REGISTERED_KEY`, `emailRegistered`, `emailGateOpen` ou `pendingActionRef`.

- [ ] **Step 9: Commit**

```bash
git add src/components/MatchCard.tsx src/components/MatchSection.tsx
git commit -m "feat: remove email gate from match cards"
```

---

## Task 2: Remover os triggers (botão + banner) das duas home pages

**Files:**
- Modify: `src/app/copa-2026/page.tsx`
- Modify: `src/components/home/ClubHome.tsx`

- [ ] **Step 1: Remover o import na página da Copa**

Em `src/app/copa-2026/page.tsx`, apagar (l.9-12):
```tsx
import {
  EmailSubscribeButton,
  EmailJourneyBanner,
} from "@/components/EmailCaptureModal";
```

- [ ] **Step 2: Remover o botão e o banner na página da Copa**

Apagar `            <EmailSubscribeButton />` (l.79) — a fila de CTAs do hero (`flex-wrap`) reflui sozinha.
Apagar `        <EmailJourneyBanner />` (l.102).

- [ ] **Step 3: Remover o import no `ClubHome`**

Em `src/components/home/ClubHome.tsx`, apagar (l.8):
```tsx
import { EmailSubscribeButton, EmailJourneyBanner } from '@/components/EmailCaptureModal';
```

- [ ] **Step 4: Remover o botão e o banner no `ClubHome`**

Apagar `            <EmailSubscribeButton />` (l.46).
Apagar `      <EmailJourneyBanner />` (l.69).

- [ ] **Step 5: Type-check**

Run:
```bash
npx tsc --noEmit
```
Expected: sem erros. (O componente `EmailCaptureModal` ainda existe; só ficou sem importadores.)

- [ ] **Step 6: Commit**

```bash
git add src/app/copa-2026/page.tsx src/components/home/ClubHome.tsx
git commit -m "feat: remove email subscribe button and journey banner from home pages"
```

---

## Task 3: Apagar o componente `EmailCaptureModal`

Pré-condição: após as Tasks 1 e 2, não há mais importadores.

**Files:**
- Delete: `src/components/EmailCaptureModal.tsx`

- [ ] **Step 1: Confirmar zero importadores**

Run:
```bash
grep -rn "EmailCaptureModal\|EmailSubscribeButton\|EmailJourneyBanner\|EMAIL_REGISTERED_KEY" src/
```
Expected: **nenhum resultado** (fora de docs). Se aparecer algo em `src/`, resolver antes de apagar.

- [ ] **Step 2: Apagar o arquivo**

Run:
```bash
git rm src/components/EmailCaptureModal.tsx
```

- [ ] **Step 3: Build**

Run:
```bash
npm run build
```
Expected: build conclui sem erros de módulo não encontrado.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete EmailCaptureModal component"
```

---

## Task 4: Apagar a rota `/api/identity` e limpar código morto em `userIdentity.ts`

**Files:**
- Delete: `src/app/api/identity/route.ts`
- Modify: `src/lib/userIdentity.ts`

- [ ] **Step 1: Apagar a rota**

Run:
```bash
git rm src/app/api/identity/route.ts
```
(Se a pasta `src/app/api/identity/` ficar vazia, o `git rm` já a remove do tracking.)

- [ ] **Step 2: Confirmar que `IDENTITY_COOKIE` e `registerOrUpdateUser` ficaram órfãos**

Run:
```bash
grep -rn "IDENTITY_COOKIE\|registerOrUpdateUser" src/
```
Expected: **nenhum resultado** (apenas as definições em `userIdentity.ts`). Se algo além disso aparecer, parar e reavaliar — não é o caso esperado.

- [ ] **Step 3: Remover `IDENTITY_COOKIE` de `userIdentity.ts`**

Apagar a linha (l.6):
```ts
export const IDENTITY_COOKIE = 'sc_uid';
```

- [ ] **Step 4: Remover `registerOrUpdateUser` de `userIdentity.ts`**

Apagar a função inteira (l.41-103), do comentário de bloco até o `}` final:
```ts
/**
 * Registers a new user or updates an existing one.
 * Returns the userId to be stored in the cookie.
 */
export async function registerOrUpdateUser(
  ...
  return userId;
}
```
**Manter** `hashEmail`, `getUserById`, `getUserByEmail`, `UserRecord`, `hashEmail`, e os imports `db`/`users`/`redis`/`crypto` (ainda usados pelas funções mantidas).

- [ ] **Step 5: Verificar imports órfãos em `userIdentity.ts`**

Run:
```bash
npx tsc --noEmit
```
Expected: sem erros. Se o `tsc`/lint apontar `randomUUID` como não usado (era usado só por `registerOrUpdateUser`), remover `randomUUID` do import `crypto` mantendo `createHash`:
```ts
import { createHash } from 'crypto';
```

- [ ] **Step 6: Build**

Run:
```bash
npm run build
```
Expected: build conclui sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/lib/userIdentity.ts
git commit -m "chore: remove /api/identity route and dead identity-cookie code"
```

---

## Task 5: Atualizar a documentação

**Files:**
- Delete: `docs/features/10-email-capture.md`
- Modify: `ARCHITECTURE.md`, `docs/technical/architecture.md`, `docs/technical/api-routes.md`, `docs/technical/system-overview.md`, `docs/technical/redis-key-catalog.md`

- [ ] **Step 1: Apagar o doc da feature**

Run:
```bash
git rm docs/features/10-email-capture.md
```

- [ ] **Step 2: Localizar referências remanescentes**

Run:
```bash
grep -rni "EmailCaptureModal\|/api/identity\|email-capture\|captura de e-mail\|sc_uid\|IDENTITY_COOKIE\|registerOrUpdateUser" ARCHITECTURE.md docs/
```
Expected: lista de ocorrências em docs.

- [ ] **Step 3: Editar cada referência**

Para cada arquivo retornado no Step 2, remover a linha/seção que descreve a captura de e-mail, o endpoint `/api/identity`, o componente `EmailCaptureModal`, o cookie `sc_uid` (`IDENTITY_COOKIE`) e a chave Redis `identity:`. Em `redis-key-catalog.md`, remover a entrada da chave `identity:`/`sc_uid`. **Não** remover menções a `users`, `user:{id}`, `email:{hash}`, auth ou social — esses permanecem.

- [ ] **Step 4: Confirmar limpeza**

Run:
```bash
grep -rni "EmailCaptureModal\|/api/identity\|email-capture\|captura de e-mail\|IDENTITY_COOKIE\|registerOrUpdateUser" ARCHITECTURE.md docs/ | grep -v "superpowers/specs\|superpowers/plans"
```
Expected: **nenhum resultado** (specs/plans históricos podem manter menções — são registro do trabalho).

- [ ] **Step 5: Commit**

```bash
git add -A docs/ ARCHITECTURE.md
git commit -m "docs: remove email-capture references"
```

---

## Task 6: Verificação final

**Files:** nenhum

- [ ] **Step 1: Lint**

Run:
```bash
npm run lint
```
Expected: sem **novos** erros introduzidos por estas mudanças. (Nota: o repo tem ~15 erros de lint pré-existentes — comparar contra a baseline; nenhum dos arquivos tocados deve introduzir erro novo de variável não usada.)

- [ ] **Step 2: Build de produção**

Run:
```bash
npm run build
```
Expected: build conclui com sucesso.

- [ ] **Step 3: E2E**

Run:
```bash
npm run test:e2e
```
Expected: suíte passa. Se algum spec (ex.: fluxo de clube abrindo Confronto/Jogadores/Ficha) assumia o passo de cadastro de e-mail, ajustar o spec para esperar o modal abrir **direto** e commitar junto.

- [ ] **Step 4: Verificação manual (`npm run dev`)**

Conferir:
- Hero da Copa (`/copa-2026`) e home do Brasileirão (`/` ou `/meu-clube`) **sem** o botão "Novidades"; demais CTAs reorganizados.
- Banner flutuante **não** aparece após 45s em nenhuma das páginas.
- Em qualquer card de jogo (qualquer grupo), os botões **Confronto / Jogadores / Ficha** abrem o modal **direto**, sem pedir e-mail.
- `POST /api/identity` agora retorna **404**.

- [ ] **Step 5: Integração (decisão do usuário)**

Usar a skill `superpowers:finishing-a-development-branch` para escolher merge/PR. Não fazer merge em `main` sem aprovação.

---

## Self-review (preenchido pelo autor do plano)

- **Cobertura do spec:** botão (T2) ✓, banner (T2) ✓, gate H2H/Players/Ficha (T1) ✓, `MatchSection` props (T1) ✓, apagar componente (T3) ✓, apagar `/api/identity` (T4) ✓, limpar `userIdentity.ts` (T4) ✓, docs (T5) ✓, intocável preservado (notas em T1/T4) ✓, verificação lint/build/e2e/manual (T6) ✓.
- **Placeholders:** nenhum — todos os blocos de código são literais do arquivo atual.
- **Consistência de nomes:** `withEmailGate`, `handleEmailGateClose`, `emailGateOpen`, `noEmailGate`, `EMAIL_REGISTERED_KEY`, `IDENTITY_COOKIE`, `registerOrUpdateUser` usados de forma consistente entre tarefas e batem com o código lido.
- **Dados:** cookies `sc_uid` e flag `localStorage` ficam órfãos por design (documentado no spec); sem migração de dados neste escopo.
