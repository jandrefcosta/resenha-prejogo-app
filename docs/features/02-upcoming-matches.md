# Funcionalidade: Próximos Jogos

## O que faz

Exibe o calendário de partidas dos próximos 90 dias do Campeonato Brasileiro Série A, com foco no clube selecionado. Cada jogo mostra data, horário, estádio, transmissão, forma dos times e histórico de confrontos.

---

## Fluxo do usuário

1. A página carrega e busca automaticamente todos os fixtures da Série A.
2. Os jogos são exibidos na aba **"Próximos Jogos"** do `MatchSection`, agrupados por rodada.
3. A rodada atual é destacada com o badge **"Rodada Atual"** (independente da paleta do clube).
4. O usuário pode expandir cada `MatchCard` para ver mais detalhes (form, H2H, transmissão).
5. Jogos do clube selecionado recebem destaque visual (borda + highlight).

---

## Componentes

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `MatchSection` | `src/components/MatchSection.tsx` | Gerencia abas, fetching, agrupamento por rodada, "Rodada Atual" |
| `MatchCard` | `src/components/MatchCard.tsx` | Card individual de cada jogo com todos os detalhes expansíveis |

---

## API Endpoints envolvidos

### `GET /api/fixtures`

Retorna todos os fixtures da Série A para os próximos 90 dias.

- **Fonte:** API-Football v3
- **Cache:** `unstable_cache` (processo) + Redis 6h
- **Chave Redis:** `fixtures:serie-a`
- **Resposta:** `Match[]` — array de partidas

### `GET /api/previews?ids=id1,id2,...`

Batch fetch de dados de preview para múltiplos jogos.

- **Fonte:** API-Football (form) + Gemini (broadcasters)
- **Cache:** por fixture ID no Redis
- **Resposta:** `Record<string, MatchPreview>` — mapa fixtureId → { homeForm, awayForm, broadcasters }

### `GET /api/h2h?home=X&away=Y`

Head-to-head entre os dois times (chamado on-demand ao expandir o card).

- **Fonte:** API-Football
- **Cache:** Redis 6h
- **Resposta:** `H2HData` — stats, últimas partidas, lesionados

---

## Dados exibidos por jogo (MatchCard)

| Dado | Fonte | Disponibilidade |
|------|-------|----------------|
| Data e hora | API-Football | Sempre |
| Estádio e cidade | API-Football | Sempre |
| Transmissão | Gemini + Google | Depende de publicação (até 14 dias antes) |
| Forma (últimos 5) | API-Football | Sempre |
| H2H | API-Football | On-demand ao expandir |
| Lesionados | API-Football | On-demand ao expandir |
| Árbitro | CBF / API-Football | Pré-match (≤48h) |

---

## Rodada Atual

- Determinada pelo menor número de rodada entre os fixtures futuros.
- Fallback: `lastKnownRound` salvo no `localStorage` — usado quando todos os jogos da rodada atual já aconteceram e a API retorna lista vazia (entre rodadas).
- Badge "Rodada Atual" usa `bg-white text-zinc-900` para garantir legibilidade independente da paleta do clube.

---

## Filtros aplicados

- Apenas jogos com status `NS` (Not Started) ou equivalente — descarta encerrados e adiados
- Janela de 90 dias a partir de hoje
- Apenas Campeonato Brasileiro Série A

---

## Dados de preview em batch

Para evitar N+1 requests, o `MatchSection` coleta todos os IDs visíveis e faz um único `GET /api/previews?ids=...`. O endpoint internamente paraleliza as buscas de form e broadcasters por jogo.

---

## Estado de carregamento

- Skeleton placeholder durante o fetch inicial de fixtures
- Preview (form/broadcasters) carregado separadamente — o card renderiza com dados parciais e os completa progressivamente

---

## Arquitetura

```
MatchSection
  ├─ GET /api/fixtures (once, on mount)
  │    └─ [unstable_cache + Redis 6h] → API-Football
  │
  ├─ GET /api/previews?ids=... (once, after fixtures loaded)
  │    ├─ getTeamForm() × N [Redis 6h] → API-Football
  │    └─ getBroadcastersForFixture() × N [Redis 24h/1h] → Gemini
  │
  └─ MatchCard × N
       └─ GET /api/h2h?home=X&away=Y (on expand, lazy)
            └─ [Redis 6h] → API-Football
```
