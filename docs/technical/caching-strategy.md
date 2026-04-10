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

Uma chave por competição — armazenam a resposta bruta da API, antes do merge por clube.

| Dado | Chave Redis | TTL |
|------|-------------|-----|
| Fixtures Série A | `fixtures:serie-a` | 6 horas |
| Fixtures Libertadores | `fixtures:libertadores` | 6 horas |
| Fixtures Copa do Brasil | `fixtures:copa-brasil` | 6 horas |
| Fixtures Sul-Americana | `fixtures:sul-americana` | 6 horas |

### Resultados encerrados (API-Football)

| Dado | Chave Redis | TTL |
|------|-------------|-----|
| Últimos 5 jogos por competição+time | `finished:{competition.id}:{teamApiId}` | 6 horas |

Placares encerrados são imutáveis após ~2h de finalização. TTL de 6h evita chamadas redundantes à API sem impacto na frescor dos dados exibidos.

### Outros dados de times

| Dado | Chave Redis | TTL |
|------|-------------|-----|
| Form do time (Série A) | `form:{teamId}:71:{season}` | 6 horas |
| H2H entre dois times | `h2h:{min}-{max}` | 6 horas |
| Lesionados por fixture | `injuries:v2:{fixtureId}` | 3 horas |
| Jogadores (artilheiros) | `players:{homeId}:{awayId}` | 24 horas |

Form sempre usa `leagueId=71` — unificada por decisão de performance (evita 4× calls por competição).
H2H usa `min(homeId,awayId)-max(homeId,awayId)` — independente de quem é mandante.

### Classificação (API-Football)

Chave usa `leagueId` numérico com sufixo `:v2`.

| Período | Chave Redis | TTL |
|---------|-------------|-----|
| Janela de jogos (qua–dom) | `standings:71:v2` | 30 minutos |
| Fora da janela (seg–ter) | `standings:71:v2` | 3 horas |
| Libertadores / Sul-Americana | `standings:{leagueId}:v2` | 3 horas |

A janela de jogos considera que a maioria das rodadas ocorre de quarta a domingo.

### Broadcasters (Gemini + Google Search)

| Situação | Chave Redis | TTL |
|----------|-------------|-----|
| Canais encontrados | `broadcasters:{fixtureId}` | 24 horas |
| Sem canais (não publicado) | `broadcasters:{fixtureId}` | 1 hora |

O TTL mais curto quando sem canais permite retry frequente até a grade ser publicada.

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

## Stale-while-error (CBF)

Se a CBF API falhar (erro de rede ou HTTP não-2xx), o sistema cai automaticamente para a chave `:stale`:

```
getCbfRound(round)
  ├─ Redis primary hit → retorna
  ├─ Primary miss → fetch CBF API
  │   ├─ Sucesso → salva primary + stale → retorna
  │   └─ Falha (network/HTTP error)
  │       ├─ Redis stale hit → retorna stale (dado antigo)
  │       └─ Stale miss → throw Error
```

Para rodadas encerradas (`finished`), a chave stale é permanente — o dado nunca expira. Isso garante que resultados históricos nunca desapareçam por indisponibilidade da CBF.

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
```
GET /api/debug/fixtures?secret=<SECRET>&bust=1
```

### CBF rounds

Rodadas ao vivo têm TTL de 5 min — invalidação implícita.

Para invalidação programática (não implementada via UI):
```typescript
// Sobrescreve com TTL de 1s para expirar imediatamente
await invalidateCbfRound(roundNumber);
```

---

## Seed manual de rodadas encerradas

O script `seed-cbf.ts` permite pré-popular o Redis com rodadas finalizadas:
```bash
npm run seed:cbf
npm run seed:cbf -- --round=10
npm run seed:cbf -- --force
```

Isso garante o fallback permanente mesmo antes de uma rodada ser requisitada organicamente pela aplicação.

Ver: [Script seed-cbf](../scripts/seed-cbf.md)

---

## Custo e eficiência

| API | Custo sem cache | Custo com cache |
|-----|----------------|----------------|
| API-Football | Por request (~1000/dia free tier) | ~1 req/6h por dado |
| Gemini | Por 1K tokens | ~1 req/24h por fixture |
| CBF | Sem custo (sem auth comercial) | ~1 req/5min (ao vivo) |
| Redis | Por request (Upstash free tier generoso) | — |

O cache de broadcasters (24h) é crítico: sem ele, cada carregamento de página chamaria o Gemini para cada jogo visível, esgotando quota rapidamente.
