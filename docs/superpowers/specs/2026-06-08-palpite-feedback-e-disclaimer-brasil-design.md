# Feedback de Salvamento + Disclaimer "Só Brasil" — Design

> Status: **approved** · Data: 2026-06-08 · Autor: João André + Claude

## 1. Objetivo

Duas melhorias de UX no bolão, independentes entre si:

- **A — Feedback de salvamento de palpite:** hoje salvar um palpite não dá
  confirmação clara de sucesso e **engole erros silenciosamente**. Adicionar
  estados visíveis (`Salvando…` → `✓ Salvo` / `⚠ Erro`) para **todos** os
  palpites (grupos e mata-mata).
- **B — Disclaimer "Só Brasil":** o modo de jogo paralelo "Só Brasil" é pouco
  descobrível — a seção no `/bolao` só renderiza quando já há participantes, e
  nada na tela de palpites avisa que jogos do Brasil também valem pra ele.
  Adicionar disclaimer nas duas telas e tornar a seção sempre visível.

## 2. Contexto do que já existe

- **`PalpiteRow`** (`src/components/bolao/PalpiteRow.tsx`) é um client component
  usado tanto pelas rodadas de grupo quanto pela seção "Mata-mata do Brasil".
  Auto-salva no `onBlur` de cada input via `PUT /api/palpites/{fixtureId}`.
  - O `save` (`PalpiteRow.tsx:47-64`) **não checa `res.ok`**: `await fetch(...)`
    não lança em status HTTP de erro, e o `try/finally` só limpa o estado
    `saving`. Logo, 403 (jogo travado), 503 (dados indisponíveis) e falhas de
    rede passam como se o palpite tivesse sido salvo.
  - Único feedback atual: um texto transitório `Salvando…` (`PalpiteRow.tsx:89`).
- **`PUT /api/palpites/[fixtureId]`** já retorna JSON `{ error: string }` com o
  status apropriado (401/400/403/503) — a mensagem só não é consumida no client.
- **Seção "Só Brasil" no `/bolao`** (`src/app/bolao/page.tsx:189`) está atrás do
  gate `{brazilParticipants > 0 && (...)}`, então fica invisível até alguém
  palpitar um jogo do Brasil. A seção "Ranking Global" logo acima **não** tem
  gate (sempre renderiza) — inconsistência que gera o efeito "feature sumiu".
- **Tela `/bolao/palpites`**: rodadas de grupo via `RodadaTabsWrapper` + seção
  "Mata-mata do Brasil" (`palpites/page.tsx:128-153`), que já tem nota própria
  explicando a pontuação híbrida de pênaltis.
- **Infra de testes:** vitest em `environment: 'node'` (`vitest.config.ts`), sem
  jsdom/testing-library. Não é possível renderizar componente React em unit
  test; testes de lógica pura rodam normalmente. Playwright cobre e2e.

## 3. Decisões tomadas (brainstorming)

| Decisão | Escolha |
|---|---|
| Modelo de salvar | **Manter auto-save no blur** + adicionar feedback de sucesso/erro (não trocar por botão "Salvar" explícito) |
| Escopo do feedback | **Todos os palpites** (grupos + mata-mata), via `PalpiteRow` |
| Onde testar a lógica de rede | **Helper puro extraído** (`submitPalpite`), testável em vitest `node` — evita adicionar jsdom (que exigiria ADR) |
| Disclaimer | **Nas duas telas** (`/bolao` e `/bolao/palpites`) |
| Gate da seção Só Brasil | **Remover** — seção sempre visível, com empty state quando 0 participantes |
| Opt-in Só Brasil | **Não** — palpites já contam automaticamente; sem mudança de arquitetura |

## 4. Feature A — Feedback de salvamento

### 4.1 Helper puro `submitPalpite`

Novo arquivo `src/lib/palpiteClient.ts` (sem imports de React — testável em
`node`):

