# Funcionalidade: Ficha do Jogo

## O que faz

Exibe os detalhes de uma partida. O conteúdo varia conforme a competição e o contexto (pré-jogo, ao vivo, encerrado):

| Contexto | Competição | Acesso | Conteúdo |
|----------|-----------|--------|---------|
| Jogo futuro / ao vivo | Série A | Botão "Ficha" no `MatchCard` | Gols, cartões, escalação, substituições, árbitros (via CBF) |
| Jogo futuro / ao vivo | Demais | Botão "Ficha" no `MatchCard` | Placar parcial (se disponível) + lesionados |
| Jogo encerrado | Série A | Botão "Ficha" no `MatchCard` | Escalação, substituições, árbitros, público e renda (via CBF + documentos oficiais) |

---

## Fluxo do usuário

### Série A

1. O usuário clica no botão **"Ficha"** em um `MatchCard`.
2. O modal abre e busca o jogo na CBF via `/api/cbf/match`; para jogos encerrados, busca documentos oficiais via `/api/cbf/match-docs`.
3. O conteúdo é renderizado conforme a fase do jogo.
4. Após o encerramento e publicação pela CBF, todas as seções ficam preenchidas.

### Outras competições (Libertadores, Copa do Brasil, Sul-Americana)

1. O usuário clica em **"Ficha"** em um `MatchCard` de partida não-Série-A.
2. Nenhum fetch CBF é feito — a ficha exibe o `NonCbfFichaContent`.
3. Conteúdo: placar (do `match.score`) + gols (via `/api/match-events` quando disponível) + desfalques (carregados via H2H, suprimidos pós-jogo se vazios).
4. Sem escalação, cartões ou árbitros (dados não disponíveis fora da CBF).

---

## Fases e disponibilidade — Série A

### Pré-jogo distante (>48h antes do kickoff)

| Seção | Estado | Mensagem exibida |
|-------|--------|-----------------|
| Resultado | Pendente | "Disponível após o apito final" |
| Gols | Pendente | "Disponível após o apito final" |
| Cartões | Pendente | "Disponível após o apito final" |
| Escalação | Pendente | "Publicada ~48h antes do jogo" |
| Árbitros | Pendente | "Confirmada ~48h antes do jogo" |
| Desfalques | Visível | Lista de lesionados/suspensos (ou "Sem desfalques confirmados") |

### Pré-jogo próximo (≤48h antes do kickoff)

| Seção | Estado | Mensagem exibida |
|-------|--------|-----------------|
| Escalação | Pode estar disponível | "Escalação ainda não publicada pelo CBF" se ausente |
| Árbitros | Pode estar disponível | "Não publicada pelo CBF" se ausente |
| Desfalques | Visível | Lista ou "Sem desfalques confirmados" |

### Ao vivo (kickoff → kickoff + 115min)

| Seção | Estado | Mensagem exibida |
|-------|--------|-----------------|
| Resultado | Parcial | "Placar sendo atualizado pelo CBF…" se ainda não disponível |
| Gols | Parcial | "Atualizando…" se sem dados |
| Cartões | Parcial | "Atualizando…" se sem dados |
| Escalação | Disponível | "Escalação ainda não confirmada pelo CBF" ou "Aguardando dados do CBF…" se ausente |
| Desfalques | Visível | Lista ou "Sem desfalques confirmados" |

### Encerrado (>kickoff + 115min)

Todas as seções disponíveis com dados definitivos. Documentos oficiais (súmula + boletim financeiro) são baixados, parseados e cacheados permanentemente no Redis.

| Seção | Fonte | Estado | Mensagem se ausente |
|-------|-------|--------|---------------------|
| Resultado | CBF API | Disponível | "Disponível após o apito final" |
| Gols | CBF API | Disponível | "Sem gols registrados" |
| Cartões | CBF API | Disponível | "Sem cartões registrados" |
| Escalação | CBF API (`atletas`) ou Súmula PDF (fallback) | Disponível | "Escalação não publicada pelo CBF" |
| Árbitros | CBF API | Disponível | "Não publicada pelo CBF" |
| Substituições | Súmula PDF (`cbf:match:{id}:sumula`) | Disponível quando publicada | Seção omitida se vazia |
| Desfalques | API-Football (H2H) | **Omitido** se vazio | Seção suprimida pós-jogo sem dados; exibida como "Desfalques do Jogo" quando há dados |
| Público e Renda | Boletim Financeiro PDF (`cbf:match:{id}:boletim`) | **Indisponível** — PDFs de boletim da CBF são image-based (sem camada de texto); parser retorna nulos | "Disponíveis algumas horas após o jogo" |
| Documentos Oficiais | `match.documentos` (CBF API) | Links diretos para PDFs da CBF | "Documentos disponíveis algumas horas após o jogo" |

---

## Componentes

