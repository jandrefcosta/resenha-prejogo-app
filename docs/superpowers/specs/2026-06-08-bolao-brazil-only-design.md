# Bolão "Só Brasil" — Design

> Status: **approved** · Data: 2026-06-08 · Autor: João André + Claude

## 1. Objetivo

Criar um modo de jogo paralelo no bolão da Copa do Mundo 2026: um **ranking
único e público "Só Brasil"** que pontua **apenas os jogos da Seleção
Brasileira**, ao longo de **toda a campanha** (fase de grupos + mata-mata),
reaproveitando os palpites que o usuário já faz. Não há grupos privados
"Só Brasil" — é um único leaderboard global paralelo ao ranking global atual.

## 2. Contexto do que já existe

- **Palpites são globais por usuário+jogo** (`palpite:{userId}:{fixtureId}`),
  não por bolão. Um palpite é feito uma vez e serve a todos os rankings.
- **Ranking global** (`bolao:global:ranking`) e **bolões privados**
  (`bolao:{id}:ranking`) recebem os **mesmos** pontos via fan-out: hoje todos
  os bolões de um usuário têm pontuação idêntica, diferindo só na membership.
- **Cron de score** (`POST /api/bolao/score`) pontua **apenas
  `copa.phases['Grupos']`** (48 jogos). Mata-mata é pendência manual.
- **Pontuação** (`calcPts` em `src/lib/bolaoRedis.ts`): placar exato = 10pts,
  resultado correto = 5pts, erro = 0pts. Idempotência via
  `score:{userId}:{fixtureId}` com `set ... {nx:true}`.
- **Dual-write Postgres** (Drizzle): toda escrita de bolão espelha em Postgres
  (`scores`, `globalRankings`, `bolaoRankings`) — Postgres primário, Redis cache.
- **Identidade do Brasil**: `brazilTeamId = 6` (API-Football), já presente em
  `CopaFixturesPayload.brazilTeamId` e em
  `competitions.ts → world-cup-2026.defaultHighlightTeamId`.

## 3. Decisões tomadas (brainstorming)

| Decisão | Escolha |
|---|---|
| Modelo | **Modo de jogo paralelo único** — um ranking global "Só Brasil", sem grupos privados |
| Escopo de jogos | **Toda a campanha do Brasil** — grupos + todos os mata-matas |
| Superfície UX | **Ranking extra em `/bolao`** + seção "Mata-mata do Brasil" na tela de palpites existente |
| Pênaltis (mata-mata) | **Híbrido**: placar exato do tempo normal/prorrogação = 10pts; se errou placar mas acertou **quem classificou**, ganha 5pts de "resultado correto" |
| Postgres | **Espelhar** o ranking Brasil no Postgres, consistente com o padrão atual |

## 4. Arquitetura

### 4.1 Diagrama de Venn da pontuação

- **Ranking Global** = soma dos **48 jogos de grupo** (inalterado).
- **Ranking Só Brasil** = soma dos **jogos do Brasil em todas as fases**
  (3 de grupo + mata-matas).
- Sobreposição: os **3 jogos de grupo do Brasil**. O mesmo palpite alimenta os
  dois leaderboards de forma independente. Correto por design.

### 4.2 Novas chaves Redis

```
bolao:brazil:ranking          → ZSet<member=userId, score=pts>   (NOVO)
brscore:{userId}:{fixtureId}  → marcador de idempotência         (NOVO)
```

`brscore:` é um **namespace de idempotência separado** de `score:`. Motivo: um
jogo de grupo do Brasil precisa contar nos **dois** rankings a partir do mesmo
palpite. Idempotências independentes garantem que cada ranking conte o jogo
exatamente uma vez, sem interferência mútua. O cron pode rodar N vezes sem
duplicar.

### 4.3 Nova tabela Postgres

```ts
export const brazilRankings = pgTable('brazil_rankings', {
  userId:      text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  totalPoints: integer('total_points').notNull().default(0),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('idx_brazil_rankings_points').on(t.totalPoints),
]);
```

Os **scores** dos jogos do Brasil reusam a tabela `scores` existente (chave
`{userId, fixtureId}` já é única por jogo; um jogo de grupo do Brasil já é
gravado lá pelo passo 1 do cron — o passo 2 não regrava, só lê). Para jogos de
**mata-mata** do Brasil, o passo 2 grava em `scores` com `onConflictDoNothing`.

> Decisão de implementação: a idempotência Redis do passo 2 é `brscore:`; o
> espelho Postgres usa `scores` (onConflictDoNothing) — os dois convergem.