```ts
export type SubmitResult = { ok: true } | { ok: false; error: string };

/**
 * PUT do palpite com checagem de res.ok e extração da mensagem de erro do
 * backend. Nunca lança — converte qualquer falha (HTTP !ok ou rede) em
 * { ok: false, error }.
 */
export async function submitPalpite(
  fixtureId: string,
  home: number,
  away: number,
): Promise<SubmitResult> {
  try {
    const res = await fetch(`/api/palpites/${fixtureId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ home, away }),
    });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    return { ok: false, error: body?.error ?? `Erro ${res.status}` };
  } catch {
    return { ok: false, error: 'Falha de conexão' };
  }
}
```

### 4.2 `PalpiteRow` — máquina de estados

Trocar `const [saving, setSaving] = useState(false)` por um status discreto:

```ts
type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };
```

Fluxo:

- `onBlur` → valida inputs (mesma validação atual: inteiros ≥ 0) → `saving` →
  `submitPalpite(...)`.
- Sucesso → `saved` → `setTimeout` reverte pra `idle` em ~2000ms.
- Falha → `error` com a mensagem do helper.
- Estado `error` é **clicável** ("toque pra salvar") → re-chama o `save` com os
  valores atuais.
- Guardar o id do timeout numa `ref`; limpar no unmount (`useEffect` cleanup) e
  ao iniciar um novo `save`, pra não chamar `setState` após unmount.

Render (substitui o `Salvando…` atual em `PalpiteRow.tsx:89`):

- `saving` → `Salvando…` (zinc, como hoje).
- `saved` → `✓ Salvo` (verde, `text-green-400`).
- `error` → `⚠ {message} — toque pra salvar` (âmbar/vermelho), `role="button"`,
  `onClick` re-tenta.

Os inputs continuam desabilitados quando `isLocked || !!score` (inalterado).

### 4.3 Casos de borda (Feature A)

- **Blur duplo:** sair de um input e depois do outro dispara dois `save`. Aceito
  — last-write-wins no servidor; o status reflete o último retorno. Sem debounce
  (YAGNI). O cleanup de timeout em cada novo `save` evita "✓ Salvo" piscando do
  save anterior sobre um `saving` novo.
- **Valor inválido:** `save` retorna cedo sem tocar no status (igual hoje) —
  campos vazios/negativos não disparam request nem feedback.
- **Componente desmonta durante o request:** cleanup do timeout + checagem de
  montagem evitam warning de `setState` em componente desmontado.
- **Palpite travado (403):** o backend já valida kickoff; o helper expõe a
  mensagem "Palpite travado — jogo já começou" no estado `error`.

## 5. Feature B — Disclaimer "Só Brasil"

### 5.1 `/bolao` (`src/app/bolao/page.tsx`)

- **Remover o gate** `{brazilParticipants > 0 && (...)}` → a `<section>` "🇧🇷 Só
  Brasil" sempre renderiza (consistente com "Ranking Global").
- **Disclaimer** sob o título da seção (texto fixo, ~1 linha):
  > "Ranking paralelo que pontua só os jogos da Seleção, em todas as fases — seus
  > palpites nos jogos do Brasil entram automaticamente."
- **Empty state** quando `brazilParticipants === 0` (em vez da `RankingTable`
  vazia):
  > "Seja o primeiro — palpite um jogo do Brasil 🇧🇷."
- Quando há participantes: comportamento atual (top 5 + bloco "Sua posição").

### 5.2 `/bolao/palpites` (`src/app/bolao/palpites/page.tsx`)

- **Callout curto no topo** (abaixo do `<h1> Meus Palpites`, acima das rodadas):
  > "🇧🇷 Jogos do Brasil também valem pro ranking **Só Brasil** — em todas as
  > fases. [Ver ranking →](/bolao)"
- A seção "Mata-mata do Brasil" mantém a nota própria que já existe
  (`palpites/page.tsx:133-136`).

## 6. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/lib/palpiteClient.ts` | **NOVO** — helper puro `submitPalpite` + tipo `SubmitResult` |
| `src/lib/palpiteClient.test.ts` | **NOVO** — testes do `submitPalpite` (sucesso, HTTP !ok, throw) |
| `src/components/bolao/PalpiteRow.tsx` | máquina de estados `SaveStatus`, usa `submitPalpite`, render de `✓ Salvo` / `⚠ Erro` clicável, cleanup de timeout |
| `src/app/bolao/page.tsx` | remove gate da seção Só Brasil, + disclaimer, + empty state |
| `src/app/bolao/palpites/page.tsx` | + callout "Só Brasil" no topo com link pro ranking |

## 7. Testes (caminhos de erro inclusive)

**Unit (`node`, vitest) — `submitPalpite`:**

- Sucesso: `fetch` resolve com `res.ok = true` → `{ ok: true }`.
- HTTP de erro: `res.ok = false`, body `{ error: 'Palpite travado — jogo já começou' }`
  (403) → `{ ok: false, error: 'Palpite travado — jogo já começou' }`.
- HTTP de erro sem body JSON parseável → `{ ok: false, error: 'Erro 503' }`.
- `fetch` lança (rede) → `{ ok: false, error: 'Falha de conexão' }`.
- (mock de `global.fetch`.)

**e2e (Playwright) — opcional / nice-to-have:**

- Preencher um palpite de jogo aberto → ver `✓ Salvo`.
- (Caminho de erro via rota interceptada, se viável no setup atual.)

A lógica de UI restante (transições de status no `PalpiteRow`) não é coberta por
unit test por falta de jsdom no ambiente; fica para o e2e e verificação manual.
Adicionar jsdom/testing-library exigiria um ADR (nova dependência de teste) e
está fora de escopo deste spec.

## 8. Casos de borda (Feature B)

- **0 participantes no Só Brasil:** seção renderiza com disclaimer + empty state
  (não some mais).
- **Usuário deslogado em `/bolao`:** seção e disclaimer aparecem (informativos);
  bloco "Sua posição" continua condicionado a `user` (inalterado).
- **`/bolao/palpites` deslogado:** já há early-return com tela de login
  (`palpites/page.tsx:37-51`) — o callout não chega a renderizar. Sem mudança.

## 9. Fora de escopo (YAGNI)

- Opt-in / botão "entrar" no Só Brasil (palpites já contam automaticamente).
- Toast global / sistema de notificação — feedback é inline no `PalpiteRow`.
- Debounce do auto-save.
- jsdom/testing-library para testar componentes React (exigiria ADR).
- Correção do bug de FK `users`-ausente-no-Postgres (`23503` em shadow writes) —
  é pré-existente, cross-cutting e de baixo impacto funcional; **tarefa
  separada**.
- Qualquer mudança na camada de pontuação ou no cron de score.
