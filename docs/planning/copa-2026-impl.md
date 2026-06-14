# Plano de Implementação — Página Copa do Mundo 2026

> Documento de implementação — Resenha Pré-Jogo  
> Criado: abril 2026  
> Status: **✅ Implementado**

---

## Estado atual — implementado

Todas as etapas abaixo foram concluídas. O arquivo mantém o registro histórico das decisões de design e dados de API confirmados.

### Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `src/app/copa-2026/page.tsx` | Página principal — Server Component |
| `src/app/copa-2026/layout.tsx` | Metadata SEO Copa |
| `src/app/api/copa/fixtures/route.ts` | GET todos os jogos da Copa |
| `src/app/api/copa/standings/route.ts` | GET classificação grupos A–L |
| `src/components/copa/CopaMatchSection.tsx` | Lista de jogos por fase |
| `src/components/copa/GroupStandingsModal.tsx` | 12 mini-tabelas (A–L) |
| `src/components/copa/CopaPhaseHeader.tsx` | Label de fase em pt-BR |
| `src/components/copa/CopaMatchRow.tsx` | Card de jogo simplificado |
| `src/components/copa/CopaThemeApplier.tsx` | Aplica tema verde/amarelo |
| `src/components/copa/BrazilCountdown.tsx` | Countdown para estreia do Brasil |
| `src/data/national-teams.ts` | ClubTheme da Seleção Brasileira |

### Pendente (pós-MVP)

- Link de descoberta na página da Série A (banner ou nav header)
- `CountrySelector` — "Seguir outro país" via `localStorage`
- 32 seleções em `national-teams.ts`
- Bracket visual para fases eliminatórias

---

## Contexto histórico e decisões de design

A Fase 0 (fundação) estava **100% completa** quando este plano foi escrito. O que existia e foi reusado:

| Recurso | Arquivo | Relevância |
|---------|---------|------------|
| `Competition` interface + `world-cup-2026` definida | `src/data/competitions.ts` | `leagueId=1`, `scope='national'`, `defaultHighlightTeamId=6` |
| `Match` com `leagueId`, `competitionName`, `competitionPhase` | `src/lib/types.ts` | A Copa retorna esses campos da API-Football |
| `getFixturesByClub()` parametrizado | `src/lib/apiFootball.ts` | Precisa de variante `getFixturesByCopa()` — sem filtro por clube |
| `matchDataSource.ts` com roteamento CBF vs API-Football | `src/lib/matchDataSource.ts` | Copa usa sempre API-Football |
| `broadcasterSearch.ts` com `competitionName` no prompt | `src/lib/broadcasterSearch.ts` | Funciona sem mudança |
| Redis cache por `competition.id` | `src/lib/redisCache.ts` | Chave será `fixtures:world-cup-2026` |
| `MatchCard` | `src/components/MatchCard.tsx` | Reusável — aceita qualquer `Match` |
| `ThemeProvider` | `src/components/ThemeProvider.tsx` | Recebe `ClubTheme` — basta criar tema verde/amarelo |

A **página `/copa-2026` não existe** — nenhum arquivo em `src/app/copa-2026/`.

---

## Decisões de design (consolidadas dos docs anteriores)

### UX MVP — Cenário C fixo
- Tema verde/amarelo da Seleção Brasileira **fixo** (sem `ClubSelector`)
- **Todos os 64 jogos visíveis** — não filtra, destaca jogos do Brasil
- Brasil destacado via `defaultHighlightTeamId = 6` da `Competition`
- Navegação por **fase**: Fase de Grupos → Oitavas → Quartas → Semis → Final
- `GroupStandingsModal` com 8 mini-tabelas (A–H × 4 times) — componente novo
- Seletor "Seguir outro país" é **pós-MVP**

### O que NÃO é Copa — Série A continua intacta
A página `src/app/page.tsx` (Série A) não é tocada. Isolamento total.

---

## Etapas de implementação

### Etapa 1 — API endpoint de fixtures da Copa
**Objetivo:** endpoint dedicado que retorna todos os jogos da Copa (sem filtro por clube).

**Arquivo a criar:** `src/app/api/copa/fixtures/route.ts`

```
GET /api/copa/fixtures?phase=group        → jogos da fase de grupos
GET /api/copa/fixtures?phase=knockout     → jogos das fases eliminatórias
GET /api/copa/fixtures                    → todos os jogos
```

