# Catálogo de Chaves Redis

Todas as chaves utilizadas no Upstash Redis, com formato, TTL e dados armazenados.

---

## Fixtures & Calendário (Próximos Jogos)

Uma chave por competição — dados brutos da API-Football antes do merge por clube.

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `fixtures:serie-a` | 6h | JSON | `ApiFixtureItem[]` — fixtures da Série A |
| `fixtures:libertadores` | 6h | JSON | `ApiFixtureItem[]` — fixtures da Libertadores |
| `fixtures:copa-brasil` | 6h | JSON | `ApiFixtureItem[]` — fixtures da Copa do Brasil |
| `fixtures:sul-americana` | 6h | JSON | `ApiFixtureItem[]` — fixtures da Sul-Americana |

**Nota:** O merge por clube e a deduplicação por fixture ID acontecem em `/api/fixtures` em runtime — não são cacheados no Redis.

---

## Resultados de Outras Competições (Jogos Encerrados)

Uma chave por par competição+time.

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `finished:{competition.id}:{teamApiId}` | 6h | JSON | `ApiFixtureItem[]` — últimos 5 jogos encerrados |

**Exemplos:**
- `finished:libertadores:127` — últimos jogos do Flamengo (id 127) na Libertadores
- `finished:copa-brasil:134` — últimos jogos do Athletico (id 134) na Copa do Brasil

---

## Classificação

Chave usa `leagueId` numérico (não o slug), sufixo `:v2`.

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `standings:71:v2` | 30min–3h | JSON | `StandingsPayload` — Brasileirão Série A |
| `standings:13:v2` | 3h | JSON | `StandingsPayload` — Copa Libertadores |
| `standings:11:v2` | 3h | JSON | `StandingsPayload` — Copa Sul-Americana |

TTL dinâmico (apenas Série A / leagueId 71): 30min durante janela de jogos (qua–dom), 3h no restante.

**Nota:** Copa do Brasil (73) é formato mata-mata sem standings tradicionais — não é exibida no modal de classificação.

---

## Broadcasters

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `broadcasters:{fixtureId}` | 24h / 1h | JSON | `string[]` — nomes dos canais |

TTL 24h quando canais encontrados; 1h quando array vazio (não publicado ainda).

---

## Dados de Times (API-Football)

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `form:{teamId}:71:{season}` | 6h | string | Form bruta da Série A, ex: `"WDLWW"` |
| `h2h:{min}-{max}` | 6h | JSON | `RawH2HFixture[]` — últimos 10 confrontos (cross-competition) |
| `injuries:v2:{fixtureId}` | 3h | JSON | `RawInjury[]` — lesionados do fixture específico |
| `players:{homeId}:{awayId}` | 24h | JSON | `{ home: PlayerStat[], away: PlayerStat[] }` |

**Notas:**
- `form` sempre usa `leagueId=71` — form unificada independente da competição do jogo
- `h2h` usa `min(homeId, awayId)-max(homeId, awayId)` para garantir a mesma chave independente de quem é mandante
- `injuries` é por `fixtureId` (não por time) — garante lesionados do jogo específico

---

## Rodadas CBF (Série A — Resultados Oficiais)

Cada rodada usa **duas chaves** — primária (TTL variável) e stale (backup/permanente).

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `cbf:round:{N}` | Variável (ver abaixo) | JSON | `CbfRoundData` |
| `cbf:round:{N}:stale` | Permanente (finished) / 30d | JSON | `CbfRoundData` — backup |

### TTL da chave primária `cbf:round:{N}`

| Status da rodada | TTL |
|-----------------|-----|
| `finished` | 30 dias |
| `live` | 5 minutos |
| `post_match` (encerrou, CBF não publicou) | 10 minutos |
| `upcoming` > 48h | 12 horas |
| `upcoming` > 24h | 6 horas |
| `upcoming` > 12h | 2 horas |
| `upcoming` ≤ 12h | 1 hora |

### TTL da chave stale `cbf:round:{N}:stale`

| Status quando gravado | TTL |
|----------------------|-----|
| `finished` | **Permanente (sem TTL)** |
| Qualquer outro | 30 dias |

A chave stale permanente garante que rodadas encerradas nunca desapareçam por falha da CBF API.

---

## Identidade de Usuário

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `identity:{uuid}` | 365 dias | JSON | `UserIdentity` — email, emailHash, ip, timestamps |

---

## Sugestões

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `suggestions` | Sem TTL (permanente) | Lista Redis | Strings `"{iso_date} | {ip} | {text}"` |

---

## Rate Limiting (Upstash Ratelimit)

O Upstash Ratelimit gerencia suas próprias chaves internamente sob o prefixo `@upstash/ratelimit`. Não manipular diretamente.

---

## Comandos úteis (Upstash console / redis-cli)

```bash
# Ver todas as chaves de fixtures
KEYS fixtures:*

# Ver chaves de resultados encerrados
KEYS finished:*

# Forçar expiração de um fixture (TTL de 1s)
EXPIRE fixtures:serie-a 1

# Ver todas as chaves CBF
KEYS cbf:round:*

# Checar TTL de uma chave
TTL cbf:round:10

# Checar TTL de stale (-1 = permanente, -2 = não existe)
TTL cbf:round:10:stale

# Ver sugestões recebidas
LRANGE suggestions 0 -1

# Contar sugestões
LLEN suggestions
```
