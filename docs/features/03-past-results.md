# Funcionalidade: Resultados Passados

## O que faz

Exibe os resultados de partidas encerradas do clube selecionado em **todas as competições** usando um único card interativo (`MatchCard` no modo `finished`), com acesso completo à Ficha do Jogo (gols, escalação, árbitros, confronto direto, destaques da temporada).

A lista é mesclada de duas fontes e ordenada cronologicamente (mais recente primeiro).

---

## Fluxo do usuário

1. O usuário clica na aba **"Resultados"** no `MatchSection`.
2. Duas fontes são buscadas em paralelo:
   - **CBF** (`/api/past-fixtures`) — últimas 3 rodadas do Brasileirão do clube
   - **API-Football / CONMEBOL** (`/api/past-results`) — últimos jogos encerrados nas demais competições
3. Os resultados são mesclados e exibidos ordenados por data.
4. Todos os cards usam `MatchCard` no modo `finished` — com placar, badge V/D/E e botões de modal completos.
5. Pills de filtro (quando o clube participa de mais de uma competição) permitem focar em uma competição específica.

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
| `MatchCard` | `src/components/MatchCard.tsx` | Card unificado — modo `finished` para resultados, modo `upcoming` para próximos jogos |
| `cbfToMatch()` | dentro de `MatchSection.tsx` | Converte `CbfMatchDetail + round` → `Match` compatível com `MatchCard` |

> **Nota:** `ResultCard` e `SimpleResultCard` existem no codebase mas não são mais utilizados — substituídos pelo `MatchCard` unificado.

---

## Modo `finished` do `MatchCard`

Quando `match.status === 'finished'`, o `MatchCard` exibe:

- **Header:** badge V/D/E + round label
- **Times:** logos 48px, nomes, placar central (com indicador AET / pênaltis quando aplicável)
- **Data/local:** linha compacta (sem grid)
- **Sem:** broadcasters, form strip, árbitro inline
- **Botões:** Confronto, Jogadores, Ficha, Enviar — todos presentes e funcionais

### Ficha em modo finished — por competição

| Competição | Abertura da Ficha | Gols | Escalação | Cartões |
|---|---|---|---|---|
| Brasileirão | Instantânea (CBF pré-carregado) | ✓ CBF | ✓ CBF | ✓ CBF |
| Copa do Brasil | Fetch `/api/match-events` | ✓ API-Football | Desfalques | — |
| Libertadores (CONMEBOL + cross-ref) | Fetch `/api/match-events` | ✓ API-Football | Desfalques | — |
| Libertadores (sem cross-ref) | Imediato | Seção oculta | Desfalques | — |
| Sul-Americana (CONMEBOL + cross-ref) | Fetch `/api/match-events` | ✓ API-Football | Desfalques | — |

### Pré-carregamento de dados CBF (Brasileirão)

Para cards do Brasileirão na aba Resultados, o `CbfMatchDetail` já foi buscado por `/api/past-fixtures`. O `MatchSection` passa esse dado via prop `cbfMatchDetail` ao `MatchCard`, que o usa para inicializar `fichaData` e `fichaStatus = 'done'` — a Ficha abre instantaneamente sem fetch adicional.

---

## Merge de resultados

```typescript
type MergedResult =
  | { kind: 'cbf'; round: number; match: CbfMatchDetail; dateMs: number }
  | { kind: 'api'; match: Match; dateMs: number };
```

- Entradas CBF: data convertida de `"DD/MM/YYYY" + "HH:MM"` (UTC-3) para timestamp UTC via `cbfToMatch()`
- Entradas API-Football / CONMEBOL: data já em ISO 8601
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
| **Fonte primária** | CONMEBOL API — Libertadores e Sul-Americana para clubes com `conmebolId` |
| **Fonte secundária** | API-Football v3 — Copa do Brasil; fallback e cross-reference quando CONMEBOL é fonte primária |
| **Cache** | CONMEBOL: `conmebol:tournament:{id}` (TTL dinâmico); API-Football finished: `finished:{competition.id}:{teamApiId}` 6h |

**Resposta:**
```typescript
Match[]   // ordenados do mais recente para o mais antigo
```

**Enriquecimento CONMEBOL → API-Football (cross-reference):**

Para matches CONMEBOL, o `past-results` também busca os fixtures API-Football correspondentes e tenta fazer o cruzamento por data + times, adicionando os campos:

```typescript
apiFootballFixtureId?: number   // fixture ID da API-Football — necessário para /api/match-events
apiFootballHomeId?: number      // API-Football team ID do mandante
apiFootballAwayId?: number      // API-Football team ID do visitante
```

O cruzamento usa a chave `"YYYY-MM-DD:homeApiId:awayApiId"` com tolerância de ±1 dia (diferenças de fuso). Quando encontrado, a Ficha pode buscar gols via `/api/match-events`.

---

## Dados exibidos por fonte

### Brasileirão (CBF)

| Dado | Disponibilidade |
|------|----------------|
| Placar final | `cbfMatchDetail.mandante.gols` / `visitante.gols` |
| Gols (marcador, minuto) | Após publicação CBF |
| Cartões | Após publicação CBF |
| Escalação titular + banco | Após publicação CBF |
| Árbitros | Após publicação CBF |

### Outras competições (API-Football / CONMEBOL)

| Dado | Disponibilidade |
|------|----------------|
| Placar final | `match.score` |
| AET / pênaltis | `match.scoreDetail` (CONMEBOL source) |
| Agregado | `match.scoreDetail.aggregate` (CONMEBOL source) |
| Gols com autores | Quando `apiFootballFixtureId` disponível (cross-ref) |
| Badge V/D/E | `match.winner` (CONMEBOL) ou `match.score` (API-Football) |
| Indicador campo neutro | `match.isNeutralVenue` (CONMEBOL source) |

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
  │         ↓ filtra por cbfId do clube → cbfToMatch() → Match
  │    MatchCard(finished, cbfMatchDetail=...) × M
  │
  └─ GET /api/past-results?club=X                          [API-Football + CONMEBOL]
       ├─ getConmebolFinishedByTeam(Libertadores) → Redis → CONMEBOL API
       ├─ getConmebolFinishedByTeam(Sul-Americana) → ...
       ├─ getFinishedFixturesByClub(Copa do Brasil) → Redis → API-Football
       └─ cross-reference CONMEBOL ↔ API-Football por data+times
            ↓ enriquece com apiFootballFixtureId quando encontrado
       MatchCard(finished) × K
```