**Lógica:**
- Usa `apiFootball.ts` com `leagueId=1, season=2026`
- **Sem** o filtro por `clubApiFootballId` — todos os 32 países
- Agrupa jogos por fase (`competitionPhase`): `"Group Stage"`, `"Round of 16"`, `"Quarter-finals"`, `"Semi-finals"`, `"Final"`
- Cache Redis: `copa-fixtures:all` — TTL 1h (durante grupos), 30min (fases eliminatórias)
- Resposta: `{ phases: { [phase: string]: Match[] } }`

**Dependência:** verificar como `getFixturesByClub()` em `apiFootball.ts` está estruturado — provavelmente precisará de uma função nova `getCopaFixtures()` sem o filtro por time.

---

### Etapa 2 — API endpoint de standings da Copa (grupos)
**Objetivo:** retornar classificação dos 8 grupos (A–H) durante a fase de grupos.

**Arquivo a criar:** `src/app/api/copa/standings/route.ts`

```
GET /api/copa/standings → {
  groups: { A: StandingEntry[], B: ..., ..., L: [] },  // 12 grupos (A–L)
  thirdPlaceRanking: StandingEntry[]  // os melhores terceiros (4 se classificam)
}
```

**Lógica:**
- API-Football `/standings?league=1&season=2026` retorna **13 arrays**: 12 grupos (A–L) + "Ranking of third-placed teams"
- Separar o grupo virtual do índice 12 (`group[0].group === "Ranking of third-placed teams"`) em campo próprio `thirdPlaceRanking`
- Mapear os 12 grupos reais para `Record<string, StandingEntry[]>` usando `t.group` como chave
- Cada grupo tem **4 times** — mapear para `StandingEntry[]` (tipo já existe em `types.ts`)
- Cache Redis: `copa-standings:groups:2026` — TTL 30min durante jogos (junho), 3h fora
- Reusa a lógica de TTL inteligente do `standings/route.ts` existente; Copa joga todos os dias durante grupos

---

### Etapa 3 — Tema verde/amarelo (ClubTheme da Seleção Brasileira)
**Objetivo:** criar o `ClubTheme` da Seleção para alimentar o `ThemeProvider`.

**Arquivo a criar/editar:** `src/data/national-teams.ts` (novo, separado de `clubs.json`)

```typescript
export const SELECAO_BRASILEIRA: ClubTheme = {
  id: 'selecao-brasileira',
  name: 'Seleção Brasileira',
  shortName: 'Brasil',
  city: '',
  state: '',
  stadium: '',
  apiFootballId: 6,
  cbfId: undefined,
  conmebolId: null,
  colors: {
    primary: '#009C3B',    // verde
    secondary: '#FFDF00',  // amarelo
    accent: '#002776',     // azul
  },
  textOnPrimary: 'white',
};
```

Sem mudança no `ThemeProvider` — já aceita qualquer `ClubTheme`.

---

### Etapa 4 — Componentes Copa

#### 4.1 `CopaMatchSection.tsx`
**Arquivo:** `src/components/copa/CopaMatchSection.tsx`

Variante do `MatchSection` existente, adaptada para a Copa:
- Recebe `phases: { [phase: string]: Match[] }` em vez de `upcoming/finished`
- Agrupa por `match.round` (ex: `"Group Stage - 1"`) — traduzido via `CopaPhaseHeader`
- Tabs de navegação por fase: `[Grupos] [Oitavas] [Quartas] [Semis] [Final]` (fases de grupos colapsadas em uma tab única)
- Não exibe "Rodada X" numérica — exibe nome da fase traduzido e data
- Jogo do Brasil recebe destaque visual (borda ou badge `🇧🇷`)
- Reusa `MatchCard` sem modificação — passa `match` como está
- Botão "Ver Classificação dos Grupos" → abre `GroupStandingsModal`

**Props:**
```typescript
interface CopaMatchSectionProps {
  phases: Record<string, Match[]>;
  highlightTeamId: number;  // 6 = Brasil
  theme: ClubTheme;
}
```

#### 4.2 `GroupStandingsModal.tsx`
**Arquivo:** `src/components/copa/GroupStandingsModal.tsx`

Modal com **12 mini-tabelas (A–L)** — **componente completamente novo**, não herda `StandingsModal`.  
> Copa 2026 tem 48 seleções em 12 grupos, não 8 como em edições anteriores.

Layout:
```
┌─ Classificação dos Grupos ──────────────────────────────────┐
│  [A][B][C][D][E][F][G][H][I][J][K][L]  ← scroll horizontal  │
├──────────────────────────────────────────────────────┤
│  #  País        J  V  E  D  GP GC Pts               │
│  1  Brasil      3  2  1  0  5  2   7  ●              │
│  2  França      3  2  0  1  6  3   6                 │
│  3  ...                                              │
│  4  ...                                              │
└──────────────────────────────────────────────────────┘
```

