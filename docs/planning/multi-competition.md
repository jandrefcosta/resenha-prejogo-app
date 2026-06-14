# Planejamento: Suporte a Múltiplos Campeonatos

> ⚠️ **Documento histórico** — as fases 1–4 foram implementadas. Estado atual em [v2-multiplas-competicoes.md](v2-multiplas-competicoes.md) e [roadmap.md](roadmap.md).

**Contexto original:** A aplicação estava 100% hardcoded para o Campeonato Brasileiro Série A. Este documento mapeou tudo que precisaria mudar para suportar múltiplos campeonatos — Copa do Mundo, Libertadores, Copa do Brasil etc. — sem quebrar o que já existia.

---

## Decisão de arquitetura: página separada por campeonato

Após análise, a abordagem de **página dedicada por campeonato** foi escolhida em vez de um seletor na página existente.

**Por quê:**
- A Série A continua intocada em `src/app/page.tsx` — zero risco de regressão
- A Copa do Mundo tem estrutura tão diferente (seleções, fases em grupos, 64 jogos) que forçar nos componentes existentes criaria gambiarras
- Next.js App Router resolve isso com uma linha: `src/app/copa-2026/page.tsx`
- SEO próprio por campeonato (`/copa-2026` rankeia independentemente)
- Deploy incremental — Copa vai ao ar sem coordenação com a Série A

**O que é compartilhado:** `ThemeProvider`, `MatchCard`, `redisCache`, sistema de cache, Web Share API, `SuggestionModal`.

**O que é parametrizado** (mudanças retrocompatíveis nas libs): `getFixturesByClub()`, `getTeamForm()`, `getBroadcastersForFixture()`.

**O que é novo e isolado:** `src/app/copa-2026/`, `src/app/api/copa/`, `GroupStandingsModal`, `CopaMatchSection`.

---

## Decisão de UX: Cenário C — Brasil como padrão + seletor opcional

### Por que não seletor obrigatório (Cenário B)

Na Série A há 380 jogos — o filtro por clube é essencial. Na Copa do Mundo há 64 jogos — o torcedor brasileiro assiste a quase todos. Filtrar por seleção esconderia os outros jogos do grupo, que são fundamentais para entender a classificação ("se a Argentina empatar, o Brasil avança").

### Por que não tema único fixo (Cenário A)

Funciona, mas perde o gancho de personalização que é o diferencial da aplicação.

### Cenário C escolhido

- **Padrão automático:** verde/amarelo da Seleção Brasileira, Brasil destacado em todos os jogos
- **Seletor opcional discreto:** "Seguir outro país" — para argentinos no Brasil, torcedores mais analíticos
- **Todos os 64 jogos visíveis:** não filtra, apenas destaca os do país selecionado
- **Zero atrito:** 95%+ dos usuários (brasileiros) têm a experiência completa sem configurar nada

**MVP:** lançar sem o seletor opcional. Brasil fixo, verde/amarelo fixo. Seletor de países entra se houver demanda via feedback.

---

## Diagnóstico: o que está hardcoded hoje

| Arquivo | Valor fixo | Impacto |
|---------|-----------|---------|
| `src/lib/apiFootball.ts` | `LEAGUE_ID = 71` (Série A) | Só busca fixtures da Série A |
| `src/lib/apiFootball.ts` | `REDIS_CACHE_KEY = 'fixtures:serie-a'` | Cache amarrado a um campeonato |
| `src/lib/cbfApi.ts` | `CHAMPIONSHIP_ID = 1260611` | CBF só para a Série A atual |
| `src/lib/teamForm.ts` | `LEAGUE_ID = 71` | Form calculado só na Série A |
| `src/app/api/standings/route.ts` | `LEAGUE_ID = 71` | Tabela só da Série A |
| `src/app/api/players/route.ts` | `LEAGUE_ID = 71` | Stats só da Série A |
| `src/lib/broadcasterSearch.ts` | Prompt hardcoded "Brasileirão Série A" | Gemini busca só transmissões do Brasil |
| `src/components/RoundModal.tsx` | `"Brasileirão Série A"` no share text | Texto fixo independente do campeonato |
| `src/components/MatchCard.tsx` | `"Brasileirão ${year}"` no share text | Texto errado para outros campeonatos |
| `src/app/layout.tsx` | Metadata `"Futebol Brasileiro"` / `"Brasileirão"` | SEO limitado a futebol brasileiro |
| `src/data/clubs.json` | Sem campo `competitions` | Clube não sabe em qual campeonato joga |

