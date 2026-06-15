# Design — "Onde assistir" para os jogos da Copa 2026

> Data: 2026-06-15
> Status: aprovado para planejamento

## Contexto

Os jogos normais (clube) mostram onde a partida será transmitida: o `MatchCard`
lê `preview.broadcasters` e renderiza badges + `BroadcasterModal`
(`MatchCard.tsx:1705, 2061`). Esse `preview` vem de `/api/previews`, que chama
`getBroadcastersForFixture()` (Gemini 2.5 + Google Search, cache Redis 24h).

Os jogos da **Copa 2026 não mostram transmissão** por dois motivos:
1. `CopaMatchRow` e o card de mata-mata renderizam `<MatchCard … previewLoading={false} />`
   **sem `preview`** → `broadcasters = []` → nada aparece.
2. `/api/previews` só monta seu mapa de fixtures a partir de competições
   `scope === 'club'`; a Copa é `scope: 'national'`, então nunca seria resolvida ali.

O motor `getBroadcastersForFixture(fixtureId, home, away, round, date, competitionName)`
já é **agnóstico de competição** e roda em **Gemini** (independente do risco da
chave API-Football). Falta apenas **buscar e alimentar** os dados para a Copa.
O `MatchCard` **não precisa mudar**.

## Decisões (brainstorming)

- **Escopo:** todos os 104 jogos da Copa.
- **Estratégia:** **híbrida** — pré-busca dos jogos numa janela próxima + busca
  sob demanda (ao expandir) para o resto.
- **Janela ansiosa:** **7 dias**.
- **Tweak do prompt:** **incluído** (generalizar "Brazilian football" → neutro).
- **Onde o badge aparece:** dentro do `MatchCard` expandido (igual aos jogos normais).

## Arquitetura / fluxo de dados

```
CopaMatchSection (carrega /api/copa/fixtures)
   │  calcula ids da janela (date ∈ [agora-graça, agora+7d])
   ├─► GET /api/copa/broadcasters?ids=<janela>  ──► broadcastersById (estado)
   │        (rota nova: resolve fixtures via getCopaFixtures() + Gemini + cache)
   │
   ├─ Grupos: CopaMatchRow recebe prefetchedBroadcasters?=broadcastersById[id]
   │     • se houver prefetch → passa preview pronto ao MatchCard
   │     • senão, ao EXPANDIR → GET /api/copa/broadcasters?ids=<id único>
   │
   └─ Mata-mata: MatchCard recebe preview de broadcastersById[id] (se na janela)
```

## A rota nova — `GET /api/copa/broadcasters`

**Arquivo:** `src/app/api/copa/broadcasters/route.ts`

**Contrato:**
- Query: `?ids=id1,id2,…` (vírgula). Vazio → `{}`.
- Resposta `200`: `{ [fixtureId: string]: BroadcasterInfo[] }`. IDs não encontrados
  nos fixtures da Copa são **omitidos** (não viram chamada Gemini).
- `Cache-Control: public, s-maxage=3600, stale-while-revalidate=300` (igual a `/api/previews`).

**Implementação:**
1. Parse + dedupe dos ids; **cap em 32** (limita rajada de Gemini; janela de 7d
   raramente passa disso, e o pedido sob demanda manda 1).
2. `const payload = await getCopaFixtures();` (já exportado em
   `src/app/api/copa/fixtures/route.ts`; cache + stale fallback embutidos).
   Achatar todos os jogos: `Object.values(payload.phases).flat()` → `Map<id, Match>`.
3. Para cada id pedido que existe no mapa, sob **semáforo (máx. 3 simultâneos)**:
   `getBroadcastersForFixture(m.id, m.homeTeam.name, m.awayTeam.name, m.round, m.date, 'Copa do Mundo 2026').catch(() => [])`.
   (O cache Redis `broadcasters:{id}` 24h é compartilhado com os jogos normais —
   se o id já foi buscado, retorna na hora.)
4. Retorna o `Record` com os resultados.

**DRY:** o helper `makeSemaphore` hoje vive dentro de `src/app/api/previews/route.ts`.
Extrair para `src/lib/semaphore.ts` e importar nas duas rotas (sem mudar comportamento).

## Mudanças por arquivo

