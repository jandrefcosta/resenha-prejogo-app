# Roadmap Consolidado — Resenha Pré-Jogo

> Sintetiza os três documentos de planejamento e define a ordem de execução.  
> Última revisão: abril 2026

---

## Contexto: três planos, uma sequência

Existem três documentos de planejamento no repositório:

| Documento | Escopo | Status |
|-----------|--------|--------|
| `multi-competition.md` | Arquitetura base + página Copa do Mundo | Decisões tomadas |
| `v2-multiplas-competicoes.md` | Competições de clubes na página principal | Proposta nova |
| `bolao-copa.md` | Gerenciador de bolão da Copa | Depende dos dois acima |

---

## Resolução de sobreposição

O `multi-competition.md` decidiu "página separada por campeonato". Isso **não conflita** com o `v2-multiplas-competicoes.md` — eles cobrem escopos distintos:

| Página | Competições | Lógica de filtro |
|--------|-------------|-----------------|
| `/` (existente) | Brasileirão + Libertadores + Copa do Brasil + Sul-Americana | Por **clube** — "time do usuário" |
| `/copa-2026` (nova) | Copa do Mundo 2026 | Por **seleção nacional** — Brasil em destaque |
| `/copa-2026/bolao` (nova) | Bolão da Copa | Requer autenticação |

A separação em página `/copa-2026` se justifica porque a Copa do Mundo tem:
- Seleções nacionais (não clubes) → `clubs.json` não se aplica
- 64 jogos com formato completamente diferente (grupos A–H, 4 times cada)
- SEO próprio (`/copa-2026` rankeia independentemente)
- UX diferente (usuário quer ver todos os jogos, não filtrar pelo "seu time")

As competições de clubes (Libertadores, Copa do Brasil, Sul-Americana) ficam **na página atual** com seletor de competição, pois o time selecionado é o fio condutor.

---

## Cadeia de dependências

```
[Fase 0 — Foundation]
    │
    ├─→ [Fase 1 — Competições de clubes] (independente)
    │       └─→ Página / com Brasileirão + Libertadores + Copa do Brasil + Sul-Americana
    │
    └─→ [Fase 2 — Copa do Mundo] (independente da Fase 1)
            └─→ [Fase 3 — Bolão] (depende da Fase 2 + auth)
```

As Fases 1 e 2 podem ser desenvolvidas em paralelo após a Fase 0.  
A Fase 3 só começa quando a Fase 2 estiver funcional.

---

## Fase 0 — Foundation (fazer primeiro, sem impacto visual)

Compartilhada por todas as fases. Zero breaking change — apenas cria estrutura.

### 0.1 · `src/data/competitions.ts` — novo arquivo

```typescript
export interface Competition {
  id: string;                    // 'serie-a' | 'libertadores' | 'copa-brasil' | 'sul-americana' | 'world-cup-2026'
  name: string;                  // "Brasileirão Série A"
  shortName: string;             // "Série A"
  apiFootballLeagueId: number;   // 71 | 13 | 73 | 11 | 1
  season: number;
  cbfChampionshipId?: number;    // só Série A
  hasCbfData: boolean;
  scope: 'club' | 'national';
  format: 'pontos-corridos' | 'mata-mata' | 'grupos-mata-mata';
  defaultHighlightTeamId?: number; // Copa do Mundo: Brasil = 6
}

export const COMPETITIONS: Competition[] = [
  { id: 'serie-a',          apiFootballLeagueId: 71, scope: 'club',     format: 'pontos-corridos',  hasCbfData: true,  cbfChampionshipId: 1260611, ... },
  { id: 'libertadores',     apiFootballLeagueId: 13, scope: 'club',     format: 'grupos-mata-mata', hasCbfData: false, ... },
  { id: 'copa-brasil',      apiFootballLeagueId: 73, scope: 'club',     format: 'mata-mata',        hasCbfData: false, ... },
  { id: 'sul-americana',    apiFootballLeagueId: 11, scope: 'club',     format: 'grupos-mata-mata', hasCbfData: false, ... },
  { id: 'world-cup-2026',   apiFootballLeagueId: 1,  scope: 'national', format: 'grupos-mata-mata', hasCbfData: false, defaultHighlightTeamId: 6, ... },
];
```

**Arquivos:** `src/data/competitions.ts` (novo)

---

