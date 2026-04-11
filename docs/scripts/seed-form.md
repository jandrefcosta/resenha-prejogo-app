# Script: seed-form

Pré-aquece o Redis com a forma recente (últimos 5 resultados na Série A)
de todos os clubes cadastrados.

**Arquivo:** `scripts/seed-form.ts`  
**Chave gravada:** `form:{apiFootballId}:71:{season}` — TTL 6h

---

## Quando usar

- **Rotina periódica (~5h)** — renova antes do TTL expirar
- **Após reset do Redis** — restaura os dados de forma de todos os clubes
- **Para corrigir um clube específico** — `--club=ID --reset`

---

## Uso

```bash
# Aquece todos os clubes (pula os já em cache)
npm run seed:form

# Apaga e re-fetcha mesmo se já em cache
npm run seed:form -- --reset

# Somente um clube pelo apiFootballId
npm run seed:form -- --club=131           # Corinthians
npm run seed:form -- --club=121 --reset   # Palmeiras, forçado
```

---

## Flags

| Flag | Descrição |
|------|-----------|
| `--reset` / `--force` | Apaga as chaves antes de re-popular |
| `--club=ID` | Processa somente o clube com esse `apiFootballId` |

---

## Ícones de saída

| Ícone | Significado |
|-------|-------------|
| `✓` | Form buscado da API e gravado (TTL 6h) |
| `◎` | Já em cache — ignorado |
| `⚠` | API retornou vazio (time fora da liga ou temporada não iniciada) |
| `—` | Clube sem `apiFootballId` — ignorado |
| `✗` | Erro ao buscar na API |

---

## Observação importante

Form vazio (`""`) **nunca é cacheado**. Se a API retornar vazio (erro transiente
ou temporada ainda não iniciada), a chave fica ausente e será tentada novamente
na próxima requisição orgânica. Isso evita o bug de "cache envenenado" onde
um erro temporário bloqueava a exibição do form por até 6h.

---

## Pré-requisitos

```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=AX...
API_FOOTBALL_KEY=...
```
