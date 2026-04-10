# Funcionalidade: Resultados Passados

## O que faz

Exibe os resultados de partidas encerradas do clube selecionado em **todas as competições**: dados oficiais da CBF para o Brasileirão Série A (placar, gols, cartões, escalações, árbitros) e dados básicos da API-Football para as demais competições (Libertadores, Copa do Brasil, Sul-Americana).

A lista é mesclada e ordenada cronologicamente (mais recente primeiro).

---

## Fluxo do usuário

1. O usuário clica na aba **"Resultados"** no `MatchSection`.
2. Duas fontes são buscadas em paralelo:
   - **CBF** (`/api/past-fixtures`) — últimas 3 rodadas do Brasileirão do clube
   - **API-Football** (`/api/past-results`) — últimos jogos encerrados nas demais competições
3. Os resultados são mesclados e exibidos ordenados por data.
4. Para resultados do Brasileirão: card `ResultCard` com dados oficiais completos e botão "Ficha".
5. Para resultados das demais competições: card `SimpleResultCard` com placar, data e estádio.
6. Pills de filtro (quando o clube participa de mais de uma competição) permitem focar em uma competição específica.

---

## Filtros de competição (pills)

Os pills são **unificados** com a aba "Próximos Jogos" — derivados da união de competições futuras + históricas. O filtro persiste ao trocar de aba.

- Série A (71): incluso quando há dados CBF disponíveis
- Outras competições: incluídas quando `otherResults` contém pelo menos um jogo de cada

---

## Componentes

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `MatchSection` | `src/components/MatchSection.tsx` | Gerencia aba Resultados, merge CBF + API-Football, pills de filtro |
| `ResultCard` | `src/components/ResultCard.tsx` | Card de resultado do Brasileirão (dados CBF completos) |
| `SimpleResultCard` | `src/components/SimpleResultCard.tsx` | Card de resultado de outras competições (dados API-Football) |
| `FichaResultModal` | dentro de `ResultCard.tsx` | Modal com escalação, substituições e árbitros (Série A only) |

---

## Merge de resultados

```typescript
type MergedResult =
  | { kind: 'cbf'; round: number; match: CbfMatchDetail; dateMs: number }
  | { kind: 'api'; match: Match; dateMs: number };
```

- Entradas CBF: data convertida de `"DD/MM/YYYY" + "HH:MM"` para timestamp UTC
- Entradas API-Football: data já em ISO 8601
- Lista final ordenada por `dateMs` decrescente (mais recente primeiro)

---

## API Endpoints envolvidos

### `GET /api/past-fixtures?club=<slug>&beforeRound=<N>&limit=<3>`

Resultados das últimas rodadas do **Brasileirão** para o clube (fonte CBF).

| Parâmetro | Descrição |
|-----------|-----------|
| `club` | Slug do clube (ex: `flamengo`) |
| `beforeRound` | Busca rodadas anteriores a este número |
| `limit` | Quantas rodadas retornar (padrão: 3) |

**Cache:** Estratégia CBF — ver [Estratégia de Cache](../technical/caching-strategy.md).

**Resposta:**
```typescript
Array<{ round: number; match: CbfMatchDetail }>
```

---

### `GET /api/past-results?club=<slug>`

Últimos jogos encerrados do clube nas **outras competições** (Libertadores, Copa do Brasil, Sul-Americana).

| | |
|-|-|
| **Fonte** | API-Football v3 — `?last=5` por competição+time, em paralelo |
| **Cache** | Redis `finished:{competition.id}:{teamApiId}` — 30 min |

**Resposta:**
```typescript
Match[]   // ordenados do mais recente para o mais antigo
```

---

## Dados exibidos por card

### `ResultCard` (Brasileirão — CBF)

| Dado | Disponibilidade |
|------|----------------|
| Placar final | Após encerramento |
| Gols (marcador, minuto, tipo) | Após publicação CBF |
| Cartões (tipo, jogador, minuto) | Após publicação CBF |
| Escalação titular + banco | Após publicação CBF |
| Substituições | Após publicação CBF |
| Árbitros | Após publicação CBF |

### `SimpleResultCard` (demais competições — API-Football)

| Dado | Disponibilidade |
|------|----------------|
| Placar final | Após encerramento |
| Competição e rodada | Sempre |
| Data e estádio | Sempre |
| Indicador W/D/L | Quando há placar e clube destacado |

---

## Estratégia de cache (Série A / CBF)

Rodadas com status `finished` são **imutáveis** após publicação.

- **Chave primária:** `cbf:round:{N}` — TTL 30 dias
- **Chave stale (permanente):** `cbf:round:{N}:stale` — sem TTL
- **Stale-while-error:** se a CBF API falhar, o fallback stale é servido automaticamente

---

## Sincronização com a rodada atual

A paginação de resultados usa `beforeRound` = número da rodada atual, que é:
1. Calculado a partir dos fixtures futuros (menor rodada entre jogos agendados)
2. Salvo em `localStorage` como `lastKnownRound` — persiste entre rodadas quando a API retorna lista vazia

---

## Arquitetura

```
MatchSection (aba Resultados)
  ├─ GET /api/past-fixtures?club=X&beforeRound=N&limit=3   [CBF]
  │    ├─ getCbfRound(N-1) → Redis [primary] → Redis [stale] → CBF API
  │    ├─ getCbfRound(N-2) → ...
  │    └─ getCbfRound(N-3) → ...
  │         ↓ filtra por cbfId do clube
  │    ResultCard × M
  │
  └─ GET /api/past-results?club=X                          [API-Football]
       ├─ getFinishedFixturesByClub(Libertadores) → Redis → API-Football
       ├─ getFinishedFixturesByClub(Copa do Brasil) → ...
       └─ getFinishedFixturesByClub(Sul-Americana) → ...
            ↓ merge + sort por data
       SimpleResultCard × K
```