### 0.2 · `src/lib/types.ts` — expandir `Match`

```typescript
// Adicionar ao interface Match existente:
leagueId: number;           // 71 | 13 | 73 | 11 | 1
competitionName: string;    // "Brasileirão" | "Libertadores" | ...
competitionPhase?: string;  // "Fase de Grupos" | "Oitavas de Final" | null
```

**Arquivos:** `src/lib/types.ts`

---

### 0.3 · Parametrizar `src/lib/apiFootball.ts`

Hoje todas as funções têm `LEAGUE_ID = 71` hardcoded. Extrair para parâmetros:

```typescript
// Wrapper retrocompatível — não quebra nada:
export const getSerieAFixtures = (teamId: number) =>
  getFixturesByLeague(teamId, COMPETITIONS.find(c => c.id === 'serie-a')!);

// Nova função parametrizada:
export async function getFixturesByLeague(teamId: number, competition: Competition) { ... }
export async function getTeamForm(teamId: number, leagueId: number, season: number) { ... }
export async function getStandings(leagueId: number, season: number) { ... }
```

Redis: chaves `fixtures:serie-a` → `fixtures:{competition.id}`  
Criar função de migração ou invalidar no deploy.

**Arquivos:** `src/lib/apiFootball.ts`

---

### 0.4 · Parametrizar `src/lib/broadcasterSearch.ts`

```typescript
export async function getBroadcastersForFixture(
  params: { home: string; away: string; date: string; round: string },
  competitionName: string  // novo parâmetro
)
// Prompt: "onde ${competitionName} será transmitida..." (antes era hardcoded "Brasileirão Série A")
```

**Arquivos:** `src/lib/broadcasterSearch.ts`

---

### 0.5 · Criar `src/lib/matchDataSource.ts` — novo arquivo

```typescript
// Decide qual fonte usar para resultados passados
export function getFinishedMatchSource(leagueId: number): 'cbf' | 'api-football' {
  return leagueId === 71 ? 'cbf' : 'api-football';
}
```

**Arquivos:** `src/lib/matchDataSource.ts` (novo)

---

### 0.6 · Adicionar `?competition=` nos endpoints existentes

Parâmetro opcional, default `serie-a` — **totalmente retrocompatível**:

| Endpoint | Mudança |
|----------|---------|
| `GET /api/fixtures` | `?competition=libertadores` |
| `GET /api/standings` | `?competition=libertadores` |
| `GET /api/round` | `?competition=copa-brasil` |
| `GET /api/form` | `?leagueId=13` |
| `GET /api/h2h` | `?leagueId=13` |

**Arquivos:** `src/app/api/fixtures/route.ts`, `standings/route.ts`, `round/route.ts`, `form/route.ts`, `h2h/route.ts`

---

**Critério de aceite da Fase 0:** Série A continua funcionando identicamente. Nenhuma mudança visual. CI verde.

---

## Fase 1 — Competições de clubes na página principal

**Dependência:** Fase 0 completa  
**Impacto:** Página `/` existente  
**Prioridade de produto:** Alta (core do app)

### 1.1 · Fixtures de todas as competições (CRÍTICO)

O que muda na prática: usuário seleciona Corinthians e vê Brasileirão + Libertadores + Copa do Brasil ordenados por data.

**Estratégia de detecção:**
```typescript
// Não pergunta ao usuário quais competições quer ver.
// Chama API-Football sem filtro de liga e agrupa os league.id retornados.
async function detectActiveCompetitions(teamId: number): Promise<number[]> {
  // Cache: `competitions:{teamId}:{season}` TTL 24h
  // Retorna ex: [71, 13, 73]
}
```

**Arquivos afetados:**
- `src/lib/apiFootball.ts` → `detectActiveCompetitions()` + `fetchFixturesByLeague()`
- `src/app/api/fixtures/route.ts` → mesclagem e ordenação por data
- `src/components/MatchSection.tsx` → renderiza jogos de múltiplas competições
- `src/components/MatchCard.tsx` → etiqueta `match.competitionName` (substitui "Serie A" fixo)

**Critério de aceite:** Cenários 1, 6 e 7 do doc de produto.

---

### 1.2 · Card correto por competição

