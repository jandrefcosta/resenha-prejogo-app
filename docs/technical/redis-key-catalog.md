# Catálogo de Chaves Redis

Todas as chaves utilizadas no Upstash Redis, com formato, TTL e dados armazenados.

---

## Fixtures & Calendário (Próximos Jogos)

Uma chave por competição+temporada — dados brutos da API-Football antes do merge por clube.

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `fixtures:serie-a:{season}` | 6h | JSON | `ApiFixtureItem[]` — fixtures da Série A |
| `fixtures:libertadores:{season}` | 6h | JSON | `ApiFixtureItem[]` — fixtures da Libertadores |
| `fixtures:copa-brasil:{season}` | 6h | JSON | `ApiFixtureItem[]` — fixtures da Copa do Brasil |
| `fixtures:sul-americana:{season}` | 6h | JSON | `ApiFixtureItem[]` — fixtures da Sul-Americana |

**Exemplo:** `fixtures:serie-a:2026`

**Nota:** O campo `{season}` garante que na virada de temporada os dados do ano anterior não sejam reutilizados. O merge por clube e a deduplicação por fixture ID acontecem em `/api/fixtures` em runtime — não são cacheados no Redis.

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

O `StandingsPayload` armazenado inclui o campo `ttlSeconds` com o valor calculado no momento da escrita. Cache hits reutilizam esse valor para o `Cache-Control`, garantindo consistência entre leituras concorrentes.

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
| `form:{teamId}:{leagueId}:{season}` | 6h | string | Form bruta do time na competição, ex: `"WDLWW"` |
| `h2h:{min}-{max}:{leagueId}` | 6h | JSON | `RawH2HFixture[]` — últimos 10 confrontos na competição |
| `injuries:v2:{fixtureId}` | 3h | JSON | `RawInjury[]` — lesionados do fixture específico |
| `players:v2:{teamId}:{leagueId}:{season}` | 24h | JSON | `PlayerStat[]` — top 6 do time na competição |

**Exemplos:**
- `form:127:71:2026` — form do Flamengo (127) na Série A (71) em 2026
- `form:127:13:2026` — form do Flamengo (127) na Libertadores (13) em 2026
- `h2h:127-134:71` — H2H Flamengo×Athletico na Série A
- `h2h:127-134:13` — H2H Flamengo×Athletico na Libertadores
- `players:v2:127:13:2026` — artilheiros do Flamengo na Libertadores em 2026

**Notas:**
- `form` e `players` usam `leagueId` da competição do jogo — cada campeonato tem entrada independente no cache
- `h2h` usa `min(homeId, awayId)-max(homeId, awayId):{leagueId}` — mesma chave independente de quem é mandante, isolada por competição
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

## Torneios CONMEBOL (Libertadores & Sul-Americana)

Cada torneio usa **duas chaves** — primária (TTL dinâmico) e stale (backup, 6h).

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `conmebol:tournament:{id}` | 5min–6h | JSON | `ConmebolTournamentData` — todos os jogos do torneio |
| `conmebol:tournament:{id}:stale` | 6h | JSON | `ConmebolTournamentData` — backup para falhas de API |

### IDs de torneio

| Competição | ID |
|---|---|
| Libertadores | `15` |
| Sul-Americana | `104` |

**Exemplos:**
- `conmebol:tournament:15` — Libertadores (primária)
- `conmebol:tournament:15:stale` — Libertadores (backup)
- `conmebol:tournament:104` — Sul-Americana (primária)

### TTL da chave primária

| Status inferido | TTL | Condição |
|----------------|-----|----------|
| `live` | 5 min | `isLive` ou dentro de kickoff + 115 min |
| `post-match` | 10 min | Kickoff + 115 min até kickoff + 150 min |
| `finished` | 6 h | Todos os jogos `Played` |
| `upcoming` | 6 h | Nenhum ao vivo, nenhum recém-encerrado |

**Nota:** `ConmebolTournamentData` contém todos os jogos do torneio. A filtragem por time (`getConmebolFinishedByTeam`) é feita em memória — não há chave Redis por time.

## Documentos Oficiais CBF (Série A — jogos encerrados)

Três chaves por jogo. Preenchidas pelo `processMatchDocuments` (lazy, na primeira abertura da ficha) ou pelo seed `npm run seed:match-docs`.

| Chave | TTL | Tipo | Conteúdo |
|-------|-----|------|---------|
| `cbf:match:{idJogo}:docs:status` | Permanente (found) / 2h (not found) | JSON | `CbfDocStatus` — sentinela com URLs resolvidas e timestamp |
| `cbf:match:{idJogo}:sumula` | Permanente | JSON | `CbfSumulaData` — escalação, substituições, árbitros, gols, cartões |
| `cbf:match:{idJogo}:boletim` | Permanente | JSON | `CbfBoletimData` — público e renda (valores always null — PDF image-based) |

**Nota:** `idJogo` é o ID do jogo na CBF API (ex: `831889`), não o ID do documento PDF (ex: `1421`). A resolução de URL mapeia um para o outro via `match.documentos[]` ou HEAD-test de URLs construídas.

**Nota:** O boletim financeiro da CBF é gerado como PDF image-based (sem camada de texto). O parser retorna sempre nulos em `publico` e `renda`. A funcionalidade está presente mas incompleta — aguardando solução de OCR.

**Volume (Série A 2026):** ~90 chaves por tipo após seed completo da temporada.

### Comandos úteis

```bash
# Ver todas as chaves de documentos
KEYS cbf:match:*

# Contar súmulas cacheadas
KEYS cbf:match:*:sumula | wc -l

# Checar sentinela de um jogo
GET cbf:match:831889:docs:status

# Invalidar documentos de um jogo (força re-parse)
DEL cbf:match:831889:docs:status cbf:match:831889:sumula cbf:match:831889:boletim
```

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
# Ver todas as chaves de fixtures (agora incluem o ano)
KEYS fixtures:*

# Exemplo: expirar fixtures da Série A 2026
EXPIRE fixtures:serie-a:2026 1

# Ver chaves de resultados encerrados
KEYS finished:*

# Ver chaves de H2H (agora incluem leagueId)
KEYS h2h:*

# Ver chaves de form por competição
KEYS form:*

# Ver chaves de jogadores por competição
KEYS players:v2:*

# Ver todas as chaves CONMEBOL
KEYS conmebol:tournament:*

# Expirar torneio imediatamente (força re-fetch)
EXPIRE conmebol:tournament:15 1

# Ver todas as chaves CBF
KEYS cbf:round:*

# Checar TTL de uma chave
TTL cbf:round:10

# Checar TTL de stale (-1 = permanente, -2 = não existe)
TTL cbf:round:10:stale

# Ver chaves de documentos oficiais
KEYS cbf:match:*

# Invalidar documentos de um jogo específico
DEL cbf:match:831889:docs:status cbf:match:831889:sumula cbf:match:831889:boletim

# Ver sugestões recebidas
LRANGE suggestions 0 -1

# Contar sugestões
LLEN suggestions
```
