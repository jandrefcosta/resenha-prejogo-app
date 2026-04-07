# Funcionalidade: Visão da Rodada

## O que faz

Exibe todos os jogos da rodada atual em um modal, agrupados por data. Permite ao usuário ver o panorama completo da rodada — não só o jogo do seu time — com horários, transmissões e status de cada partida.

---

## Fluxo do usuário

1. O usuário clica no botão **"Rodada"** na página principal.
2. O `RoundModal` abre e carrega os dados via `/api/round`.
3. Os jogos são exibidos agrupados por data (ex: "Sábado, 12 de abril").
4. O usuário pode compartilhar a rodada via botão Share.

---

## Componentes

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `RoundButton` | `src/components/RoundModal.tsx` | Botão na página principal |
| `RoundModal` | `src/components/RoundModal.tsx` | Modal com todos os jogos da rodada |

---

## API Endpoint

### `GET /api/round`

Retorna todos os fixtures da rodada atual com broadcasters.

**Lógica interna:**
1. Busca todos os fixtures da Série A (via `/api/fixtures` interno)
2. Identifica a rodada atual (menor rodada entre jogos futuros)
3. Filtra apenas os fixtures dessa rodada
4. Faz deduplicação (API-Football pode retornar duplicatas)
5. Para cada fixture, busca os broadcasters em paralelo

**Resposta:**
```typescript
{
  round: number;
  matches: Array<{
    id: number;
    date: string;
    homeTeam: string;
    awayTeam: string;
    broadcasters: string[];
    status: string;
  }>;
}
```

---

## Agrupamento por data

Os jogos são ordenados e agrupados por data de kickoff para exibição:

```
Quarta, 9 de abril
  Flamengo × Palmeiras        20h00  Globo
  Corinthians × Santos        20h30  SporTV

Sábado, 12 de abril
  Atlético-MG × Grêmio        16h00  Premiere
  São Paulo × Botafogo         18h30  SporTV
```

---

## Compartilhamento

O botão de share no `RoundModal` usa a Web Share API:

1. **Mobile (Web Share API disponível):** abre o share sheet nativo do sistema
2. **Desktop (fallback):** abre `https://wa.me/?text=...` em nova aba

**Texto gerado:**
```
Rodada 5 — Brasileirão Série A

⚽ Quarta, 9 de abril
Flamengo × Palmeiras - 20h00 (Globo)
...

📺 Transmissões: Globo, SporTV, Premiere
```

Ver detalhes técnicos em [Compartilhamento](08-sharing.md).

---

## Destaque do clube selecionado

Os jogos do clube selecionado recebem destaque visual (borda colorida ou texto em negrito) para facilitar identificação rápida.

---

## Relação com a Rodada Atual

O `RoundModal` usa o mesmo `currentRoundNum` calculado pelo `MatchSection`:
- Menor rodada entre fixtures futuros
- Fallback: `localStorage.getItem('lastKnownRound')` para períodos entre rodadas

Isso garante que a rodada exibida seja sempre a mesma indicada pelo badge "Rodada Atual" no calendário.
