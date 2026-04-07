# Funcionalidade: Sugestões & Feedback

## O que faz

Permite ao usuário enviar relatos de bugs, sugestões de melhoria ou qualquer feedback diretamente pela aplicação. O texto é salvo em uma lista Redis. Rate limiting impede abusos.

---

## Fluxo do usuário

1. O usuário clica no botão de sugestão (ícone flutuante ou link na página).
2. O `SuggestionModal` abre com um campo de texto livre.
3. O usuário escreve a mensagem e envia.
4. Em sucesso: tela de confirmação ("Obrigado pelo feedback!").
5. Em erro de rate limit: mensagem explicando que o limite foi atingido.

---

## Componente

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `SuggestionModal` | `src/components/SuggestionModal.tsx` | Modal de feedback com campo de texto e estados |

---

## API Endpoint

### `POST /api/suggestions`

**Body:**
```json
{ "text": "A transmissão do jogo X está errada." }
```

**Resposta (sucesso):**
```json
{ "ok": true }
```

**Resposta (rate limit):**
```json
{ "error": "rate_limit", "retryAfter": 3600 }
```
HTTP 429

**Ações executadas:**
1. Verifica rate limit: máximo 3 requisições por hora por IP
2. Se aprovado: `RPUSH suggestions "{timestamp} | {ip} | {text}"`
3. Se bloqueado: retorna 429 com tempo de retry

---

## Rate Limiting

| Parâmetro | Valor |
|-----------|-------|
| Máximo de requests | 3 por hora |
| Janela | Sliding window (Upstash Ratelimit) |
| Identificador | IP do cliente |

O IP é extraído de `x-forwarded-for` (Vercel edge) com fallback para `x-real-ip`.

---

## Armazenamento Redis

**Chave:** `suggestions` (lista Redis)

Cada entrada é uma string no formato:
```
2026-04-07T14:23:00Z | 177.23.45.100 | A transmissão do jogo X está errada.
```

Para ler as sugestões:
```bash
redis-cli LRANGE suggestions 0 -1
```

---

## Validação

- Texto vazio: bloqueado no cliente (botão desabilitado)
- Texto muito longo: limitado a 500 caracteres no cliente
- Validação no servidor: texto não pode ser vazio ou exceder o limite

---

## Acesso às sugestões

Atualmente as sugestões são lidas diretamente do Redis. Não há painel administrativo — o acesso é via cliente Redis (Upstash console, redis-cli, ou dashboard do Upstash).
