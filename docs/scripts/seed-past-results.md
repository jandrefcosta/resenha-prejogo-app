# Script: seed-past-results

Pré-aquece o Redis com o histórico de resultados passados (W/D/L) de todos os
clubes em todas as competições não-CBF.

**Arquivo:** `scripts/seed-past-results.ts`  
**Chaves gravadas:**
- `conmebol:tournament:{id}` — torneio completo (Libertadores, Sul-Americana) — TTL dinâmico
- `finished:{competitionId}:{apiFootballId}` — últimos 5 jogos por clube/competição — TTL 6h

---

## Quando usar

- **Rotina periódica (~5h)** — renova antes do TTL expirar
- **Após reset do Redis** — restaura o histórico de todos os clubes
- **Para corrigir um clube específico** — `--club=SLUG --reset`

---

## Uso

```bash
# Aquece todos os clubes + torneios CONMEBOL (pula os já em cache)
npm run seed:past-results

# Apaga e re-fetcha mesmo se já em cache
npm run seed:past-results -- --reset

# Somente um clube pelo slug
npm run seed:past-results -- --club=corinthians
npm run seed:past-results -- --club=palmeiras --reset

# Somente os torneios CONMEBOL (sem per-club)
npm run seed:past-results -- --tournament-only
```

---

## Flags

| Flag | Descrição |
|------|-----------|
| `--reset` / `--force` | Apaga as chaves antes de re-popular |
| `--club=SLUG` | Processa somente o clube com esse slug (ex: `corinthians`) |
| `--tournament-only` | Processa somente os torneios CONMEBOL, sem per-club |

---

## Competições cobertas

| Competição | Fonte | Chave |
|-----------|-------|-------|
| Libertadores | CONMEBOL API | `conmebol:tournament:15` |
| Sul-Americana | CONMEBOL API | `conmebol:tournament:104` |
| Libertadores (per-club) | API-Football | `finished:libertadores:{teamId}` |
| Sul-Americana (per-club) | API-Football | `finished:sul-americana:{teamId}` |
| Copa do Brasil | API-Football | `finished:copa-brasil:{teamId}` |

> Série A (Brasileirão) é coberta pelo `seed-cbf` — não entra aqui.

---

## Pré-requisitos

```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=AX...
API_FOOTBALL_KEY=...
```
