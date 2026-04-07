# Referência de Rotas de API

Todos os endpoints internos da aplicação (`src/app/api`).

---

## Fixtures & Calendário

### `GET /api/fixtures`

Retorna todos os fixtures da Série A dos próximos 90 dias.

| | |
|-|-|
| **Fonte** | API-Football v3 |
| **Cache** | `unstable_cache` 6h + Redis `fixtures:serie-a` 6h |
| **Auth** | Nenhuma (público) |

**Resposta:**
```typescript
Match[]
```

**Notas:**
- Apenas status `NS` (Not Started)
- Campeonato: Série A brasileira (league ID da API-Football)
- Todos os 20 times — o filtro por clube é feito no cliente

---

### `GET /api/round`

Retorna todos os fixtures da rodada atual com broadcasters.

| | |
|-|-|
| **Fonte** | `/api/fixtures` interno + `/api/broadcasters` por fixture |
| **Cache** | Herdado dos sub-endpoints |

**Resposta:**
```typescript
{
  round: number;
  matches: MatchWithBroadcasters[];
}
```

**Notas:**
- Rodada atual = menor rodada entre fixtures futuros
- Deduplicação aplicada (API-Football retorna duplicatas ocasionalmente)

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
| **Fonte** | API-Football `/teams/seasons` e `/fixtures` |
| **Cache** | Redis 6h |

**Resposta:**
```typescript
{
  homeForm: string[];    // ['W','W','D','L','W']
  awayForm: string[];
}
```

---

### `GET /api/h2h?home=X&away=Y&fixture=F`

Head-to-head, lesionados e form para um confronto.

| | |
|-|-|
| **Parâmetros** | `home`, `away` — IDs API-Football; `fixture` — ID do fixture (opcional) |
| **Fonte** | API-Football `/fixtures/headtohead` + `/injuries` |
| **Cache** | Redis 6h |

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

---

### `GET /api/players?home=X&away=Y`

Top 6 jogadores (artilheiros + assistentes) de cada time.

| | |
|-|-|
| **Parâmetros** | `home`, `away` — IDs API-Football |
| **Fonte** | API-Football `/players/topscorers` + `/players/topassists` |
| **Cache** | Redis 24h |

**Resposta:**
```typescript
{
  home: PlayerStat[];
  away: PlayerStat[];
}
```

---

## Standings

### `GET /api/standings?force=0|1`

Tabela de classificação completa da Série A.

| | |
|-|-|
| **Parâmetros** | `force` — se `1`, ignora cache |
| **Fonte** | API-Football `/standings` |
| **Cache** | Redis `standings:serie-a` — 30min (janela de jogos) / 3h (fora) |

**Resposta:**
```typescript
StandingEntry[]   // 20 entradas ordenadas por posição
```

---

## Dados CBF (Resultados Oficiais)

### `GET /api/past-fixtures?club=<slug>&beforeRound=<N>&limit=<3>`

Resultados das últimas rodadas para um clube específico.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `club` | string | — | Slug do clube (ex: `flamengo`) |
| `beforeRound` | number | — | Busca rodadas anteriores a este número |
| `limit` | number | 3 | Quantas rodadas retornar |

**Fonte:** CBF API via `getCbfRound()`
**Cache:** Estratégia CBF (ver [Estratégia de Cache](caching-strategy.md))

**Resposta:**
```typescript
{
  rounds: Array<{
    round: number;
    matches: CbfMatchDetail[];   // só os jogos do clube solicitado
  }>;
}
```

---

### `GET /api/cbf/round/[round]?force=0|1`

Todos os jogos de uma rodada específica.

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

### `GET /api/debug/broadcast`

Testa o fluxo de busca de broadcasters para um fixture específico.

### `GET /api/debug/teams`

Lista times e IDs para debug de mapeamento de clubes.

> Estes endpoints não têm proteção de autenticação — usar apenas em desenvolvimento.
