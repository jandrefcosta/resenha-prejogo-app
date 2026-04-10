# Referência de Rotas de API

Todos os endpoints internos da aplicação (`src/app/api`).

---

## Fixtures & Calendário

### `GET /api/fixtures`

Retorna fixtures das próximas 4 competições de clube (Série A, Libertadores, Copa do Brasil, Sul-Americana), agrupados por slug de clube.

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
- O merge é feito **por slug de clube** (deduplicação por fixture ID dentro do mesmo clube, não global — um fixture pertence ao mandante E ao visitante)
- O filtro por clube é feito no cliente (`MatchSection`) via `allFixtures[club.id]`

---

### `GET /api/round?competition=<id>`

Retorna todos os fixtures da rodada atual de uma competição, com broadcasters.

| | |
|-|-|
| **Parâmetros** | `competition` — slug da competição (padrão: `serie-a`) |
| **Fonte** | `/api/fixtures` interno + `/api/broadcasters` por fixture |
| **Cache** | Herdado dos sub-endpoints |

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
- Libertadores e Sul-Americana: fonte principal é a CONMEBOL API (`getConmebolFinishedByTeam`), com fallback automático para API-Football se o clube não tiver `conmebolId` ou a CONMEBOL não retornar dados
- Copa do Brasil e outras competições: exclusivamente API-Football (`getFinishedFixturesByClub`)
- Falhas individuais por competição são toleradas (`Promise.allSettled`) — o card não aparece vazio se uma fonte falhar
- Campos CONMEBOL enriquecidos no `Match`: `scoreDetail` (HT, pênaltis, agregado), `winner` ("home"/"away"/"draw"), `hadExtraTime`, `isNeutralVenue`

---

## Previews & Dados de Contexto

### `GET /api/previews?ids=<id1,id2,...>`

Batch fetch de form + broadcasters para múltiplos fixtures.

| | |
|-|-|
| **Parâmetros** | `ids` — IDs dos fixtures separados por vírgula |
| **Fonte** | API-Football (form) + Gemini (broadcasters) |

**Resposta:**
```typescript
Record<string, {
  homeForm: string[];    // ['W','D','L','W','W']
  awayForm: string[];
  broadcasters: string[];
}>
```

---

### `GET /api/broadcasters?fixtureId=X&home=Y&away=Z&round=N&date=D`

Canais de transmissão para um jogo específico.

| | |
|-|-|
| **Fonte** | Google Gemini 2.5 Flash + Google Search |
| **Cache** | Redis `broadcasters:{fixtureId}` — 24h (encontrado) / 1h (não encontrado) |

**Parâmetros:**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `fixtureId` | number | ID API-Football do fixture |
| `home` | string | Nome do time mandante |
| `away` | string | Nome do time visitante |
| `round` | number | Número da rodada |
| `date` | string | Data ISO 8601 |

**Resposta:**
```typescript
{ broadcasters: string[] }
```

**Notas:**
- Só ativa busca se o jogo for dentro dos próximos 14 dias
- Filtra resposta contra lista de canais conhecidos

---

### `GET /api/form?home=X&away=Y`

Forma recente (últimos 5 jogos) dos dois times.

| | |
|-|-|
| **Parâmetros** | `home`, `away` — IDs API-Football dos times |
| **Fonte** | API-Football `/teams/statistics` |
| **Cache** | Redis 6h |

**Resposta:**
```typescript
{
  homeForm: string[];    // ['W','W','D','L','W']
  awayForm: string[];
}
```

---

### `GET /api/h2h?home=X&away=Y&fixture=F&leagueId=L`

Head-to-head, lesionados e form para um confronto.

| | |
|-|-|
| **Parâmetros** | `home`, `away` — IDs API-Football; `fixture` — ID do fixture (opcional); `leagueId` — ID da liga (padrão: `71`) |
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
- `leagueId` isola o cache por competição — evita que dados de Série A sejam retornados para um confronto da Libertadores e vice-versa
- Form de cada time é buscada na competição do jogo (`leagueId`), não fixada na Série A

---

### `GET /api/players?home=X&away=Y&leagueId=L`

Top 6 jogadores (artilheiros + assistentes) de cada time na competição do jogo.

