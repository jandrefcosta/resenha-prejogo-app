# Referência de Rotas de API

Todos os endpoints internos da aplicação (`src/app/api`).

---

## Fixtures & Calendário

### `GET /api/fixtures`

Retorna fixtures das próximas competições de clube (Série A, Libertadores, Copa do Brasil, Sul-Americana), agrupados por slug de clube.

| | |
|-|-|
| **Fonte** | API-Football v3 — 4 calls em paralelo, cada um cacheado individualmente |
| **Cache** | `unstable_cache` 6h + Redis `fixtures:{competition.id}` 6h por competição |
| **Auth** | Nenhuma (público) |

**Resposta:**
```typescript
Record<string, Match[]>   // slug do clube → array de jogos ordenados por data
```

**Notas:**
- Fixtures de cada competição são limitados a 5 por clube (`MATCHES_PER_CLUB`)
- Janela de busca: hoje → hoje + 90 dias (apenas status `NS` e `PST`)
- O merge é feito **por slug de clube** (deduplicação por fixture ID dentro do mesmo clube, não global)
- O filtro por clube é feito no cliente (`MatchSection`) via `allFixtures[club.id]`

---

### `GET /api/round?competition=<id>`

Retorna todos os fixtures da rodada atual de uma competição, com broadcasters.

| | |
|-|-|
| **Parâmetros** | `competition` — slug da competição (padrão: `serie-a`) |
| **Fonte** | `getFixturesByClub` + `getBroadcastersForFixture` |
| **Cache** | Redis dos fixtures + Redis `broadcasters:{fixtureId}` |

**Resposta:**
```typescript
{
  round: string;           // ex: "Rodada 12" ou "Group Stage - 2"
  competition: string;     // nome curto da competição
  matches: MatchWithBroadcasters[];
}
```

**Notas:**
- Rodada atual = primeiro grupo de fixtures futuros para a competição selecionada
- Deduplicação aplicada (API-Football retorna duplicatas ocasionalmente)

---

## Resultados de Outras Competições

### `GET /api/past-results?club=<slug>`

Retorna os últimos jogos encerrados do clube nas competições que **não** têm dados CBF (Libertadores, Sul-Americana, Copa do Brasil).

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `club` | string | Slug do clube (ex: `flamengo`) |

| | |
|-|-|
| **Fonte primária** | CONMEBOL API — Libertadores e Sul-Americana para clubes com `conmebolId` |
| **Fonte secundária** | API-Football v3 — Copa do Brasil e demais competições; fallback quando CONMEBOL retorna vazio |
| **Cache** | CONMEBOL: Redis `conmebol:tournament:{id}` (TTL dinâmico); API-Football: `finished:{competition.id}:{teamApiId}` 6h |
| **Auth** | Nenhuma (público) |

**Resposta:**
```typescript
Match[]   // ordenados do mais recente para o mais antigo
```

**Notas:**
- Libertadores e Sul-Americana: fonte principal é CONMEBOL API, com fallback para API-Football
- Copa do Brasil e outras: exclusivamente API-Football (`getFinishedFixturesByClub`)
- Falhas individuais por competição são toleradas (`Promise.allSettled`)
- Campos CONMEBOL enriquecidos no `Match`: `scoreDetail` (HT, pênaltis, agregado), `winner`, `hadExtraTime`, `isNeutralVenue`

---

## Previews & Dados de Contexto

### `GET /api/previews?ids=<id1,id2,...>`

Batch fetch de form + broadcasters para múltiplos fixtures.

| | |
|-|-|
| **Parâmetros** | `ids` — IDs dos fixtures separados por vírgula (máx 20) |
| **Fonte** | API-Football (form) + `getBroadcastersForFixture` (Gemini + Google Search) |
| **Throttle** | 3 calls Gemini concorrentes |

**Resposta:**
```typescript
Record<string, {
  homeForm: string[];    // ['W','D','L','W','W']
  awayForm: string[];
  broadcasters: string[];
}>
```

---

### `GET /api/h2h?home=X&away=Y&fixture=F&leagueId=L`

Head-to-head, lesionados e form para um confronto.

| | |
|-|-|
| **Parâmetros** | `home`, `away` — IDs API-Football (obrigatórios); `fixture` — ID do fixture (opcional, para buscar lesões); `leagueId` — ID da liga (padrão: `71`) |
| **Fonte** | API-Football `/fixtures/headtohead` + `/injuries` |
| **Cache** | Redis 6h — chave isolada por competição (`h2h:{min}-{max}:{leagueId}`) |

**Resposta:**
```typescript
H2HData {
  homeForm: string[];
  awayForm: string[];
  h2h: H2HMatch[];         // últimos 10 confrontos
  stats: H2HStats;         // wins/draws/losses/goals
  injuries: InjuredPlayer[];
}
```

