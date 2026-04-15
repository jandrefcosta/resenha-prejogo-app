# Funcionalidade: Onde Assistir (Transmissões)

## O que faz

Descobre automaticamente em quais canais de TV e plataformas de streaming cada partida será transmitida, usando Google Gemini 2.5 Flash com grounding em tempo real no Google Search. Exibe os canais como badges coloridos no `MatchCard`.

---

## Fluxo

1. Ao carregar os fixtures, o `MatchSection` chama `/api/previews?ids=...` em batch.
2. A rota `/api/previews` chama a função server-side `getBroadcastersForFixture` para cada jogo elegível.
3. Se o dado estiver em cache no Redis, retorna imediatamente.
4. Se não estiver em cache, chama o Gemini com uma busca no Google para descobrir os canais.
5. O resultado é armazenado no Redis e retornado como array de strings dentro do payload de preview.

O `RoundModal` segue o mesmo princípio: chama `/api/round`, e essa rota usa `getBroadcastersForFixture` internamente para os jogos da rodada.

---

## Integração Interna

A busca de canais não é exposta por uma rota HTTP pública dedicada. Ela fica centralizada em:

- `src/lib/broadcasterSearch.ts` — `getBroadcastersForFixture`
- `/api/previews` — resolve broadcasters em batch para os cards
- `/api/round` — resolve broadcasters para a visão da rodada

Isso evita uma superfície pública redundante para chamadas ao Gemini.

---

## Integração com Gemini

### Prompt estruturado

O sistema envia ao Gemini um prompt com:
- Times, rodada e data do jogo
- Instrução para usar Google Search para verificar a informação
- Lista dos canais conhecidos (ver abaixo)
- Instrução de retornar JSON puro: `["Canal1", "Canal2"]`

### Canais reconhecidos

O sistema valida a resposta contra uma lista de canais conhecidos:
```
Globo, SporTV, SporTV 2, SporTV 3, Premiere, CazéTV,
Amazon Prime Video, TNT Sports, Max, ESPN, Band, Record
```

Canais fora dessa lista são filtrados para evitar alucinações.

### Grounding

O Gemini usa o recurso de `googleSearch` como tool, permitindo buscar informação real e atualizada na web antes de responder.

---

## Estratégia de cache

| Situação | TTL | Motivo |
|----------|-----|--------|
| Canais encontrados | 24 horas | Publicação raramente muda |
| Sem canais (não publicado ainda) | 1 hora | Retry frequente até aparecer |

- **Chave Redis:** `broadcasters:{fixtureId}`

---

## Janela de busca

A busca de transmissão só é ativada se o jogo for **dentro dos próximos 14 dias**. Jogos muito distantes ainda não têm grade publicada — evitar chamadas desnecessárias ao Gemini.

---

## Exibição no MatchCard

- Cada canal é exibido como um badge com cor e ícone próprios
- Canais pagos (Premiere, Amazon) têm badge diferenciado
- Se nenhum canal encontrado: badge "A confirmar" ou sem badges
- Ordem de exibição: canais abertos primeiro (Globo, Band), depois pagos

---

## Fallback

Se a chamada ao Gemini falhar (timeout, erro de API, resposta inválida):
- Retorna array vazio `[]`
- O Redis armazena array vazio com TTL de 1h para não retentar imediatamente
- O card exibe sem badges de transmissão — não há mensagem de erro explícita para o usuário
