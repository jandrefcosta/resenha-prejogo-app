# Funcionalidade: Resultados Passados

## O que faz

Exibe os resultados das rodadas encerradas com dados oficiais da CBF: placar, gols (marcador + minuto), cartões, substituições, escalações completas e árbitros. Lazy-loading por rodada ao trocar para a aba "Resultados".

---

## Fluxo do usuário

1. O usuário clica na aba **"Resultados"** no `MatchSection`.
2. As últimas 3 rodadas encerradas do clube selecionado são buscadas.
3. Cada partida é renderizada como um `ResultCard`.
4. O usuário pode:
   - Clicar em **"↓ Cartões e árbitro"** para expandir inline gols, cartões e árbitro da partida.
   - Clicar em **"Ficha"** para abrir o `FichaResultModal`, que exibe escalação, substituições e árbitros em um modal dedicado.
5. Rolando para baixo, mais rodadas podem ser carregadas (infinite scroll ou botão "ver mais").

---

## Componentes

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `MatchSection` | `src/components/MatchSection.tsx` | Gerencia a aba Resultados, lazy-loading, paginação por rodada |
| `ResultCard` | `src/components/ResultCard.tsx` | Card de resultado com placar, detalhes expansíveis e botão Ficha |
| `FichaResultModal` | dentro de `ResultCard.tsx` | Modal com escalação, substituições e árbitros da partida encerrada |

---

## API Endpoints envolvidos

### `GET /api/past-fixtures?club=<slug>&beforeRound=<N>&limit=<3>`

Retorna resultados das últimas `limit` rodadas antes da rodada `beforeRound` para o clube `club`.

**Parâmetros:**
- `club` — slug do clube (ex: `flamengo`)
- `beforeRound` — número da rodada de referência (busca as anteriores)
- `limit` — quantas rodadas retornar (padrão: 3)

**Lógica interna:**
1. Busca `limit + 1` rodadas como buffer (para compensar rodadas que possam não ter jogos do clube)
2. Para cada rodada, chama `getCbfRound(round)` que retorna todos os jogos da rodada
3. Filtra apenas o(s) jogo(s) do clube solicitado (por `cbfId`)
4. Coleta até `limit` rodadas com resultado e retorna

**Cache:** Cada `getCbfRound` usa sua própria estratégia de cache — ver [Estratégia de Cache](../technical/caching-strategy.md).

---

## Dados exibidos por jogo (ResultCard)

| Dado | Sempre disponível | Quando |
|------|:-----------------:|--------|
| Placar final | ✓ | Após encerramento |
| Gols (marcador, minuto, tipo) | ✓ | Após publicação CBF |
| Cartões (tipo, jogador, minuto) | ✓ | Após publicação CBF |
| Escalação titular | ✓ | Após publicação CBF |
| Banco de reservas | ✓ | Após publicação CBF |
| Substituições | ✓ | Após publicação CBF |
| Árbitros (principal + assistentes) | ✓ | Após publicação CBF |

---

## Fonte de dados: CBF API

- **URL:** `https://gweb.cbf.com.br/api/site/v1/jogos/campeonato/{CHAMPIONSHIP_ID}/rodada/{round}/fase`
- **Championship ID:** `1260611`
- **Autenticação:** Bearer token estático (`Cbf@2022!`)

O dado retornado inclui: mandante, visitante, árbitros, penalidades (gols + cartões), escalações, substituições, documentos.

---

## Estratégia de cache para rodadas encerradas

Rodadas com status `finished` são **imutáveis** — os dados jamais mudam após publicação.

- **Chave primária:** `cbf:round:{N}` — TTL 30 dias
- **Chave stale (permanente):** `cbf:round:{N}:stale` — sem TTL (permanente)
- **Stale-while-error:** se a CBF API falhar, o fallback stale é servido automaticamente

Isso garante que rodadas encerradas nunca "desaparecem" por indisponibilidade da CBF.

---

## Sincronização com a rodada atual

A paginação de resultados usa `beforeRound` = número da rodada atual. Esse valor é:
1. Calculado a partir dos fixtures futuros (menor rodada entre jogos agendados)
2. Salvo em `localStorage` como `lastKnownRound` para sobreviver a períodos entre rodadas

---

## Arquitetura

```
MatchSection (aba Resultados)
  └─ GET /api/past-fixtures?club=X&beforeRound=N&limit=3
       ├─ getCbfRound(N-1) → Redis [primary] → Redis [stale] → CBF API
       ├─ getCbfRound(N-2) → Redis [primary] → Redis [stale] → CBF API
       └─ getCbfRound(N-3) → Redis [primary] → Redis [stale] → CBF API
            ↓ filtra por cbfId do clube
       ResultCard × M (um por jogo do clube encontrado)
```