> **Postgres NÃO é autoritativo neste caminho.** A fonte de verdade da
> idempotência é o `brscore:` (Redis); as escritas em `scores`/`brazil_rankings`
> são fire-and-forget (`.catch(log)`, igual ao passo 1 em `score/route.ts:99`). Se
> uma escrita Postgres falhar **depois** de `brscore:` ter sido gravado, o rerun
> pula (chave existe) e aquela linha de mata-mata fica **permanentemente ausente
> do Postgres**. Isso contraria o "Postgres primário" do CLAUDE.md, mas é o
> comportamento **já existente** do passo 1 que o passo 2 herda — não é uma falha
> nova. Consequência prática: não trate `brazil_rankings` como fonte de verdade;
> o ZSet `bolao:brazil:ranking` é quem manda. Reconciliação PG↔Redis (se desejada)
> fica fora de escopo, consistente com o ranking global de hoje.

### 4.4 Carregar dados de pênaltis / classificado

`mapFixture` em `src/app/api/copa/fixtures/route.ts` hoje **descarta** o campo
`teams.{home,away}.winner` e não lê `score.penalty`. Para o scoring híbrido de
mata-mata, estender o mapeamento para carregar:

- `advancedTeamId: string | null` — o time que avançou (de `teams.X.winner === true`),
  preenchido **apenas quando `!GROUP_ROUNDS.has(round)`** (mata-mata) e o jogo está
  finalizado. **O gate é obrigatório, não cosmético:** sem ele, um jogo de grupo
  vencido teria `winner` populado e `advancedTeamId` definido; hoje só não quebra
  porque empate de grupo tem `winner === null` — uma invariante do upstream, não
  do nosso código. Gatear explicitamente torna a separação grupo/mata-mata robusta.
- (opcional p/ exibição) `penalty: { home, away } | null` de `score.penalty`.

> **Contrato externo (testar):** o scoring híbrido assume que `f.goals.{home,away}`
> de um jogo `PEN` é o placar do tempo normal/prorrogação (um **empate**), e que o
> shootout vive em `score.penalty`. Se o upstream algum dia devolver o placar
> pós-pênaltis em `goals`, `match.home !== match.away` e o ramo híbrido nunca
> dispara — palpites de classificado correto silenciosamente valeriam 0. Cobrir
> com teste sobre um fixture `PEN` real.

`Match` (`src/lib/types.ts`) já tem `scoreDetail` para CONMEBOL; adicionar um
campo enxuto `advancedTeamId?: string` reaproveitável, ou colocar dentro de
`scoreDetail`. Decisão: campo top-level `advancedTeamId?: string` no `Match`
(mais simples de consumir no `calcPts`).

## 5. Camada de pontuação

### 5.1 `calcPtsKnockout` (nova) em `bolaoRedis.ts`

```ts
export function calcPtsBrazil(
  palpite: { home: number; away: number },
  match: { home: number; away: number; advancedTeamId?: string; homeId: string; awayId: string },
): { pts: number; outcome: Score['outcome'] } {
  // Placar exato sempre vale 10, em qualquer fase
  if (palpite.home === match.home && palpite.away === match.away) {
    return { pts: 10, outcome: 'exact' };
  }
  const base = calcPts(palpite, { home: match.home, away: match.away });
  if (base.pts > 0) return base; // acertou resultado em campo

  // Híbrido: empate em campo decidido nos pênaltis num mata-mata.
  // Se o palpite previu vitória do time que de fato classificou, dá 5pts.
  if (match.advancedTeamId && match.home === match.away) {
    const palpitouHomeWin = palpite.home > palpite.away;
    const palpitouAwayWin = palpite.away > palpite.home;
    const homeAdvanced = match.advancedTeamId === match.homeId;
    const awayAdvanced = match.advancedTeamId === match.awayId;
    if ((palpitouHomeWin && homeAdvanced) || (palpitouAwayWin && awayAdvanced)) {
      return { pts: 5, outcome: 'correct' };
    }
  }
  return { pts: 0, outcome: 'miss' };
}
```

> Jogos de **grupo** do Brasil continuam usando `calcPts` puro (não há
> classificado/pênaltis em grupo). `calcPtsBrazil` colapsa para `calcPts` quando
> `advancedTeamId` é ausente.

**Decisões de regra a confirmar (interações intencionais):**

1. **Placar exato de empate ignora o classificado.** `calcPtsBrazil` retorna 10
   no placar exato *antes* de olhar quem avançou. Quem palpita `1-1` num jogo que
   termina `1-1` (Brasil eliminado nos pênaltis) leva 10 — mais que quem acertou o
   classificado mas errou o placar (5). Coerente com "placar exato sempre vale 10",
   mas é uma decisão de produto: confirmado para mata-mata.