- Tab ativa padrão: **Grupo C** (contém o Brasil — confirmado via API)
- Times classificados: **top 2 de cada grupo** + **4 melhores terceiros** (formato Copa 2026 com 12 grupos)
- `description = "Promotion - World Cup (Play Offs)"` indica classificados pela API
- Filtrar o grupo virtual "Ranking of third-placed teams" (índice 12) da exibição de tabs — mostrar como nota ou seção separada
- Reusa `useScrollLock` e padrão de modal existente

**Props:**
```typescript
interface GroupStandingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups: Record<string, StandingEntry[]>;  // A–H
  highlightTeamId: number;  // 6 = Brasil
}
```

#### 4.3 `CopaPhaseHeader.tsx`
**Arquivo:** `src/components/copa/CopaPhaseHeader.tsx`

Cabeçalho simples de fase — traduz o `competitionPhase` da API para pt-BR:

```typescript
// league.round values confirmados via API-Football (Copa 2022 + 2026)
const PHASE_LABELS: Record<string, string> = {
  'Group Stage - 1': 'Fase de Grupos — Rodada 1',
  'Group Stage - 2': 'Fase de Grupos — Rodada 2',
  'Group Stage - 3': 'Fase de Grupos — Rodada 3',
  'Round of 16':     'Oitavas de Final',
  'Quarter-finals':  'Quartas de Final',
  'Semi-finals':     'Semifinais',
  '3rd Place Final': 'Disputa de 3º Lugar',
  'Final':           'Final',
};

// Para a tab "Grupos" na CopaMatchSection, colapsar todas as 3 rodadas:
const GROUP_ROUNDS = new Set(['Group Stage - 1', 'Group Stage - 2', 'Group Stage - 3']);
```

---

### Etapa 5 — Página principal da Copa
**Arquivo:** `src/app/copa-2026/page.tsx`  
**Arquivo:** `src/app/copa-2026/layout.tsx`

#### `layout.tsx` — SEO dedicado
```typescript
export const metadata = {
  title: 'Copa do Mundo 2026 — Resenha Pré-Jogo',
  description: 'Todos os jogos da Copa do Mundo 2026. Horários, onde assistir e classificação dos grupos.',
  openGraph: { ... }
};
```

#### `page.tsx` — estrutura MVP
```
ThemeProvider (tema SELECAO_BRASILEIRA)
└── Header "🇧🇷 Copa do Mundo 2026"
└── CopaMatchSection
    ├── fetch /api/copa/fixtures
    └── botão → GroupStandingsModal
        └── fetch /api/copa/standings
```

**Sem `ClubSelector`** — tema e destaque são fixos.  
**Sem `OnboardingModal`** — Copa não tem fluxo de onboarding por clube.  
**Com `SuggestionModal`** — reusado sem mudança.

---

### Etapa 6 — Navegação e descoberta
**Objetivo:** usuário que acessa `/` (Série A) consegue chegar em `/copa-2026`.

**Opções (escolher uma):**
- **A (MVP simples):** banner fixo no topo da página Série A — "Copa do Mundo 2026 começa em junho → Ver calendário"
- **B (nav header):** adicionar link de navegação no header existente
- **C (sem cross-link):** usuário acessa `/copa-2026` diretamente via compartilhamento/SEO

**Recomendação MVP:** Opção A — banner temporário na Série A, removível pós-Copa.

---

## Arquivos a criar (resumo)

```
src/app/copa-2026/
  layout.tsx                          ← SEO, metadata
  page.tsx                            ← página principal (Server Component)

src/app/api/copa/
  fixtures/route.ts                   ← GET todos os jogos da Copa
  standings/route.ts                  ← GET classificação por grupos

src/components/copa/
  CopaMatchSection.tsx                ← lista de jogos por fase
  GroupStandingsModal.tsx             ← 8 mini-tabelas A–H
  CopaPhaseHeader.tsx                 ← label de fase em pt-BR

src/data/
  national-teams.ts                   ← ClubTheme da Seleção Brasileira
```

**Total: 8 arquivos novos.** Nenhum arquivo existente é modificado no MVP.

---

## Arquivos existentes que serão lidos (mas não modificados)

| Arquivo | Por quê |
|---------|---------|
| `src/lib/apiFootball.ts` | Entender `getFixturesByClub()` para criar `getCopaFixtures()` |
| `src/app/api/standings/route.ts` | Copiar padrão de TTL inteligente |
| `src/components/MatchSection.tsx` | Referência para `CopaMatchSection` |
| `src/components/StandingsModal.tsx` | Referência para `GroupStandingsModal` |
| `src/components/MatchCard.tsx` | Confirmar que aceita `Match` sem adaptação |