**Notas:**
- `leagueId` isola o cache por competição — evita que dados de Série A sejam retornados para um confronto da Libertadores
- Form de cada time é buscada na competição do jogo (`leagueId`), não fixada na Série A

---

### `GET /api/players?home=X&away=Y&leagueId=L`

Top 6 jogadores (artilheiros + assistentes) de cada time na competição do jogo.

| | |
|-|-|
| **Parâmetros** | `home`, `away` — IDs API-Football (obrigatórios); `leagueId` — ID da liga (padrão: `71`) |
| **Fonte** | API-Football `/players` filtrado por `league` e `season` |
| **Cache** | Redis 24h — chave `players:v2:{teamId}:{leagueId}:{season}` |

**Resposta:**
```typescript
{
  home: PlayerStat[];
  away: PlayerStat[];
}
```

**Notas:**
- `leagueId` garante estatísticas da competição correta (ex: Libertadores, não Série A)
- Cache isolado por `leagueId` evita reuso entre competições

---

## Lineups & Eventos

### `GET /api/lineups?fixture=<id>`

Escalações de uma partida.

| | |
|-|-|
| **Parâmetros** | `fixture` — ID do fixture (obrigatório) |
| **Fonte** | API-Football `/fixtures/lineups` |
| **Auth** | Nenhuma (público) |

**Resposta:**
```typescript
{
  home: LineupTeam;
  away: LineupTeam;
}
```

---

### `GET /api/match-events?fixture=F&home=X&away=Y&finished=1`

Eventos de gol de uma partida (em andamento ou encerrada).

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `fixture` | number | ID do fixture (obrigatório) |
| `home` | number | ID do time mandante na API-Football (obrigatório) |
| `away` | number | ID do time visitante na API-Football (obrigatório) |
| `finished` | `1` | (opcional) Indica partida encerrada |

| | |
|-|-|
| **Fonte** | API-Football `/fixtures/events` |
| **Auth** | Nenhuma (público) |

**Resposta:**
```typescript
MatchEvent[]   // apenas eventos de gol, ordenados por minuto
```

---

## Standings

### `GET /api/standings?competition=<id>&force=0|1`

Tabela de classificação de uma competição.

| | |
|-|-|
| **Parâmetros** | `competition` — slug (padrão: `serie-a`); `force` — se `1`, ignora cache |
| **Fonte** | API-Football `/standings` |
| **Cache** | Redis `standings:{leagueId}:v2` — 30min (janela de jogos) / 3h (fora ou outras competições) |

**Resposta:**
```typescript
{
  groups: StandingEntry[][];   // array de grupos (1 para pontos-corridos, N para grupos)
  format: 'pontos-corridos' | 'grupos' | 'mata-mata';
  updatedAt: string;
  ttlSeconds: number;          // TTL calculado no momento da escrita — reutilizado em cache hits
}
```

**Notas:**
- `ttlSeconds` é gravado no payload para que cache hits usem o mesmo valor no `Cache-Control`

---

## Dados CBF (Resultados Oficiais — Série A)

### `GET /api/cbf/match?home=X&away=Y&round=N`

Busca o detalhe de uma partida do Brasileirão na API da CBF pelo par de times e rodada.

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `home` | number | ID API-Football do time mandante |
| `away` | number | ID API-Football do time visitante |
| `round` | number \| string | Número da rodada (1–38) ou formato `"Rodada N"` |

| | |
|-|-|
| **Fonte** | CBF API — `getCbfRound()` + match por times |
| **Auth** | Nenhuma (público) |

**Resposta:**
```typescript
CbfMatchDetail   // detalhes do jogo na CBF (idJogo, times, placar, links dos PDFs)
```

---

### `GET /api/cbf/match-docs?matchId={idJogo}&round={N}`

Retorna dados parseados dos documentos oficiais (súmula + boletim financeiro) de um jogo encerrado.

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `matchId` | string | `idJogo` da CBF API |
| `round` | number | Número da rodada (usado para buscar `CbfMatchDetail` com URLs dos PDFs) |

| | |
|-|-|
| **Auth** | Nenhuma (público) |
| **Cache** | Redis permanente — `cbf:match:{id}:sumula`, `cbf:match:{id}:boletim`, `cbf:match:{id}:docs:status` |

**Resposta:**
```typescript
{ available: false }
// ou
{
  available: true;
  sumula?: CbfSumulaData;   // escalação, subs, árbitros, gols, cartões
  boletim?: CbfBoletimData; // público e renda
}
```

**Comportamento:**
- Verifica sentinela Redis; se hit e `available: true` → retorna dados em ~50ms
- Se sentinela diz `available: false` e idade < 2h → retorna `{ available: false }` sem re-fetch
- Se não há sentinela → baixa PDFs da CBF, parseia, armazena permanentemente, retorna resultado