### Ficha de jogo (`MatchCard`)

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `MatchCard` | `src/components/MatchCard.tsx` | Botão "Ficha", estado do modal, dispatch por competição |
| `CbfMatchModalContent` | dentro de `MatchCard.tsx` | Conteúdo CBF organizado por seções (Série A) |
| `BoletimSection` | dentro de `MatchCard.tsx` | Seção "Público e Renda" — renderiza dados do boletim ou estado pendente |
| `OfficialDocumentsSection` | dentro de `MatchCard.tsx` | Links diretos para PDFs da CBF (súmula, boletim, relatório) |
| `NonCbfFichaContent` | dentro de `MatchCard.tsx` | Conteúdo alternativo: placar + lesionados (outras competições) |

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

## Documentos Oficiais CBF (Série A — jogos encerrados)

### Processamento lazy / sob demanda

Quando o usuário abre a ficha de um jogo encerrado (Série A), o sistema verifica se os documentos já foram processados via sentinela Redis. Se não, baixa e parseia os PDFs em tempo real.

O seed `npm run seed:match-docs` pré-processa todos os jogos encerrados da temporada atual, evitando latência na primeira abertura.

### Súmula (`{idDoc}se.pdf`)

PDF text-based — `unpdf` extrai texto diretamente. Contém:
- Escalação completa (titulares + reservas) com número, apelido e nome completo
- Substituições com minutagem
- Árbitros
- Gols e cartões (redundante com CBF API, mas mais completo em nomes)

### Boletim Financeiro (`{idDoc}b.pdf`)

PDF **image-based** (sem camada de texto selecionável) — `unpdf` não consegue extrair texto; `parseBoletim` retorna sempre nulos. A seção "Público e Renda" exibe estado pendente enquanto esse problema não for resolvido.

**Limitação conhecida:** os boletins da CBF são gerados como imagem escaneada. OCR seria necessário (ex: Tesseract, Docling), mas Docling é Python-only e incompatível com Vercel serverless.

### URLs dos PDFs

Resolvidas em dois passos:
1. Campo `match.documentos[]` da CBF internal API (mais confiável quando populado)
2. Fallback: construção por padrão `{CONTEUDO_BASE}/{year}/{idDoc}se.pdf` + HEAD-test

**Nota:** `idDoc` ≠ `idJogo` — o CBF usa um ID de documento diferente do ID do jogo na API de resultados.

---

## API Endpoint — Documentos CBF

### `GET /api/cbf/match-docs?matchId={idJogo}&round={N}`

Retorna dados parseados dos documentos oficiais de um jogo encerrado.

| | |
|-|-|
| **Auth** | Nenhuma (público) |
| **Cache** | Redis permanente |

**Resposta (`CbfMatchDocsResult`):**
```typescript
{ available: false }
// ou
{
  available: true;
  sumula?: CbfSumulaData;
  boletim?: CbfBoletimData;
}
```

**Comportamento:**
- Verifica sentinela Redis (`cbf:match:{id}:docs:status`)
- Se dados existem no cache → retorna imediatamente (~50ms)
- Se não → baixa PDFs, parseia e armazena permanentemente
- Se documentos ainda não publicados → salva sentinela com TTL 2h (evita re-checks frequentes)

---

## API Endpoint — Cache Bust

### `DELETE /api/admin/bust-match-docs`

Remove documentos cacheados do Redis. Parâmetros adicionais:
- `?idJogo=N` — remove as 3 chaves de um jogo específico (`sumula`, `boletim`, `docs:status`)
- `?all=true` — remove todas as chaves `cbf:match:*`
- Auth: header `Authorization: Bearer <DEBUG_SECRET>`

---

## API Endpoints (Série A)

### `GET /api/cbf/match?home=X&away=Y&round=N`

Chamado com IDs API-Football de mandante/visitante e a rodada. Retorna o `CbfMatchDetail` do jogo específico.

O `MatchCard` usa esse retorno para preencher dados oficiais da CBF quando o jogo é de Série A.

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

### Súmula PDF (`CbfSumulaData`)

```typescript
interface CbfSumulaData {
  idJogo: string;
  parsedAt: string;
  campeonato: string;
  rodada: string;
  data: string;
  hora: string;
  estadio: string;
  cidade: string;
  mandante: CbfSumulaTeam;
  visitante: CbfSumulaTeam;
  arbitros: CbfSumulaReferee[];
  gols: CbfSumulaGoal[];
  cartoes: CbfSumulaCard[];
}

interface CbfSumulaTeam {
  nome: string;
  gols: number;
  titulares: CbfSumulaPlayer[];   // 11 jogadores
  reservas: CbfSumulaPlayer[];    // até 12 jogadores
  substituicoes: CbfSumulaSubstitution[];
}

interface CbfSumulaPlayer {
  numero: number;
  nome: string;
  apelido: string;
}
```

### Boletim Financeiro (`CbfBoletimData`)

```typescript
interface CbfBoletimData {
  idJogo: string;
  parsedAt: string;
  estadio: string;
  data: string;
  publico: {
    geral: number | null;       // sempre null (PDF image-based)
    pagante: number | null;     // sempre null
    naoPagente: number | null;  // sempre null
  };
  renda: {
    bruta: number | null;       // sempre null
    liquida: number | null;     // sempre null
  };
  ingressos: CbfBoletimTicketCategory[];
}
```
