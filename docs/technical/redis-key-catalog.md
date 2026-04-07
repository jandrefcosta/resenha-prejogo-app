# Catálogo de Chaves Redis

Todas as chaves utilizadas no Upstash Redis, com formato, TTL e dados armazenados.

---

## Fixtures & Calendário

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `fixtures:serie-a` | 6h | JSON | `Match[]` — todos os fixtures da Série A |

---

## Classificação

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `standings:serie-a` | 30min–3h | JSON | `StandingEntry[]` — tabela da Série A |

TTL dinâmico: 30min durante janela de jogos (qua–dom), 3h no restante.

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
| `form:{teamId}` | 6h | JSON | `string[]` — últimos 5 resultados `['W','D','L',...]` |
| `h2h:{homeId}:{awayId}` | 6h | JSON | `H2HData` — stats, partidas, lesionados |
| `injuries:{teamId}` | 3h | JSON | `InjuredPlayer[]` |
| `players:{homeId}:{awayId}` | 24h | JSON | `{ home: PlayerStat[], away: PlayerStat[] }` |

---

## Rodadas CBF

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
# Ver todas as chaves CBF
KEYS cbf:round:*

# Ver chaves stale permanentes
KEYS cbf:round:*:stale

# Checar TTL de uma chave
TTL cbf:round:10

# Checar TTL de stale (-1 = permanente, -2 = não existe)
TTL cbf:round:10:stale

# Ver sugestões recebidas
LRANGE suggestions 0 -1

# Contar sugestões
LLEN suggestions

# Ver dados de classificação
GET standings:serie-a

# Forçar expiração de fixtures (TTL de 1s)
EXPIRE fixtures:serie-a 1
```