---

### `GET /api/past-fixtures?club=<slug>&beforeRound=<N>&limit=<3>`

Resultados das últimas rodadas do Brasileirão para um clube específico.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `club` | string | — | Slug do clube (ex: `flamengo`) |
| `beforeRound` | number | — | Busca rodadas anteriores a este número |
| `limit` | number | 3 | Quantas rodadas retornar (máx 10) |

**Fonte:** CBF API via `getCbfRound()`  
**Cache:** Estratégia CBF (ver [Estratégia de Cache](caching-strategy.md))

**Resposta:**
```typescript
Array<{
  round: number;
  match: CbfMatchDetail;   // só o jogo do clube solicitado
}>
```

---

## Copa do Mundo 2026

### `GET /api/copa-bracket?force=0|1`

Bracket completo da Copa do Mundo 2026 com todas as fases.

| | |
|-|-|
| **Parâmetros** | `force` — se `1`, ignora cache |
| **Fonte** | API-Football |
| **Cache** | Redis |
| **Auth** | Nenhuma (público) |

**Resposta:**
```typescript
CopaBracket   // todas as fases com jogos e placar
```

---

### `GET /api/copa/fixtures`

Fixtures da Copa do Mundo 2026 agrupados por fase.

| | |
|-|-|
| **Fonte** | API-Football |
| **Auth** | Nenhuma (público) |

**Resposta:**
```typescript
Record<string, Match[]>   // fase → array de jogos
```

---

### `GET /api/copa/standings`

Classificação da Copa do Mundo 2026: fase de grupos + ranking de terceiros lugares.

| | |
|-|-|
| **Fonte** | API-Football |
| **Auth** | Nenhuma (público) |

**Resposta:**
```typescript
{
  groups: StandingEntry[][];
  thirdPlace: StandingEntry[];
}
```

---

## Usuário & Suporte

### `POST /api/suggestions`

Envia feedback/sugestão.

**Body:** `{ text: string }` (máx 500 caracteres)

**Rate limit:** 3 requests/hora por IP (Upstash Ratelimit, sliding window)

**Resposta:** `{ ok: true }` | 429 (rate limit) | 400 (texto inválido)

---

## Admin

### `DELETE /api/admin/bust-match-docs`

Invalida documentos cacheados no Redis para forçar re-parse.

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `idJogo` | string | (opcional) Remove as 3 chaves de um jogo específico |
| `all` | boolean | (opcional) Remove **todas** as chaves `cbf:match:*` |

| | |
|-|-|
| **Auth** | Header `Authorization: Bearer <DEBUG_SECRET>` |

**Exemplos:**
```http
DELETE /api/admin/bust-match-docs?idJogo=831889
Authorization: Bearer <DEBUG_SECRET>

DELETE /api/admin/bust-match-docs?all=true
Authorization: Bearer <DEBUG_SECRET>
```

---

## Debug (desenvolvimento)

### `GET /api/debug/fixtures?club=<slug>&bust=1`

Diagnóstico completo do pipeline de fixtures — replica exatamente o que `/api/fixtures` faz.

| Parâmetro | Descrição |
|-----------|-----------|
| `club` | (opcional) Slug para ver os matches detalhados daquele clube |
| `bust=1` | Apaga **todas** as chaves `fixtures:*` do Redis antes de buscar |

**Auth:** header `Authorization: Bearer <DEBUG_SECRET>`.

**Resposta:**
```typescript
{
  cacheBusted: boolean;
  caches: Array<{ id: string; status: 'HIT' | 'MISS'; rawCount: number }>;
  errors?: string[];
  pipeline: {
    totalClubsWithMatches: number;
    clubsWithFewMatches: Array<{ slug, name, total, byCompetition }>;
    allClubs: Array<{ slug, name, total, byCompetition }>;
    clubDetail?: { slug: string; matches: Match[] };
  };
}
```

**Notas:**
- `clubsWithFewMatches` lista clubes com menos de 3 jogos — indicativo de mismatch de `apiFootballId`
- `bust=1` limpa todas as 4 competições simultaneamente

---

### `GET /api/debug/teams`

Match entre times da API-Football e o `clubs.json` interno.

| | |
|-|-|
| **Auth** | Header `Authorization: Bearer <DEBUG_SECRET>` |

**Resposta:**
```typescript
{
  matched: Array<{ slug, name, apiFootballId }>;
  unmatched: Array<{ slug, name }>;
}
```

---

### `GET /api/debug/broadcast`

Testa o lookup de canais de transmissão via Gemini para um jogo hardcoded (Internacional vs São Paulo).

| | |
|-|-|
| **Auth** | Header `Authorization: Bearer <DEBUG_SECRET>` |

**Resposta:** resultado raw do `getBroadcastersForFixture` para o jogo de teste.
