# Estratégia de Cache

## Arquitetura em camadas

```
Request
  │
  ▼
[L1] Next.js unstable_cache (in-process, por serverless instance)
  │ miss
  ▼
[L2] Upstash Redis (distribuído, persiste entre instâncias e deploys)
  │ miss
  ▼
[L3] API Externa (API-Football / CBF / Gemini)
  │
  ▼
Salva em L2 → L1 (para próximas requisições)
```

O L1 (`unstable_cache`) deduplica requisições concorrentes dentro da mesma instância serverless. O L2 (Redis) é a camada principal — persiste entre instâncias e cold starts.

---

## TTLs por tipo de dado

### Fixtures próximos (API-Football)

Uma chave por competição+temporada — armazenam a resposta bruta da API, antes do merge por clube.

| Dado | Chave Redis | TTL |
|------|-------------|-----|
| Fixtures Série A | `fixtures:serie-a:{season}` | 6 horas |
| Fixtures Libertadores | `fixtures:libertadores:{season}` | 6 horas |
| Fixtures Copa do Brasil | `fixtures:copa-brasil:{season}` | 6 horas |
| Fixtures Sul-Americana | `fixtures:sul-americana:{season}` | 6 horas |

O campo `{season}` (ano) garante que na virada de temporada os dados do ano anterior não sejam servidos até o TTL expirar.

### Resultados encerrados (API-Football)

| Dado | Chave Redis | TTL |
|------|-------------|-----|
| Últimos 5 jogos por competição+time | `finished:{competition.id}:{teamApiId}` | 6 horas |

Placares encerrados são imutáveis após ~2h de finalização. TTL de 6h evita chamadas redundantes à API sem impacto na frescor dos dados exibidos.

### Outros dados de times

| Dado | Chave Redis | TTL |
|------|-------------|-----|
| Form do time por competição | `form:{teamId}:{leagueId}:{season}` | 6 horas |
| H2H por competição | `h2h:{min}-{max}:{leagueId}` | 6 horas |
| Lesionados por fixture | `injuries:v2:{fixtureId}` | 3 horas |
| Jogadores por competição | `players:v2:{teamId}:{leagueId}:{season}` | 24 horas |

Form usa o `leagueId` da competição do jogo — cada campeonato tem sua própria entrada no cache.
H2H usa `min(homeId,awayId)-max(homeId,awayId):{leagueId}` — isolado por competição para evitar colisão de dados entre campeonatos diferentes com o mesmo par de times.

### Classificação (API-Football)

Chave usa `leagueId` numérico com sufixo `:v2`.

| Período | Chave Redis | TTL |
|---------|-------------|-----|
| Janela de jogos (qua–dom) | `standings:71:v2` | 30 minutos |
| Fora da janela (seg–ter) | `standings:71:v2` | 3 horas |
| Libertadores / Sul-Americana | `standings:{leagueId}:v2` | 3 horas |

A janela de jogos considera que a maioria das rodadas ocorre de quarta a domingo.

**TTL gravado no payload:** o `StandingsPayload` inclui o campo `ttlSeconds` com o valor calculado no momento da escrita. Cache hits reutilizam esse valor para o `Cache-Control`, evitando que leituras concorrentes no limite do TTL gerem cabeçalhos inconsistentes.

### Broadcasters (Gemini + Google Search)

| Situação | Chave Redis | TTL |
|----------|-------------|-----|
| Canais encontrados | `broadcasters:{fixtureId}` | 24 horas |
| Sem canais (não publicado) | `broadcasters:{fixtureId}` | 1 hora |

O TTL mais curto quando sem canais permite retry frequente até a grade ser publicada.

### Dados CONMEBOL (Libertadores & Sul-Americana)

TTL varia por status inferido dos jogos do torneio:

| Status | TTL | Condição |
|--------|-----|----------|
| `live` | 5 minutos | `isLive === true` ou dentro da janela kickoff + 115 min |
| `post-match` | 10 minutos | Entre kickoff + 115 min e kickoff + 150 min (aguardando publicação do placar) |
| `finished` | 6 horas | Todos os jogos com `matchStatus === 'Played'` |
| `upcoming` | 6 horas | Nenhum ao vivo, nenhum recém-encerrado |

**Duas chaves por torneio:**
- `conmebol:tournament:{id}` — chave primária com TTL dinâmico
- `conmebol:tournament:{id}:stale` — backup permanente (6h) para stale-while-error

**Janela `post-match`:** A CONMEBOL publica o placar final dentro de ~150 min após o kickoff. O sistema detecta essa janela quando um jogo ainda exibe `Fixture` mas o tempo estimado de encerramento (kickoff + 115 min) já passou. Durante esse período o cache é revalidado a cada 10 min.

---

### Dados CBF (rodadas)

Esta é a estratégia mais complexa — TTL varia por status da rodada:

| Status | Chave primária TTL | Chave stale TTL |
|--------|-------------------|-----------------|
| `finished` | 30 dias | **Permanente (sem TTL)** |
| `live` | 5 minutos | 30 dias |
| `post_match` | 10 minutos | 30 dias |
| `upcoming` (>48h) | 12 horas | 30 dias |
| `upcoming` (>24h) | 6 horas | 30 dias |
| `upcoming` (>12h) | 2 horas | 30 dias |
| `upcoming` (≤12h) | 1 hora | 30 dias |