---

## Fase 1 — Modelo de dados (sem impacto visual)

### 1.1 · Criar `src/data/competitions.ts`

Arquivo central com a definição de todos os campeonatos suportados:

```typescript
export interface Competition {
  id: string;                    // slug único: "serie-a", "world-cup-2026"
  name: string;                  // "Brasileirão Série A"
  shortName: string;             // "Série A"
  apiFootballLeagueId: number;   // 71 (Série A), 1 (World Cup)
  season: number;                // 2026
  cbfChampionshipId?: number;    // só para competições da CBF
  hasCbfData: boolean;           // se usa a CBF API para resultados
  scope: 'club' | 'national';    // "club" filtra por clube; "national" destaca por seleção
  matchWindowDays: number[];     // 3,4,5,6,0 = qua/qui/sex/sab/dom
  defaultHighlightTeamId?: number; // Cenário C: time destacado por padrão (ex: Brasil = 6)
}

export const COMPETITIONS: Competition[] = [
  {
    id: 'serie-a',
    name: 'Brasileirão Série A',
    shortName: 'Série A',
    apiFootballLeagueId: 71,
    season: 2026,
    cbfChampionshipId: 1260611,
    hasCbfData: true,
    scope: 'club',
    matchWindowDays: [3, 4, 5, 6, 0],
  },
  {
    id: 'world-cup-2026',
    name: 'Copa do Mundo 2026',
    shortName: 'Copa 2026',
    apiFootballLeagueId: 1,
    season: 2026,
    hasCbfData: false,
    scope: 'national',
    matchWindowDays: [0, 1, 2, 3, 4, 5, 6], // jogos todos os dias
    defaultHighlightTeamId: 6,               // Seleção Brasileira na API-Football
  },
];
```

**Impacto:** zero para o usuário, zero breaking change — apenas cria o arquivo.

---

### 1.2 · Adicionar campo `competitions` em `clubs.json`

Cada clube informa em quais campeonatos está inscrito:

```json
{
  "id": "flamengo",
  "name": "Flamengo",
  "competitions": ["serie-a", "libertadores"],
  ...
}
```

