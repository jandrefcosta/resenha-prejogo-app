# Funcionalidade: Classificação

## O que faz

Exibe a tabela completa do Campeonato Brasileiro Série A com zonas coloridas (Libertadores, Pré-Libertadores, Sul-Americana, Rebaixamento), forma recente dos times e destaque para o clube selecionado pelo usuário.

---

## Fluxo do usuário

1. O usuário clica no botão **"Classificação"** na página principal.
2. O `StandingsModal` abre e carrega a tabela via `/api/standings`.
3. O clube selecionado é destacado (linha com borda ou fundo diferenciado).
4. O usuário pode forçar uma atualização clicando em **"Atualizar"** (envia `?force=1`).

---

## Componentes

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `StandingsButton` | `src/components/StandingsModal.tsx` | Botão na página principal que abre o modal |
| `StandingsModal` | `src/components/StandingsModal.tsx` | Modal com a tabela completa |

---

## API Endpoint

### `GET /api/standings?force=0|1`

Retorna a tabela da Série A.

**Parâmetros:**
- `force` (opcional) — se `1`, ignora cache e busca dado fresco

**Resposta:** `StandingEntry[]` — array de 20 posições ordenadas.

```typescript
interface StandingEntry {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  form: string; // ex: "WWDLW"
  description: string | null; // "Libertadores" | "Rebaixamento" | null
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  home: { ... }; // mesma estrutura
  away: { ... }; // mesma estrutura
}
```

---

## Zonas da tabela

| Posição | Zona | Cor |
|---------|------|-----|
| 1–4 | Libertadores (fase de grupos) | Verde escuro |
| 5 | Pré-Libertadores | Verde claro |
| 6–12 | Sul-Americana | Azul |
| 13–16 | Zona neutra | — |
| 17–20 | Rebaixamento | Vermelho |

As zonas são derivadas do campo `description` retornado pela API-Football.

---

## Estratégia de cache

O TTL é calculado dinamicamente com base na janela de jogos:

| Período | TTL |
|---------|-----|
| Janela de jogos (quarta a domingo) | 30 minutos |
| Fora da janela (segunda, terça) | 3 horas |

Isso equilibra frescor durante rodadas com economia fora delas.

- **Chave Redis:** `standings:serie-a`
- **Fonte:** API-Football v3 `/standings`

---

## Campos exibidos na tabela

Por linha (time):
- Posição (#)
- Logo e nome do time
- Pontos (P)
- Jogos (J)
- Vitórias / Empates / Derrotas (V/E/D)
- Saldo de gols (SG)
- Forma dos últimos 5 jogos (badges coloridos W/D/L)

---

## Destaque do clube selecionado

A linha correspondente ao clube selecionado recebe:
- Fundo diferenciado (borda ou cor suave)
- Rolagem automática para posicionar o clube visível ao abrir o modal

O match é feito comparando `apiFootballId` do clube selecionado com o `team.id` de cada `StandingEntry`.