**Arquivos afetados:**
- `src/components/MatchCard.tsx` → `getRoundLabel(match)` ("Rodada 12" vs "Oitavas - Jogo de Ida")
- `src/lib/teamForm.ts` → parâmetro `leagueId`
- `src/lib/broadcasterSearch.ts` → já parametrizado na Fase 0

**Critério de aceite:** Cenários 4 e 5 do doc de produto.

---

### 1.3 · StandingsModal com seletor de competição

```
StandingsModal
├── Tabs: [Brasileirão] [Libertadores] [Copa do Brasil] [Sul-Americana]
│         (só mostra tabs das competições do time selecionado)
└── View por formato:
    ├── PontosCorridosTable  (já existe)
    ├── GruposTable          (novo — Libertadores/Sul-Americana fase de grupos)
    └── BracketView          (novo — Copa do Brasil / fases finais)
```

**Nota sobre BracketView:** entregar lista de confrontos simples no MVP. Bracket visual completo na iteração seguinte.

**Arquivos afetados:**
- `src/components/StandingsModal.tsx` → refatorar com seletor
- `src/app/api/standings/route.ts` → aceitar `?competition=`
- Novos: `src/components/GruposTable.tsx`, `src/components/BracketView.tsx`

**Critério de aceite:** Cenário 2 do doc de produto.

---

### 1.4 · RoundModal com seletor de competição

```
RoundModal
├── Tabs: [Brasileirão] [Libertadores] [Copa do Brasil] [Sul-Americana]
└── View por formato:
    ├── BrasileiraoRound  (já existe — rodadas 1–38)
    ├── MataMataRound     (novo — fase + jogos de ida/volta)
    └── GruposRound       (novo — todos os grupos da rodada N)
```

**Arquivos afetados:**
- `src/components/RoundModal.tsx` → refatorar com seletor
- `src/app/api/round/route.ts` → aceitar `?competition=`
- Novos: `src/components/MataMataRound.tsx`, `src/components/GruposRound.tsx`

**Critério de aceite:** Cenário 3 do doc de produto.

---

### 1.5 · Filtro de competição na tela de jogos (opcional, pós-core)

Pills acima da lista: `[ Todos ] [ Brasileirão ] [ Libertadores ] [ Copa do Brasil ]`

**Arquivos afetados:**
- `src/components/MatchSection.tsx` → `useState<number | null>` para filtro

---

## Fase 2 — Página Copa do Mundo 2026

**Dependência:** Fase 0 completa (Fase 1 pode correr em paralelo)  
**Impacto:** Nova rota `/copa-2026` — zero risco de regressão na Série A

### 2.1 · Estrutura de arquivos (novo, isolado)

```
src/app/copa-2026/
  page.tsx         # tema verde/amarelo fixo, Brasil em destaque
  layout.tsx       # SEO próprio: "Copa do Mundo 2026"

src/app/api/copa/
  fixtures/route.ts   # GET fixtures (leagueId=1, sem filtro por clube)
  standings/route.ts  # GET tabela por grupos (A–H)

src/components/copa/
  CopaMatchSection.tsx     # lista de jogos com destaque automático do Brasil
  GroupStandingsModal.tsx  # 8 mini-tabelas por grupo (A–H, 4 times cada)
  CopaPhaseHeader.tsx      # "Fase de Grupos" / "Oitavas" / "Quartas"
```

### 2.2 · UX MVP (Brasil fixo, sem seletor)

- Tema verde/amarelo, sem `ClubSelector`
- Todos os 64 jogos visíveis (não filtra — Copa é diferente da Série A)
- Brasil sempre destacado (`defaultHighlightTeamId = 6` da `Competition`)
- `GroupStandingsModal` — formato 8 grupos × 4 times (componente novo, não reutiliza `StandingsModal`)

### 2.3 · Pós-MVP (se houver demanda via feedback)

- Botão "Seguir outro país" → seletor de seleção, persistido em `localStorage`
- `CopaPhaseHeader` para fases eliminatórias (oitavas, quartas, semis, final)

---

## Fase 3 — Bolão da Copa do Mundo

**Dependência:** Fase 2 funcional + sistema de auth  
**Impacto:** Nova rota `/copa-2026/bolao` — completamente isolada

### 3.0 · Decisão de auth: PIN por e-mail (Opção C do doc)