| Arquivo | Mudança |
|---|---|
| `src/app/api/copa/broadcasters/route.ts` | **Novo.** Rota acima. |
| `src/lib/semaphore.ts` | **Novo.** `makeSemaphore(concurrency)` extraído de `previews/route.ts`. |
| `src/app/api/previews/route.ts` | Importar `makeSemaphore` do novo módulo (remove a cópia local). |
| `src/components/copa/CopaMatchSection.tsx` | Após carregar fixtures, calcular ids da janela (7d), buscar `/api/copa/broadcasters`, guardar `broadcastersById` em estado, e passá-lo para os `CopaMatchRow` (Grupos) e para os `MatchCard` de mata-mata (como `preview`). |
| `src/components/copa/CopaMatchRow.tsx` | Nova prop `prefetchedBroadcasters?: BroadcasterInfo[]`. Estado local `broadcasters` + `loading`. Ao expandir sem prefetch, `fetch('/api/copa/broadcasters?ids='+match.id)`. Passa `preview={{ broadcasters, homeForm: [], awayForm: [] }}` e `previewLoading={loading}` ao `MatchCard`. |
| `src/lib/broadcasterSearch.ts` | Tweak do `buildSystemPrompt`: trocar "for Brazilian football" por redação neutra (ex.: "para partidas de futebol transmitidas no Brasil"). Assinatura e cache inalterados. |
| `src/components/MatchCard.tsx` | **Sem mudança.** |

### Detalhe — janela ansiosa (CopaMatchSection)
Após `setPayload`, achatar todos os jogos das fases, filtrar
`date ∈ [agora - LIVE_WINDOW_MS, agora + 7d]`, coletar os ids (cap 32) e disparar
um único fetch. Resultado em `broadcastersById: Record<string, BroadcasterInfo[]>`.
Falha de rede → fica vazio (cada card cai no caminho sob demanda ao expandir).

### Detalhe — CopaMatchRow sob demanda
- `prefetchedBroadcasters` presente → usa direto, sem fetch.
- Ausente: no **primeiro** expand, busca o id único (guard com `useRef` para não
  refazer), mostra `previewLoading` (spinner que o `MatchCard` já tem) e preenche.

## Casos de borda

- **Sem form (seleções):** o `MatchCard` só renderiza form se
  `homeForm.length > 0 || awayForm.length > 0` (`MatchCard.tsx:318`). Preview com
  form vazio → form não aparece (correto; form de Série A não faz sentido p/ seleção).
- **Transmissão não confirmada:** engine retorna `[]` → `MatchCard` mostra o estado
  vazio que já existe (`MatchCard.tsx:2069`). Comum em jogos distantes.
- **Mata-mata distante (times "a definir"):** fora da janela → sem prefetch e o card
  é sempre aberto (sem trigger de expand) → mostra estado vazio. Aceitável (transmissão
  não confirmada com times indefinidos).
- **Gemini 429/quota:** já tratado no engine (retorna `[]`, cache curto).
- **Abuso:** ids restritos a fixtures reais da Copa (lookup via `getCopaFixtures`);
  ids desconhecidos são omitidos antes de qualquer chamada Gemini.

## Custo e risco

- Roda em **Gemini** (não na chave API-Football). Janela 7d + cap 32 + cache 24h +
  semáforo controlam o custo. Sob demanda paga só pelo que o usuário abre.
- **Sem libs novas, sem mudança de schema, sem ADR.** Segue os pontos de extensão do
  `CLAUDE.md` (nova rota em `src/app/api/<feature>/route.ts`).

## Testes

- **Unit (vitest):** rota `/api/copa/broadcasters` — mockar `getCopaFixtures` e
  `getBroadcastersForFixture`; verificar que (a) ids reais retornam broadcasters,
  (b) ids desconhecidos são omitidos sem chamar o engine, (c) `ids` vazio → `{}`.
- **Manual:** abrir `/copa-2026`; expandir um jogo dentro de 7 dias → badge já
  presente (sem spinner); expandir um jogo distante → spinner → badge ou estado vazio;
  confirmar que `BroadcasterModal` abre ao clicar no badge.
- `npm run lint`, `npm run build`, `npm run test:unit` passam.

## Fora de escopo

- Badge na linha **fechada** do `CopaMatchRow` (só no card expandido).
- Rate limiting da rota nova (a `/api/previews` também não tem; follow-up se necessário).
- Transmissão para mata-mata com times ainda indefinidos.