2. **"Placar exato" inclui a prorrogação.** O `f.goals` de um jogo `AET` é o placar
   **pós-prorrogação**. Quem acertou o resultado dos 90' (`1-1`) num jogo decidido
   `2-1` na prorrogação leva **0**, porque o placar gravado é `2-1`. O ponto de
   *resultado* ainda funciona (palpitou vitória do Brasil → Brasil venceu na
   prorrogação → 5 via `calcPts`); só a semântica de "exato" surpreende. Definição
   adotada: **o palpite é o placar final, incluindo prorrogação.**

### 5.2 Helpers novos em `bolaoRedis.ts`

```ts
export async function ensureBrazilParticipant(userId: string): Promise<void> {
  await redis.zadd('bolao:brazil:ranking', { nx: true }, { score: 0, member: userId });
  // shadow Postgres: insert brazilRankings (userId, 0) onConflictDoNothing
}

export function isBrazilMatch(m: { homeTeam: { id: string }; awayTeam: { id: string } }): boolean {
  return m.homeTeam.id === '6' || m.awayTeam.id === '6'; // brazilTeamId
}
```

`getRanking` / `getUserRankPosition` / `getUserScore` já são genéricos por
`key` — reutilizados com `'bolao:brazil:ranking'` sem alteração.

## 6. Cron de score — passo 2 (novo)

Em `POST /api/bolao/score`, após o passo 1 (grupos, inalterado), adicionar:

```
// Passo 2 — Ranking Só Brasil (todas as fases)
const allMatches = Object.values(copa.phases).flat();
const brazilFinished = allMatches.filter(m =>
  isBrazilMatch(m) && m.status === 'finished' &&
  m.score?.home != null && m.score?.away != null
);

for (const match of brazilFinished) {
  const isKnockout = match.competitionPhase !== 'Grupos';
  const isDraw = match.score.home === match.score.away;
  // GUARD anti-freeze: um jogo de mata-mata empatado é decidido nos pênaltis e
  // depende de `advancedTeamId` (derivado de `winner`). O status vira `finished`
  // (PEN) possivelmente ANTES de `winner` ser populado. Pontuar agora gravaria
  // brscore: com pts=0 para quem acertou o classificado, e o `nx` congelaria esse
  // 0 para sempre. Então: se mata-mata + empate + sem advancedTeamId → PULAR sem
  // gravar brscore:, deixando o próximo cron pontuar quando `winner` chegar.
  if (isKnockout && isDraw && !match.advancedTeamId) continue;

  for (const userId of await getFixtureParticipants(match.id)) {
    // Curto-circuito ANTES do getPalpite: evita reler o palpite de todo
    // participante já pontuado a cada execução do cron (jogo popular = milhares
    // de GETs/run inúteis). `exists` é barato; só lê o palpite se for pontuar.
    if (await redis.exists(`brscore:${userId}:${match.id}`)) continue;

    const palpite = await getPalpite(userId, match.id);
    if (!palpite) continue;
    const { pts, outcome } = calcPtsBrazil(palpite, {
      home: match.score.home, away: match.score.away,
      advancedTeamId: match.advancedTeamId,
      homeId: match.homeTeam.id, awayId: match.awayTeam.id,
    });
    const scored = await redis.set(`brscore:${userId}:${match.id}`, { pts, outcome }, { nx: true });
    if (scored === null) continue; // corrida: pontuado entre o exists e o set
    await redis.zincrby('bolao:brazil:ranking', pts, userId);
    // shadow Postgres: brazilRankings upsert (+pts via sql increment, como
    // globalRankings) + scores onConflictDoNothing
  }
}
```

O retorno do cron ganha `brazilProcessed` / `brazilSkipped` para observabilidade.

**Importante:** o passo 2 é **independente** do passo 1. Não toca em
`bolao:global:ranking` nem em bolões privados — logo, o mata-mata do Brasil
**não** vaza para o ranking global (que segue grupos-only, como hoje).

## 7. Palpites do mata-mata

`/bolao/palpites` ganha uma seção **"Mata-mata do Brasil"** abaixo das Rodadas:

- Lista jogos das fases de knockout (`PHASE_ORDER` exceto `'Grupos'`) filtrados
  por `isBrazilMatch`, ordenados por data.
- Reusa o mesmo componente de input de palpite e o endpoint
  `PUT /api/palpites/[fixtureId]` (sem alteração — já valida kickoff/lock).
- Vazia até o Brasil se classificar — render condicional, sem custo visual.

A rota `PUT /api/palpites/[fixtureId]` já tem o `match`: trocar
`ensureGlobalParticipant` por uma chamada que **também** semeia o ranking Brasil
quando `isBrazilMatch(match)` for verdadeiro (`ensureBrazilParticipant`).

