# Script: seed-cbf

## O que faz

Pré-popula o Redis com os dados das rodadas encerradas do Campeonato Brasileiro. Rodadas finalizadas são imutáveis — o script grava a chave stale com TTL permanente (`cbf:round:{N}:stale`), garantindo que esses dados sobrevivam a qualquer falha da CBF API.

**Arquivo:** `scripts/seed-cbf.ts`

---

## Quando usar

- **Antes do primeiro deploy:** popula o histórico de rodadas já encerradas
- **Após uma rodada encerrar:** garante que o stale permanente está gravado
- **Após limpeza do Redis:** restaura o fallback permanente
- **Para corrigir um round específico:** `--round=N --force`

---

## Uso

```bash
# Seed de todas as rodadas (1–38)
npm run seed:cbf

# Seed das primeiras N rodadas
npm run seed:cbf -- --rounds=15

# Seed de uma rodada específica
npm run seed:cbf -- --round=10

# Forçar re-fetch mesmo se já permanente
npm run seed:cbf -- --round=10 --reset
npm run seed:cbf -- --reset
```

---

## Flags

| Flag | Descrição |
|------|-----------|
| `--rounds=N` | Processa rodadas 1 até N (padrão: 38) |
| `--round=N` | Processa somente a rodada N |
| `--reset` / `--force` | Re-fetcha mesmo rodadas já com stale permanente |

---

## Saída esperada

```
  ╔══════════════════════════════════════╗
  ║   CBF Redis Seed — Resenha Pré-Jogo ║
  ╚══════════════════════════════════════╝

  Rodadas: 1–10  |  Force: false

  Rodada 01/10 ... ✓  seeded (permanent)
  Rodada 02/10 ... ✓  seeded (permanent)
  Rodada 03/10 ... ◎  já permanente, ignorada
  Rodada 04/10 ... ◎  já permanente, ignorada
  Rodada 05/10 ... ✓  seeded (permanent)
  Rodada 06/10 ... —  não finalizada, ignorada
  Rodada 07/10 ... —  não finalizada, ignorada
  Rodada 08/10 ... —  não finalizada, ignorada
  Rodada 09/10 ... —  não finalizada, ignorada
  Rodada 10/10 ... —  não finalizada, ignorada

  ─────────────────────────────────────────
  2 seeded
  2 já permanentes (ignoradas)
  6 não finalizadas (ignoradas)
  0 erros
  ─────────────────────────────────────────
```

### Ícones de status

| Ícone | Significado |
|-------|-------------|
| `✓` | Rodada buscada da CBF e gravada permanentemente |
| `◎` | Já estava permanente no Redis — ignorada (use `--force` para re-fetch) |
| `—` | Rodada não finalizada — sem dados definitivos, ignorada |
| `✗` | Erro ao buscar na CBF — tente novamente com `--round=N` |

---

## Pré-requisitos

### Variáveis de ambiente

O script precisa das credenciais Redis. Elas são lidas do arquivo `.env.local`:

```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=AX...
```

O comando usa `--env-file=.env.local` (requer Node.js ≥ 20.6):
```json
"seed:cbf": "tsx --env-file=.env.local scripts/seed-cbf.ts"
```

### Dependência tsx

O script usa `tsx` para executar TypeScript diretamente sem compilação prévia. Já está em `devDependencies`.

---

## Lógica interna

Para cada rodada no intervalo:

1. **Verifica se já permanente** (sem `--force`):
   - Lê `cbf:round:{N}:stale` do Redis
   - Se TTL = `-1` (permanente) e status = `finished` → pula com `◎`

2. **Busca dados da CBF:**
   - Chama `getCbfRound(round, force=true)` — sempre força o fetch da CBF
   - `getCbfRound` já escreve as chaves primária e stale automaticamente

3. **Verifica se finalizada:**
   - `data.status !== 'finished'` → pula com `—`

4. **Grava permanentemente:**
   - `redis.set(staleKey, data)` sem `{ ex }` — TTL indefinido
   - Isso é um safety net além do que `getCbfRound` já faz

5. **Throttle:** aguarda 600ms entre requisições para não sobrecarregar a CBF nem o Upstash

---

## Em caso de erros

Se uma rodada falhar (`✗`), o script exibe ao final:
```
⚠  Tente novamente com: npm run seed:cbf -- --round=N
```

E encerra com `process.exit(1)` (útil em CI/CD).

Para reprocessar apenas as rodadas com erro:
```bash
npm run seed:cbf -- --round=7
npm run seed:cbf -- --round=12
```