Para a Copa do Mundo, a Seleção Brasileira entra como entrada especial — ver [seção Copa do Mundo](#considerações-especiais-copa-do-mundo).

**Impacto:** campo opcional — leitura existente continua funcionando.

---

### 1.3 · Atualizar `ClubTheme` em `types.ts`

```typescript
interface ClubTheme {
  // campos existentes mantidos
  id: string;
  name: string;
  // ...
  competitions?: string[];  // IDs dos campeonatos (opcional)
}
```

---

## Fase 2 — Camada de dados (back-end)

### 2.1 · Parametrizar `getFixturesByClub()`

**Arquivo:** `src/lib/apiFootball.ts`

**Hoje:**
```typescript
const LEAGUE_ID = 71; // hardcoded
const REDIS_CACHE_KEY = 'fixtures:serie-a'; // hardcoded

export async function getFixturesByClub() { ... }
```

**Após:**
```typescript
export async function getFixturesByClub(competition: Competition) {
  const cacheKey = `fixtures:${competition.id}`;
  // usa competition.apiFootballLeagueId e competition.season
}
```

Manter wrapper retrocompatível:
```typescript
export const getSerieAFixtures = () =>
  getFixturesByClub(COMPETITIONS.find(c => c.id === 'serie-a')!);
```

**Chaves Redis impactadas:** `fixtures:serie-a` → `fixtures:{competition.id}`

---

### 2.2 · Parametrizar `teamForm` e `standings`

**Arquivos:** `src/lib/teamForm.ts`, `src/app/api/standings/route.ts`

Mesma estratégia: receber `leagueId` e `season` como parâmetros.

```typescript
// teamForm.ts
export async function getTeamForm(teamId: number, leagueId: number, season: number)

// standings/route.ts
const competition = COMPETITIONS.find(c => c.id === q.competition ?? 'serie-a');
```

---

### 2.3 · Criar abstração de "resultados passados"

A CBF API só existe para competições brasileiras. Para a Copa do Mundo, os resultados vêm da API-Football em formato diferente.

**Solução:** interface unificada com adapter por fonte:

```typescript
interface PastMatchResult {
  competition: string;
  round: number | string;   // "1" (Série A) ou "Group Stage - 1" (Copa)
  date: string;
  homeTeam: { name: string; goals: number | null };
  awayTeam: { name: string; goals: number | null };
  goals: GoalEvent[];
  cards: CardEvent[];
}

// Adapter CBF → PastMatchResult (já existe, só wrap)
// Adapter API-Football → PastMatchResult (novo, para Copa)
```

**Arquivo impactado:** `src/app/api/past-fixtures/route.ts` — receber `competition` e despachar para o adapter certo.

---

### 2.4 · Atualizar broadcaster search

**Arquivo:** `src/lib/broadcasterSearch.ts`

```typescript
export async function getBroadcastersForFixture(
  params: { home: string; away: string; date: string; round: number | string },
  competition: Competition  // novo parâmetro
)
```

Prompt dinâmico:
```
onde uma partida ESPECÍFICA da **${competition.name}** será transmitida...
```

**Chaves Redis:** sem mudança — `broadcasters:{fixtureId}` permanece (fixtureId é único na API-Football).

---

### 2.5 · TTL de standings competition-aware

```typescript
function getSmartTTL(competition: Competition): number {
  const day = new Date().getDay();
  return competition.matchWindowDays.includes(day) ? TTL_30MIN : TTL_3H;
}
```

---

## Fase 3 — API Endpoints

Parâmetro `?competition=<id>` opcional (default `serie-a`) — totalmente retrocompatível:

| Endpoint | Mudança |
|----------|---------|
| `GET /api/fixtures` | `?competition=world-cup-2026` |
| `GET /api/standings` | `?competition=world-cup-2026` |
| `GET /api/round` | `?competition=world-cup-2026` |
| `GET /api/past-fixtures` | `?competition=world-cup-2026` (dispatch para adapter certo) |
| Broadcasters | Resolvido internamente por `getBroadcastersForFixture`, sem endpoint público dedicado |

---

## Fase 4 — Página da Copa (nova, isolada)

### Estrutura de arquivos

```
src/app/copa-2026/
  page.tsx                  # página raiz — tema verde/amarelo, Brasil destacado
  layout.tsx                # metadata SEO específico da Copa do Mundo

src/app/api/copa/
  fixtures/route.ts         # GET fixtures Copa (leagueId=1, sem filtro por clube)
  standings/route.ts        # GET tabela por grupos (A–H, formato diferente)

src/components/copa/
  CopaMatchSection.tsx      # lista de jogos sem "Rodada Atual" numérica
  GroupStandingsModal.tsx   # 8 mini-tabelas por grupo
  CopaPhaseHeader.tsx       # cabeçalho "Fase de Grupos" / "Oitavas" / "Quartas"
  CountrySelector.tsx       # seletor opcional de seleção (pós-MVP)
```

### UX da página (Cenário C — MVP)

```
┌──────────────────────────────────────────┐
│  🇧🇷  Copa do Mundo 2026                 │
│  verde/amarelo fixo, sem seletor         │
├──────────────────────────────────────────┤
│  [Grupo A] [Grupo B] ... [Oitavas] ...  │  ← abas por fase
├──────────────────────────────────────────┤
│  Brasil × França          20h  Globo 🟡  │  ← destaque automático
│  Argentina × Alemanha     17h  SporTV    │
│  ...                                     │
└──────────────────────────────────────────┘
```

O Brasil é destacado via `defaultHighlightTeamId = 6` da `Competition`, não por escolha do usuário.

### UX pós-MVP (seletor opcional)

Botão discreto no header: **"Seguir outro país"** → abre seletor com as 32 seleções. Persiste em `localStorage` como `resenha-prejogo:copa-team`. Se ausente, usa Brasil.

---

## Considerações especiais: Copa do Mundo

### Seleções, não clubes

A Copa não usa `clubs.json`. A Seleção Brasileira entra como entrada especial:

```json
{
  "id": "selecao-brasileira",
  "name": "Seleção Brasileira",
  "shortName": "BRA",
  "competitions": ["world-cup-2026"],
  "apiFootballId": 6,
  "colors": { "primary": "#009C3B", "secondary": "#FFDF00", "accent": "#002776" },
  "textOnPrimary": "white"
}
```

Para o MVP (Brasil fixo), apenas essa entrada é necessária. O seletor opcional exigiria as 32 seleções — escopo pós-MVP.

### Sem dados CBF

`hasCbfData: false` — resultados passados vêm da API-Football via adapter (Fase 2.3).

### Formato de fases diferente

A Série A tem `"Round 1"`, `"Round 2"` etc. A Copa tem `"Group Stage - 1"`, `"Round of 16"`, `"Quarter-finals"`. O `CopaMatchSection` lida com esse formato — não herda a lógica de round numérico do `MatchSection` original.

### Standings por grupos

A Copa durante a fase de grupos retorna 8 tabelas (A–H) com 4 times cada. O `GroupStandingsModal` é um componente novo — o `StandingsModal` original (tabela única de 20 times) não é reutilizado.

---

## Prioridade de implementação

### Etapa 1 — Fundação (sem impacto visual)
1. Criar `competitions.ts` com modelo de dados + `defaultHighlightTeamId`
2. Adicionar campo `competitions` em `clubs.json`
3. Atualizar `ClubTheme` em `types.ts`

### Etapa 2 — Back-end parametrizado (retrocompatível)
4. Parametrizar `getFixturesByClub()`
5. Parametrizar `getTeamForm()` e `standings`
6. Criar interface `PastMatchResult` + adapter API-Football
7. Atualizar `getBroadcastersForFixture()` para receber competition

### Etapa 3 — API endpoints
8. Adicionar `?competition=` nos endpoints existentes

### Etapa 4 — Página Copa MVP
9. `src/app/copa-2026/page.tsx` + `layout.tsx` (tema fixo verde/amarelo)
10. `src/app/api/copa/fixtures/route.ts`
11. `CopaMatchSection` com destaque automático do Brasil
12. `GroupStandingsModal` para fase de grupos

### Etapa 5 — Pós-MVP (se houver demanda)
13. `CountrySelector` + persistência em localStorage
14. `CopaPhaseHeader` para oitavas/quartas/semis/final
15. 32 seleções em `clubs.json` (ou arquivo separado `national-teams.json`)

---

## O que NÃO precisa mudar

- `ThemeProvider` — já funciona com qualquer `ClubTheme`
- `MatchCard` — reusável com dados da Copa (times, horário, transmissão)
- `useFocusTrap`, `redisCache` — genéricos por natureza
- `SuggestionModal` — independente de campeonato
- Lógica de compartilhamento (Web Share API) — só o texto muda
- `cbfApi.ts` — continua para Série A; só recebe `championshipId` como parâmetro
- Sistema de cache Redis — estrutura permanece, chaves ganham prefixo de competition

---

## Estimativa de escopo

| Etapa | Complexidade | Arquivos principais |
|-------|-------------|---------------------|
| Etapa 1 (modelo) | Baixa | `competitions.ts`, `clubs.json`, `types.ts` |
| Etapa 2 (back-end) | Média | `apiFootball.ts`, `teamForm.ts`, `standings`, `past-fixtures`, `broadcasterSearch.ts` |
| Etapa 3 (endpoints) | Baixa | 4 route handlers |
| Etapa 4 (Copa MVP) | Média | `page.tsx`, `CopaMatchSection`, `GroupStandingsModal`, 1 route handler |
| Etapa 5 (pós-MVP) | Alta | `CountrySelector`, 32 seleções, fases eliminatórias |

As Etapas 1–4 entregam a Copa do Mundo funcional sem tocar na Série A.
A Etapa 5 adiciona personalização por seleção se a demanda justificar.