| | |
|-|-|
| **Parâmetros** | `home`, `away` — IDs API-Football; `leagueId` — ID da liga (padrão: `71`) |
| **Fonte** | API-Football `/players` filtrado por `league` e `season` |
| **Cache** | Redis 24h — chave `players:v2:{teamId}:{leagueId}:{season}` isolada por time, competição e temporada |

**Resposta:**
```typescript
{
  home: PlayerStat[];
  away: PlayerStat[];
}
```

**Notas:**
- `leagueId` garante que estatísticas retornadas sejam da competição correta (ex: Libertadores, não Série A)
- Cache isolado por `leagueId` evita que uma consulta anterior na Série A seja reutilizada para um jogo da Copa do Brasil

---

## Standings

### `GET /api/standings?competition=<id>&force=0|1`

Tabela de classificação de uma competição.

| | |
|-|-|
| **Parâmetros** | `competition` — slug (padrão: `serie-a`); `force` — se `1`, ignora cache |
| **Fonte** | API-Football `/standings` |
| **Cache** | Redis `standings:{leagueId}:v2` — 30min (janela de jogos, Série A) / 3h (fora ou outras competições) |

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
- `ttlSeconds` é gravado no payload para que cache hits usem o mesmo valor no `Cache-Control`, evitando inconsistências em leituras concorrentes no limite do TTL

---

## Dados CBF (Resultados Oficiais — Série A)

### `GET /api/past-fixtures?club=<slug>&beforeRound=<N>&limit=<3>`

Resultados das últimas rodadas do Brasileirão para um clube específico.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `club` | string | — | Slug do clube (ex: `flamengo`) |
| `beforeRound` | number | — | Busca rodadas anteriores a este número |
| `limit` | number | 3 | Quantas rodadas retornar |

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

### `GET /api/cbf/round/[round]?force=0|1`

Todos os jogos de uma rodada específica do Brasileirão.

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `round` | number (path) | Número da rodada (1–38) |
| `force` | boolean | Re-fetch ignorando cache |

**Fonte:** `getCbfRound()` em `src/lib/cbfApi.ts`

**Resposta:**
```typescript
CbfRoundData {
  round: number;
  status: 'finished' | 'live' | 'upcoming';
  fetchedAt: string;
  ttlSeconds: number;
  matches: CbfMatchDetail[];
}
```

---

## Usuário & Suporte

### `POST /api/identity`

Registra/atualiza e-mail do usuário.

**Body:** `{ email: string }`

**Ações:**
1. Gera/reutiliza UUID (cookie `sc_uid`)
2. Salva `{ email, emailHash, ip, timestamps }` no Redis
3. Define cookie `sc_uid` (httpOnly, Secure, 1 ano)

**Resposta:** `{ ok: true }` | 400 (e-mail inválido)

---

### `POST /api/suggestions`

Envia feedback/sugestão.

**Body:** `{ text: string }`

**Rate limit:** 3 requests/hora por IP (Upstash Ratelimit, sliding window)

**Resposta:** `{ ok: true }` | 429 (rate limit) | 400 (texto inválido)

---

## Debug (desenvolvimento)

### `GET /api/debug/fixtures?secret=<SECRET>&competition=<id>&club=<slug>&bust=1`

Diagnóstico completo do pipeline de fixtures — replica exatamente o que `/api/fixtures` faz.

| Parâmetro | Descrição |
|-----------|-----------|
| `secret` | Deve bater com `DEBUG_SECRET` no `.env.local` |
| `club` | (opcional) Slug para ver os matches detalhados daquele clube |
| `bust=1` | Apaga **todas** as chaves `fixtures:*` do Redis antes de buscar |

**Resposta:**
```typescript
{
  cacheBusted: boolean;
  caches: Array<{ id: string; status: 'HIT' | 'MISS'; rawCount: number }>;
  errors?: string[];   // competições que falharam
  pipeline: {
    totalClubsWithMatches: number;
    clubsWithFewMatches: Array<{ slug, name, total, byCompetition }>;
    allClubs: Array<{ slug, name, total, byCompetition }>;
    clubDetail?: { slug: string; matches: Match[] };
  };
}
```

**Notas:**
- `clubsWithFewMatches` lista clubes com menos de 3 jogos no total — indicativo de mismatch de `apiFootballId` ou agenda não publicada pela API
- `bust=1` limpa todas as 4 competições simultaneamente