## 8. UI — `/bolao/page.tsx` e endpoint

- Nova `<section>` **"🇧🇷 Só Brasil"** entre "Ranking Global" e o CTA de
  palpites: top 5 (`RankingTable`, reusado) + bloco "Sua posição: Nº — pts" no
  mesmo padrão do bloco azul existente. Mostra contagem de participantes
  (`zcard bolao:brazil:ranking`).
- Novo endpoint `GET /api/bolao/brazil` — cópia de `GET /api/bolao/global`
  trocando a key para `'bolao:brazil:ranking'`.

## 9. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/lib/db/schema.ts` | + tabela `brazilRankings` + tipos inferidos |
| `drizzle` migration | + `brazil_rankings` |
| `src/lib/types.ts` | + `advancedTeamId?: string` no `Match` |
| `src/app/api/copa/fixtures/route.ts` | `mapFixture` carrega `advancedTeamId` (+`penalty` opcional) |
| `src/lib/bolaoRedis.ts` | + `calcPtsBrazil`, `ensureBrazilParticipant`, `isBrazilMatch` |
| `src/app/api/bolao/score/route.ts` | + passo 2 (ranking Brasil) + métricas no retorno |
| `src/app/api/palpites/[fixtureId]/route.ts` | semeia `ensureBrazilParticipant` em jogo do Brasil |
| `src/app/api/bolao/brazil/route.ts` | NOVO — espelha `/api/bolao/global` |
| `src/app/bolao/page.tsx` | + seção "Só Brasil" |
| `src/app/bolao/palpites/page.tsx` + componente | + seção "Mata-mata do Brasil" |

## 10. Casos de borda

- **Brasil eliminado na fase de grupos**: ranking Brasil simplesmente para de
  receber jogos novos; nada quebra. Seção de mata-mata fica vazia.
- **Jogo de mata-mata adiado/`PST`**: tratado como `scheduled` pelo `mapFixture`
  atual; não entra em `brazilFinished`.
- **Brasil avança sem jogar (W.O.)**: improvável na Copa; ignorado.
- **Idempotência**: cron roda a cada X min; `brscore:` garante 1 contagem por
  jogo. Segura reruns e reprocessamentos.
- **Usuário que nunca palpitou jogo do Brasil**: não aparece no ranking Brasil
  (não é semeado). Correto.
- **Backfill no primeiro deploy** (intencional e seguro): como `brscore:` é um
  namespace novo (vazio), a primeira execução do passo 2 pontua **todos** os jogos
  de grupo do Brasil já encerrados a partir dos palpites existentes — usuários que
  já palpitaram recebem seu ranking Brasil retroativamente. `brscore:` garante que
  reruns seguintes não dupliquem.
- **`ensureBrazilParticipant` é cosmético, não load-bearing**: `zincrby` cria o
  membro se ausente, então a correção da pontuação **não** depende do seeding. O
  seed só serve para exibir usuários com 0 pts antes de qualquer jogo do Brasil
  terminar. Implicação: se o seeding for adiado/omitido, o ranking continua
  correto — só não mostra participantes zerados.

## 11. Testes (caminhos de erro inclusive)

- `calcPtsBrazil`: placar exato (10) · resultado correto em campo (5) · empate
  em campo + acertou classificado nos pênaltis (5) · empate em campo + errou
  classificado (0) · sem `advancedTeamId` colapsa para `calcPts`.
- `isBrazilMatch`: home=Brasil, away=Brasil, nenhum.
- **Gate de fase**: jogo de grupo finalizado (mesmo com `winner`) → `advancedTeamId`
  ausente → `calcPtsBrazil === calcPts`.
- **Contrato PEN**: fixture `PEN` real → `goals` é empate, shootout em
  `score.penalty` → ramo híbrido dispara.
- Cron passo 2: idempotência (rerun não duplica) · jogo de grupo do Brasil conta
  no ranking Brasil E no global · mata-mata do Brasil conta **só** no Brasil.
- **Guard anti-freeze**: mata-mata empatado finalizado **sem** `advancedTeamId` →
  cron PULA sem gravar `brscore:` (rerun com `winner` populado pontua) · com
  `advancedTeamId` presente → pontua e congela corretamente.
- **Curto-circuito**: participante já com `brscore:` não chama `getPalpite`.

## 12. Fora de escopo (YAGNI)

- Grupos privados "Só Brasil".
- Estender o ranking **global** para mata-matas (segue grupos-only).
- Pontuação especial para placar agregado de ida/volta (Copa é jogo único).
- Notificações/push do ranking Brasil.
