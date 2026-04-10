# Funcionalidade: Ficha do Jogo

## O que faz

Exibe os detalhes de uma partida. O conteúdo varia conforme a competição e o contexto (pré-jogo, ao vivo, encerrado):

| Contexto | Competição | Acesso | Conteúdo |
|----------|-----------|--------|---------|
| Jogo futuro / ao vivo | Série A | Botão "Ficha" no `MatchCard` | Gols, cartões, escalação, substituições, árbitros (via CBF) |
| Jogo futuro / ao vivo | Demais | Botão "Ficha" no `MatchCard` | Placar parcial (se disponível) + lesionados |
| Jogo encerrado | Série A | Botão "Ficha" no `ResultCard` | Escalação, substituições, árbitros (via CBF) |

---

## Fluxo do usuário

### Série A

1. O usuário clica no botão **"Ficha"** em um `MatchCard`.
2. O modal abre e busca dados da CBF (`/api/cbf/round/{round}`).
3. O conteúdo é renderizado conforme a fase do jogo.
4. Após o encerramento e publicação pela CBF, todas as seções ficam preenchidas.

### Outras competições (Libertadores, Copa do Brasil, Sul-Americana)

1. O usuário clica em **"Ficha"** em um `MatchCard` de partida não-Série-A.
2. Nenhum fetch CBF é feito — a ficha exibe o `NonCbfFichaContent`.
3. Conteúdo: placar atual (do `match.score`) + lesionados (já carregados via H2H).
4. Sem escalação, cartões ou árbitros (dados não disponíveis fora da CBF).

---

## Fases e disponibilidade — Série A

### Pré-jogo distante (>48h antes do kickoff)

| Seção | Estado |
|-------|--------|
| Resultado | Pendente |
| Gols | Pendente |
| Cartões | Pendente |
| Escalação | Pendente ("Disponível ~48h antes") |
| Árbitros | Pendente ("Disponível próximo ao jogo") |

### Pré-jogo próximo (≤48h antes do kickoff)

| Seção | Estado |
|-------|--------|
| Escalação | Pode estar disponível (CBF publica ~48h antes) |
| Árbitros | Pode estar disponível |

### Ao vivo (kickoff → kickoff + 115min)

| Seção | Estado |
|-------|--------|
| Resultado | Parcial (placar em tempo real) |
| Gols | Parcial (atualizado a cada 5min) |
| Escalação | Disponível |

### Encerrado (>kickoff + 115min)

Todas as seções disponíveis com dados definitivos.

---

## Componentes

### Ficha de jogo futuro / ao vivo (`MatchCard`)

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `MatchCard` | `src/components/MatchCard.tsx` | Botão "Ficha", estado do modal, dispatch por competição |
| `CbfMatchModalContent` | dentro de `MatchCard.tsx` | Conteúdo CBF organizado por seções (Série A) |
| `NonCbfFichaContent` | dentro de `MatchCard.tsx` | Conteúdo alternativo: placar + lesionados (outras competições) |

### Ficha de jogo encerrado (`ResultCard`)

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `FichaResultModal` | dentro de `ResultCard.tsx` | Modal com escalação, substituições e árbitros (Série A) |

---

## Botão "Ficha" — hint contextual

```
[ícone]
 Ficha
[hint]
```

| Estado | Série A | Outras competições |
|--------|---------|-------------------|
| Ao vivo | "Ao vivo" | "Ao vivo" |
| Pós-jogo | "Resultado" | "Resultado" |
| ≤48h | "Árbitro" | "Lesões" |
| >48h | "48h antes" | "Lesões" |

---

## API Endpoint (Série A)

### `GET /api/cbf/round/{round}`

Chamado com o número da rodada do jogo. Retorna dados de todos os jogos da rodada.

O `MatchCard` filtra o jogo específico pelo `idJogo` da CBF.

**Retorno (`CbfMatchDetail`):**
```typescript
interface CbfMatchDetail {
  idJogo: string;
  rodada: string;
  data: string;        // "DD/MM/YYYY"
  hora: string;        // "HH:mm"
  mandante: CbfTeamDetail;
  visitante: CbfTeamDetail;
  arbitros: CbfReferee[];
  gols: CbfGoal[];
  cartoes: CbfCard[];
  documentos: { url: string; title: string }[];
}
```

Não há endpoint CBF equivalente para Libertadores, Copa do Brasil ou Sul-Americana.

---

## Estados de fetch (`MatchCard`)

| Estado | UI exibida |
|--------|-----------|
| `idle` | Nada (botão apenas) |
| `loading` | Spinner no modal |
| `done` | Dados da ficha (CBF) |
| `not_found` + Série A | Seções com `<Pending>` (dado ainda não publicado pela CBF) |
| `not_found` + outra comp. | `NonCbfFichaContent` com placar + lesionados |
| `error` | "Erro ao carregar a ficha. Tente novamente." |

**Distinção `not_found` vs `error`:**
- `not_found` = HTTP 4xx — dado não publicado ainda
- `error` = HTTP 5xx ou erro de rede

---

## Estrutura de dados (Série A)

### Gols

```typescript
interface CbfGoal {
  atletaNome: string;
  atletaApelido: string;
  atletaCamisa: string;
  clubeId: string;
  tempoJogo: string;    // "1T" ou "2T"
  minutos: string;
  resultado: string;    // "GOL", "PENALTI", "GOL CONTRA"
}
```

### Cartões

```typescript
interface CbfCard {
  atletaNome: string;
  atletaCamisa: string;
  clubeId: string;
  tempoJogo: string;
  minutos: string;
  resultado: string;    // "CARTAO AMARELO", "CARTAO VERMELHO"
}
```

### Atletas (escalação)

```typescript
interface CbfAthlete {
  id: number;
  numeroCamisa: number;
  reserva: boolean;
  goleiro: boolean;
  entrouJogando: boolean;
  nome: string;
  apelido: string;
}
```