**Duas chaves por rodada:**
- `cbf:round:{N}` — chave primária com TTL
- `cbf:round:{N}:stale` — backup (permanente para finished, 30d para outros)

---

## Stale-while-error (CONMEBOL)

Se a API da CONMEBOL falhar, o sistema cai para a chave `:stale`:

```
getConmebolTournament(id)
  ├─ Redis primary hit → retorna
  ├─ Primary miss → fetch CONMEBOL API
  │   ├─ Sucesso → salva primary (TTL dinâmico) + stale (6h) → retorna
  │   └─ Falha (network/HTTP error)
  │       ├─ Redis stale hit + fetchedAt ≤ 24h → retorna stale
  │       ├─ Redis stale hit + fetchedAt > 24h → descarta, throw Error
  │       └─ Stale miss → throw Error
```

**Validação de staleness:** igual à CBF — dado de backup só é servido se foi buscado há menos de 24 horas (`STALE_MAX_AGE_MS`).

---

## Stale-while-error (CBF)

Se a CBF API falhar (erro de rede ou HTTP não-2xx), o sistema cai automaticamente para a chave `:stale`:

```
getCbfRound(round)
  ├─ Redis primary hit → retorna
  ├─ Primary miss → fetch CBF API
  │   ├─ Sucesso → salva primary + stale → retorna
  │   └─ Falha (network/HTTP error)
  │       ├─ Redis stale hit + fetchedAt ≤ 24h → retorna stale
  │       ├─ Redis stale hit + fetchedAt > 24h → descarta, throw Error
  │       └─ Stale miss → throw Error
```

Para rodadas encerradas (`finished`), a chave stale é permanente — o dado nunca expira. Isso garante que resultados históricos nunca desapareçam por indisponibilidade da CBF.

**Validação de staleness:** o dado de backup só é servido se foi buscado há menos de 24 horas (`STALE_MAX_AGE_MS`). Isso evita que uma indisponibilidade prolongada da CBF resulte em dados da semana anterior sendo exibidos silenciosamente para rodadas em andamento.

---

## Inferência de status da rodada (CBF)

O status é calculado a partir dos dados dos jogos retornados pela CBF:

```typescript
function inferRoundStatus(matches): 'finished' | 'live' | 'upcoming' {
  // live: algum jogo entre kickoff e kickoff + LIVE_WINDOW_MS (115min)
  // finished: todos os jogos têm placar
  // upcoming: nenhum ao vivo, algum sem placar
}
```

**`LIVE_WINDOW_MS`** = 115 minutos (90min + 25min buffer para VAR, paralisações, pênaltis)

Definido em `src/lib/matchConstants.ts` — single source of truth usado pelo `cbfApi.ts` (server) e `MatchSection.tsx` (client).

---

## Invalidação de cache

### Fixtures

O cache de fixtures não tem invalidação manual — expira naturalmente em 6h.

Para forçar refresh via endpoint de debug (apaga todas as 4 competições de uma vez):
```http
GET /api/debug/fixtures?bust=1
Authorization: Bearer <DEBUG_SECRET>
```

### CBF rounds

Rodadas ao vivo têm TTL de 5 min — invalidação implícita.

Para invalidação programática (não implementada via UI):
```typescript
// Sobrescreve com TTL de 1s para expirar imediatamente
await invalidateCbfRound(roundNumber);
```

---

## Aquecimento de cache (seed scripts)

Todo o cache é populado por demanda — a primeira requisição após expiração
faz o fetch upstream. Para eliminar cold-starts, execute o orquestrador antes
de deploys e a cada ~5 horas:

```bash
npm run seed:all          # aquece o que está frio
npm run seed:all -- --reset   # apaga tudo e re-popula do zero
```

Scripts individuais para controle granular:

```bash
npm run seed:cbf           # rodadas Brasileirão (permanente)
npm run seed:fixtures      # próximos jogos (TTL 6h)
npm run seed:form          # forma dos times (TTL 6h)
npm run seed:past-results  # histórico W/D/L (TTL 6h)
```

Ver documentação completa: [seed-all](../scripts/seed-all.md),
[seed-cbf](../scripts/seed-cbf.md),
[seed-fixtures](../scripts/seed-fixtures.md),
[seed-form](../scripts/seed-form.md),
[seed-past-results](../scripts/seed-past-results.md)

---

## Custo e eficiência

| API | Custo sem cache | Custo com cache |
|-----|----------------|----------------|
| API-Football | Por request (~1000/dia free tier) | ~1 req/6h por dado |
| Gemini | Por 1K tokens | ~1 req/24h por fixture |
| CBF | Sem custo (sem auth comercial) | ~1 req/5min (ao vivo) |
| CONMEBOL | Sem custo (API pública) | ~1 req/10min (pós-jogo) / 1 req/6h (outros) |
| Redis | Por request (Upstash free tier generoso) | — |

O cache de broadcasters (24h) é crítico: sem ele, cada carregamento de página chamaria o Gemini para cada jogo visível, esgotando quota rapidamente.
