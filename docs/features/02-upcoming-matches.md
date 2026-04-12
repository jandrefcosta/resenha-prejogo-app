# Funcionalidade: Próximos Jogos

## O que faz

Exibe o calendário de partidas dos próximos 90 dias em todas as competições de clube (Brasileirão Série A, Copa Libertadores, Copa do Brasil, Copa Sul-Americana), com foco no clube selecionado. Cada jogo mostra data, horário, estádio, transmissão, forma dos times e histórico de confrontos.

---

## Fluxo do usuário

1. A página carrega e busca automaticamente todos os fixtures das 4 competições de clube.
2. Os jogos são exibidos na aba **"Próximos Jogos"** do `MatchSection`, agrupados por competição e rodada.
3. Quando o clube participa de mais de uma competição, **pills de filtro** aparecem acima dos cards — "Todos", "Brasileirão", "Libertadores" etc.
4. A rodada/fase mais próxima é destacada com o badge **"Próximo"**.
5. O usuário pode expandir cada `MatchCard` para ver mais detalhes (form, H2H, transmissão).
6. Jogos do clube selecionado recebem destaque visual (borda + highlight).

---

## Filtros de competição (pills)

- Pills unificados: derivados da **união** de competições com jogos futuros + competições com histórico de resultados.
- Exibidos em ambas as abas ("Próximos Jogos" e "Resultados") com o mesmo conjunto de pills.
- O filtro selecionado **persiste ao trocar de aba** — permite comparar o mesmo campeonato nos dois contextos.
- "Todos" mostra todas as competições; clicar num pill filtra por competição específica.
- Em modo "Todos", grupos de jogos de fora da Série A recebem prefixo com o nome da competição.

---

## Componentes

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `MatchSection` | `src/components/MatchSection.tsx` | Gerencia abas, fetching, agrupamento por rodada, pills de filtro |
| `MatchCard` | `src/components/MatchCard.tsx` | Card individual de cada jogo com todos os detalhes expansíveis |

---

## API Endpoints envolvidos

### `GET /api/fixtures`

Retorna todos os fixtures das 4 competições de clube para os próximos 90 dias, agrupados por slug de clube.

- **Fonte:** API-Football v3 — 4 chamadas em paralelo (`Promise.allSettled`)
- **Cache:** `unstable_cache` 6h + Redis `fixtures:{competition.id}` 6h por competição
- **Resposta:** `Record<string, Match[]>` — slug do clube → jogos ordenados por data

### `GET /api/previews?ids=id1,id2,...`

Batch fetch de dados de preview para múltiplos jogos (form + broadcasters).

- **Fonte:** API-Football (form) + Gemini (broadcasters)
- **Capacidade:** até 20 IDs por chamada (expandido de 10 para suportar múltiplas competições)
- **Resposta:** `Record<string, MatchPreview>` — fixtureId → `{ homeForm, awayForm, broadcasters }`

### `GET /api/h2h?home=X&away=Y`

Head-to-head entre os dois times — chamado on-demand ao expandir o card.

- **Fonte:** API-Football
- **Cache:** Redis `h2h:{min}-{max}` 6h (chave unificada, sem leagueId)
- **Resposta:** `H2HData`

---

## Dados exibidos por jogo (MatchCard)

| Dado | Fonte | Disponibilidade |
|------|-------|----------------|
| Data e hora | API-Football | Sempre |
| Estádio e cidade | API-Football | Sempre ("indisponível" em itálico se nulo) |
| Transmissão | Gemini + Google | Depende de publicação (até 14 dias antes) |
| Forma (últimos 5) | API-Football | Sempre ("forma indisponível" se sem dados) |
| H2H | API-Football | On-demand ao expandir |
| Desfalques | API-Football | On-demand (via Ficha/H2H); suprimidos pós-jogo se vazios |
| Árbitro (Série A) | CBF | Pré-match (≤48h); "a confirmar" se ainda não publicado |

---

## Botão "Ficha" por competição

O hint abaixo do botão "Ficha" varia conforme a competição:

| Competição | Ao vivo | Pós-jogo | ≤48h | >48h |
|-----------|---------|---------|------|------|
| Série A | "Ao vivo" | "Resultado" | "Árbitro" | "48h antes" |
| Outras | "Ao vivo" | "Resultado" | "Lesões" | "Lesões" |

Para jogos fora da Série A, a Ficha exibe placar (se disponível) + lesionados — sem escalação ou árbitros, que são exclusivos da CBF.

---

## Rodada Atual / Próximo

- Determinada pelo primeiro grupo de fixtures futuros (menor data entre os agendados).
- Fallback: `lastKnownRound` salvo no `localStorage` — mantém a aba "Resultados" visível mesmo entre rodadas.
- Badge "Próximo" usa `bg-white text-zinc-900` para garantir legibilidade independente da paleta do clube.

---

## Arquitetura

```
MatchSection
  ├─ GET /api/fixtures (once, on mount)
  │    └─ Promise.allSettled × 4 competições [Redis 6h each] → API-Football
  │
  ├─ GET /api/previews?ids=... (once, after fixtures loaded)
  │    ├─ getTeamForm() × N [Redis 6h] → API-Football
  │    └─ getBroadcastersForFixture() × N [Redis 24h/1h] → Gemini
  │
  └─ MatchCard × N
       └─ GET /api/h2h?home=X&away=Y (on expand, lazy)
            └─ [Redis 6h] → API-Football
```
