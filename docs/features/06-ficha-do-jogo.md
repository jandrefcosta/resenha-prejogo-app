# Funcionalidade: Ficha do Jogo

## O que faz

Exibe os detalhes oficiais de uma partida. Existe em dois contextos:

| Contexto | Componente | Acesso | Conteúdo |
|----------|-----------|--------|---------|
| Jogo futuro / ao vivo | `MatchCard` → `CbfMatchModalContent` | Botão "Ficha" no card de próximo jogo | Gols, cartões, escalação, substituições, árbitros + indicadores de disponibilidade por fase |
| Jogo encerrado | `ResultCard` → `FichaResultModal` | Botão "Ficha" no card de resultado | Escalação, substituições, árbitros (gols e cartões ficam no inline expandível do `ResultCard`) |

Antes do jogo (contexto `MatchCard`), mostra indicadores de disponibilidade para cada seção — o usuário sabe o que esperar e quando.

---

## Fluxo do usuário

1. O usuário clica no botão **"Ficha"** em um `MatchCard`.
2. Um modal abre exibindo o conteúdo de acordo com a fase do jogo.
3. Após o encerramento e publicação dos dados pela CBF, todas as seções ficam preenchidas.

---

## Fases e disponibilidade por seção

### Pré-jogo distante (>48h antes do kickoff)

| Seção | Estado | Mensagem |
|-------|--------|----------|
| Resultado | Pendente | "Disponível após o apito final" |
| Gols | Pendente | "Disponível após o apito final" |
| Cartões | Pendente | "Disponível após o apito final" |
| Escalação | Pendente | "Disponível ~48h antes do jogo" |
| Árbitros | Pendente | "Disponível próximo ao jogo" |

### Pré-jogo próximo (≤48h antes do kickoff)

| Seção | Estado | Observação |
|-------|--------|-----------|
| Resultado | Pendente | Ainda não jogou |
| Escalação | Pode estar disponível | CBF publica escala ~48h antes |
| Árbitros | Pode estar disponível | CBF publica árbitro perto do jogo |

### Ao vivo (entre o kickoff e kickoff + 115min)

| Seção | Estado | Observação |
|-------|--------|-----------|
| Resultado | Parcial | Placar em tempo real |
| Gols | Parcial | Atualizado a cada 5min |
| Escalação | Disponível | Publicada antes do apito |

### Encerrado (>kickoff + 115min)

Todas as seções disponíveis com dados definitivos.

---

## Componentes

### Ficha de jogo futuro / ao vivo

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `MatchCard` | `src/components/MatchCard.tsx` | Botão "Ficha", modal, fetch, renderização por fase |
| `CbfMatchModalContent` | dentro de `MatchCard.tsx` | Conteúdo do modal organizado por seções |

### Ficha de jogo encerrado (`ResultCard`)

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `FichaResultModal` | dentro de `ResultCard.tsx` | Modal com escalação, substituições e árbitros para partidas encerradas |

O `FichaResultModal` usa os dados `CbfMatchDetail` já carregados pelo `ResultCard` — não faz fetch adicional. Gols e cartões são exibidos no próprio card expandível.

---

## API Endpoint (interno)

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

---

## Botão "Ficha" no MatchCard

O botão exibe 3 linhas de informação contextual:

```
[ícone]
 Ficha
[hint]
```

| Estado | Hint exibido |
|--------|-------------|
| Ao vivo | "Ao vivo" |
| ≤48h para o jogo | "Árbitro" (dado disponível em breve) |
| >48h | "Em breve" |

---

## Banner de fase no modal

O topo do modal exibe um banner com a fase atual:

| Fase | Cor | Texto |
|------|-----|-------|
| Pré-jogo >48h | Âmbar | "Pré-jogo · Nd/Nh" |
| Pré-jogo ≤48h | Âmbar | "Pré-jogo · Nd/Nh" |
| Ao vivo | Verde | "Ao Vivo" |
| Encerrado | Cinza | "Encerrado" |

---

## Estados de fetch

| Estado | UI exibida |
|--------|-----------|
| `idle` | Nada (botão apenas) |
| `loading` | Spinner no modal |
| `done` | Dados da ficha |
| `not_found` | Todas as seções com `<Pending>` (dado ainda não publicado pela CBF) |
| `error` | "Erro ao carregar a ficha. Tente novamente." |

**Distinção `not_found` vs `error`:**
- `not_found` = HTTP 4xx — jogo existe mas CBF não publicou dados ainda → mostra Pending
- `error` = HTTP 5xx ou erro de rede → mostra mensagem de erro

---

## Estrutura de dados detalhada

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