---

## Dados confirmados via API-Football (chamadas reais em abril 2026)

### Fixtures

- `leagueId=1`, `season=2026` ✅ — retorna dados reais
- **72 jogos** no total (48 grupos + 16 oitavas + 8 quartas + 4 semis + 3rd place + final)
  - Hoje disponíveis: apenas os 72 da fase de grupos (3 rodadas × 24 jogos)
  - Fases eliminatórias ainda sem data confirmada → rounds não disponíveis ainda
- Campo de fase: `league.round` — ex: `"Group Stage - 1"`, `"Round of 16"`, `"Quarter-finals"`, `"Semi-finals"`, `"3rd Place Final"`, `"Final"` (confirmado via Copa 2022)
- **Não há campo `competitionPhase`** na resposta — usar `league.round` diretamente
- `fixture.status.short = "NS"` para jogos futuros (mesma convenção da Série A)
- Estrutura de um fixture: `{ fixture, league, teams, goals, score }` — `score` tem breakdown por período

### Brasil e grupos

- **Brasil = `teamId=6`** ✅ confirmado (aparece em Round of 16 Copa 2022 e nos fixtures 2026)
- **Brasil está no Grupo C** da Copa 2026 (junto com Scotland, Haiti, Morocco)
- Jogos do Brasil (Grupo C):
  - `2026-06-13` Brazil × Morocco (casa)
  - `2026-06-20` Brazil × Haiti (casa)
  - `2026-06-24` Scotland × Brazil (fora)

### Standings / Grupos

- API retorna **13 grupos** para a Copa 2026 (A–L + "Ranking of third-placed teams")
- **A Copa 2026 tem 48 seleções e 12 grupos reais (A–L)**, não 8 como em edições anteriores
- Estrutura: `standings[N][teamIdx].group = "Group A"` (campo `group` em cada entrada)
- `description` indica status: `"Promotion - World Cup (Play Offs)"` (classificados) ou `null`
- Brasil no Grupo C: `{ rank: 2, group: "Group C", team: "Brazil", id: 6 }`

### Rounds disponíveis (2026)

```
"Group Stage - 1"   → 24 jogos ✅
"Group Stage - 2"   → 24 jogos ✅
"Group Stage - 3"   → 24 jogos ✅
"Round of 16"       → ainda não disponível (Copa começa em junho)
"Quarter-finals"    → ainda não disponível
"Semi-finals"       → ainda não disponível
"3rd Place Final"   → ainda não disponível
"Final"             → ainda não disponível
```

### Impactos no plano

1. **`GroupStandingsModal` precisa suportar grupos A–L (12 grupos), não A–H (8)** — Copa 2026 tem formato expandido com 48 seleções
2. **Não existe campo `competitionPhase`** — a fase vem de `league.round`; o `mapFixture` em `apiFootball.ts` precisa popular `competitionPhase` a partir do `round`
3. **"Ranking of third-placed teams"** é o 13º grupo retornado pela API — filtrar da exibição no MVP ou mostrar como grupo especial pós-fase de grupos
4. **As fases eliminatórias** só estarão disponíveis na API a partir de quando a Copa começar; a página deve degradar graciosamente (mostrar apenas grupos até lá)

---

## Ordem de execução recomendada

```
1. Confirmar formato da API-Football para Copa (debug call)
2. Etapa 1 — /api/copa/fixtures/route.ts
3. Etapa 2 — /api/copa/standings/route.ts
4. Etapa 3 — national-teams.ts (ClubTheme da Seleção)
5. Etapa 4.2 — GroupStandingsModal (independente de page.tsx)
6. Etapa 4.1 — CopaMatchSection (depende de MatchCard existente)
7. Etapa 4.3 — CopaPhaseHeader (pequeno, pode ser inline em CopaMatchSection)
8. Etapa 5 — page.tsx + layout.tsx (integra tudo)
9. Etapa 6 — link de descoberta na página da Série A
```

---

## O que NÃO entra no MVP (pós-Copa ou pós-demanda)

- `CountrySelector` — "Seguir outro país" via `localStorage`
- 32 seleções em `national-teams.ts` — só Brasil no MVP
- Fases eliminatórias interativas (bracket visual)
- Integração com Bolão (Fase 3 do roadmap)
- Push notifications de início de jogo

---

*Plano de implementação interno — Resenha Pré-Jogo | abril 2026*
