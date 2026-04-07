# Fontes de Dados

## API-Football v3

**URL base:** `https://v3.football.api-sports.io`
**Autenticação:** Header `x-apisports-key: {API_FOOTBALL_KEY}`
**Plano:** Free tier (100 requests/dia) ou pago

### Endpoints utilizados

| Endpoint | Dados obtidos | Uso na aplicação |
|----------|--------------|-----------------|
| `/fixtures` | Jogos agendados/encerrados | Calendário de fixtures (`/api/fixtures`) |
| `/fixtures/headtohead` | Histórico de confrontos | H2H no `MatchCard` |
| `/standings` | Tabela de classificação | `StandingsModal` |
| `/injuries` | Jogadores lesionados | H2H no `MatchCard` |
| `/players/topscorers` | Artilheiros da competição | `MatchCard` (seção jogadores) |
| `/players/topassists` | Assistências | `MatchCard` (seção jogadores) |
| `/teams/statistics` | Forma dos times | Form badges no `MatchCard` |

### Identificadores

- **League ID Série A:** configurado em `src/lib/apiFootball.ts`
- **Season:** ano corrente (ex: `2026`)
- **`apiFootballId`:** ID do time na API-Football — mapeado em `clubs.json` para cada clube

### Limites e throttle

O free tier limita 100 requests/dia. O cache agressivo (6h para fixtures/form) é essencial para não exceder o limite.

---

## CBF API (gweb.cbf.com.br)

**URL base:** `https://gweb.cbf.com.br/api/site/v1`
**Autenticação:** Bearer token estático (`Cbf@2022!`) — token público do site cbf.com.br
**Custo:** Sem custo (API não comercial)

### Endpoint utilizado

```
GET /jogos/campeonato/{CHAMPIONSHIP_ID}/rodada/{round}/fase
```

**Championship ID:** `1260611` (Série A 2026)

### Dados retornados por rodada

Para cada jogo da rodada:
- Mandante e visitante (nome, escudo, placar, penáltis)
- Escalação (`atletas[]`: nome, apelido, camisa, posição, reserva)
- Substituições (`alteracoes[]`: jogador saiu, entrou, tempo)
- Penalidades (`penalidades[]`): gols e cartões com marcador, minuto, tipo
- Árbitros (`arbitros[]`): principal, assistentes, 4º árbitro
- Documentos (súmula PDF)

### Formato de data/hora

A CBF retorna data e hora no fuso de Brasília (UTC-3):
- Data: `"DD/MM/YYYY"`
- Hora: `"HH:mm"`

O parsing considera o offset UTC-3 para converter para UTC correto.

### Limitações conhecidas

- A CBF pode ter instabilidades — daí o fallback com chave stale permanente
- Dados de escalação aparecem com antecedência variável (~48h antes)
- Árbitro confirmado próximo ao jogo
- Resultado oficial (com todos os gols/cartões) publicado após o encerramento — pode levar horas

### Mapeamento de clubes

O campo `cbfId` em `clubs.json` mapeia cada clube ao seu ID na CBF:
```json
{ "id": "flamengo", "cbfId": 262, ... }
```

Usado para filtrar jogos do clube selecionado nos resultados da rodada.

---

## Google Gemini (broadcasters)

**Modelo:** `gemini-2.5-flash-preview-05-20`
**SDK:** `@google/genai`
**Autenticação:** `GEMINI_API_KEY`

### Funcionamento

1. Monta prompt com: times, data, rodada, lista de canais conhecidos
2. Habilita Google Search como tool (grounding em tempo real)
3. Instrui o modelo a retornar JSON puro: `["Canal1", "Canal2"]`
4. Parseia a resposta e filtra contra lista de canais conhecidos

### Lista de canais reconhecidos

```typescript
const KNOWN_CHANNELS = [
  'Globo', 'SporTV', 'SporTV 2', 'SporTV 3', 'Premiere',
  'CazéTV', 'Amazon Prime Video', 'TNT Sports', 'Max',
  'ESPN', 'Band', 'Record',
];
```

### Fallback

Se Gemini retornar resposta inválida, JSON malformado, ou canais fora da lista: retorna `[]`.

---

## Dados estáticos (clubs.json)

**Arquivo:** `src/data/clubs.json`
**Atualização:** Manual — só muda se um clube subir/descer ou trocar de nome/estádio

### Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | Slug único (ex: `"flamengo"`) |
| `name` | string | Nome completo |
| `shortName` | string | Sigla de 3 letras (ex: `"FLA"`) |
| `city`, `state` | string | Localização da sede |
| `stadium` | string | Nome do estádio principal |
| `apiFootballId` | number | ID na API-Football |
| `cbfId` | number | ID na CBF |
| `colors.primary` | hex | Cor primária oficial |
| `colors.secondary` | hex | Cor secundária oficial |
| `colors.accent` | hex | Cor de destaque |
| `textOnPrimary` | `'white'` \| `'dark'` | Contraste sobre a cor primária |