Usando `sc_uid` existente como `userId`. Adicionar:
- `displayName` ao `UserRecord`
- `POST /api/auth/request-pin` → gera PIN, salva `pin:{email}` Redis TTL 15min, envia via Resend
- `POST /api/auth/verify-pin` → valida, atualiza cookie de longa duração
- Novo pacote: `resend` + `nanoid`

### 3.1 · Etapas do Bolão (sequencial, cada uma depende da anterior)

| Etapa | O que entrega |
|-------|---------------|
| **Auth** | Login via PIN por e-mail, `displayName` no perfil |
| **CRUD Bolão** | Criar bolão, gerar código, entrar por código, listar bolões do usuário |
| **Palpites** | Grid de todos os jogos com inputs de placar, lock automático no kickoff |
| **Pontuação** | Cron Vercel 30min, cálculo de pontos, leaderboard com sorted sets Redis |
| **Polish** | Revelar palpites dos outros após kickoff, detalhe por jogo, share de ranking |

**Arquivos novos:**
```
src/app/api/auth/request-pin/route.ts
src/app/api/auth/verify-pin/route.ts
src/app/api/bolao/[...]/route.ts
src/app/api/cron/score-matches/route.ts
src/components/bolao/PredictionGrid.tsx
src/components/bolao/Leaderboard.tsx
vercel.json (novo — cron config)
```

---

## Ordem de execução recomendada

```
┌─────────────────────────────────────────────────────────────────────┐
│  AGORA → Fase 0 (Foundation)                                        │
│  competitions.ts + types.ts + parametrizar apiFootball + endpoints  │
│  ~2-3 dias | zero risco de regressão | habilita tudo que vem depois │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
           ┌──────────────┴──────────────┐
           ▼                             ▼
┌──────────────────────┐    ┌─────────────────────────┐
│  Fase 1              │    │  Fase 2                  │
│  Competições de      │    │  Copa do Mundo page      │
│  clubes (página /)   │    │  (/copa-2026)            │
│                      │    │                          │
│  1.1 Fixtures multi  │    │  2.1 Estrutura + página  │
│  1.2 Card correto    │    │  2.2 CopaMatchSection    │
│  1.3 StandingsModal  │    │  2.3 GroupStandingsModal │
│  1.4 RoundModal      │    │                          │
│  1.5 Filtro pills    │    │                          │
│                      │    │                          │
│  ~1-2 semanas        │    │  ~1 semana               │
└──────────────────────┘    └──────────┬──────────────┘
                                        │
                            ┌───────────┘
                            ▼
              ┌─────────────────────────┐
              │  Fase 3                  │
              │  Bolão da Copa           │
              │  (/copa-2026/bolao)      │
              │                          │
              │  3.0 Auth (PIN e-mail)   │
              │  3.1 CRUD bolão          │
              │  3.2 Palpites + lock     │
              │  3.3 Pontuação + cron    │
              │  3.4 Polish              │
              │                          │
              │  ~2-3 semanas            │
              └─────────────────────────┘
```

---

## Próximos passos imediatos (antes de qualquer código)

Três verificações que podem mudar o escopo antes de começar:

**1. Testar API-Football para leagues 13, 11, 73**  
```bash
# Verificar se a API retorna dados para Corinthians na Libertadores
GET https://v3.football.api-sports.io/fixtures?team=131&league=13&season=2026
```
Se não retornar dados, o caminho é diferente.

**2. Confirmar quota do plano API-Football**  
Expandir de 1 para 4 ligas pode triplicar o volume de chamadas. Se o plano atual for limitado, o cache precisa ser ainda mais agressivo — ou o plano precisa ser atualizado antes do desenvolvimento.

**3. Confirmar data alvo para a Copa do Mundo**  
A Copa começa em junho de 2026. Se a Fase 2 precisa estar pronta antes disso, ela tem prazo fixo — a Fase 1 pode ser desenvolvida depois sem pressão de data.

---

## O que NÃO muda em nenhuma fase

- CBF API como fonte canônica para Série A
- `ThemeProvider`, `useFocusTrap`, `redisCache` — genéricos, zero mudança
- `SuggestionModal`, `EmailCaptureModal`, `OnboardingModal`
- Sistema de identidade (`sc_uid` cookie + Redis) — apenas cresce na Fase 3
- Lógica de compartilhamento (Web Share API)
- E2E tests — apenas adicionar mocks multi-competição

---

*Roadmap interno — Resenha Pré-Jogo | abril 2026*
