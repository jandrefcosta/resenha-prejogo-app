# Script: seed-fixtures

Pré-aquece o Redis com os próximos jogos das 4 competições de clube
(Série A, Libertadores, Copa do Brasil, Sul-Americana).

**Arquivo:** `scripts/seed-fixtures.ts`  
**Chave gravada:** `fixtures:{competitionId}:{season}` — TTL 6h

---

## Quando usar

- **Antes do deploy** — elimina o cold-start da primeira requisição
- **Rotina periódica (~5h)** — renova antes do TTL expirar
- **Após `--reset` no seed:all** — chamado automaticamente pelo orquestrador

---

## Uso

```bash
# Aquece todas as 4 competições (pula as já em cache)
npm run seed:fixtures

# Apaga e re-fetcha mesmo se já em cache
npm run seed:fixtures -- --reset

# Somente uma competição
npm run seed:fixtures -- --comp=serie-a
npm run seed:fixtures -- --comp=libertadores
npm run seed:fixtures -- --comp=copa-brasil
npm run seed:fixtures -- --comp=sul-americana
```

---

## Flags

| Flag | Descrição |
|------|-----------|
| `--reset` / `--force` | Apaga as chaves antes de re-popular |
| `--comp=ID` | Processa somente a competição com esse slug |

---

## Competições cobertas

| Slug | Competição | Liga API-Football |
|------|-----------|-------------------|
| `serie-a` | Brasileirão Série A | 71 |
| `libertadores` | Copa Libertadores | 13 |
| `copa-brasil` | Copa do Brasil | 73 |
| `sul-americana` | Copa Sul-Americana | 11 |

---

## Observação técnica

Este script **não usa** `getFixturesByClub` da aplicação — essa função depende do
`unstable_cache` do Next.js, que só existe dentro do runtime do servidor Next.
O seed faz o fetch diretamente na API-Football e grava no Redis, sem dependência
do framework.

---

## Pré-requisitos

```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=AX...
API_FOOTBALL_KEY=...
```
