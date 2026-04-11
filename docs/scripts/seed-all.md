# Script: seed-all

Orquestrador do aquecimento completo do cache Redis. Executa os 4 scripts de seed
na ordem correta, garantindo que nenhum cold-start chegue ao usuário.

**Arquivo:** `scripts/seed-all.ts`

---

## Quando usar

- **Antes de um deploy** — aquece o cache antes de receber tráfego
- **Após limpeza do Redis** — restaura todos os dados de uma vez
- **Rotina periódica (a cada ~5h)** — renova fixtures, form e resultados antes do TTL expirar

---

## Uso

```bash
# Aquecimento completo (pula o que já está em cache)
npm run seed:all

# Apaga tudo e repovoar do zero
npm run seed:all -- --reset
npm run seed:all -- --force    # alias para --reset

# Pular etapas já aquecidas
npm run seed:all -- --skip-cbf
npm run seed:all -- --skip-fixtures
npm run seed:all -- --skip-form
npm run seed:all -- --skip-past

# Combinar flags
npm run seed:all -- --reset --skip-cbf   # reset sem re-sedar rodadas CBF
npm run seed:all -- --rounds=10          # limitar CBF às primeiras 10 rodadas
```

---

## Sequência de execução

```
1. CBF rounds       — rodadas do Brasileirão (permanente no Redis)
2. Upcoming fixtures — próximos jogos das 4 competições (TTL 6h)
3. Team form        — forma dos times na temporada (TTL 6h)
4. Past results     — histórico W/D/L por clube (TTL 6h)
```

A ordem importa: fixtures devem estar quentes antes do form, pois confirmam
que a temporada está ativa.

---

## Flags

| Flag | Descrição |
|------|-----------|
| `--reset` / `--force` | Apaga as chaves existentes antes de re-popular |
| `--skip-cbf` | Ignora a etapa de rodadas CBF |
| `--skip-fixtures` | Ignora a etapa de fixtures |
| `--skip-form` | Ignora a etapa de form |
| `--skip-past` | Ignora a etapa de resultados passados |
| `--rounds=N` | Passa `--rounds=N` para o seed-cbf |
| `--round=N` | Passa `--round=N` para o seed-cbf |

---

## Saída esperada

```
  ╔══════════════════════════════════════════════════════╗
  ║   Full Cache Seed — Resenha Pré-Jogo                ║
  ╚══════════════════════════════════════════════════════╝

  Sequência de aquecimento:
    [  run ]  1. CBF rounds (Brasileirão — permanente)
    [  run ]  2. Upcoming fixtures (TTL 6h)
    [  run ]  3. Team form / forma na temporada (TTL 6h)
    [  run ]  4. Past results / histórico W-D-L (TTL 6h)

  Force: false

  ══════════════════════════════════════════════════════
  RESUMO
  ══════════════════════════════════════════════════════

  ✓  CBF rounds
  ✓  Upcoming fixtures
  ✓  Team form
  ✓  Past results

  Cache totalmente aquecido. Sem cold-starts para os usuários.
```

---

## Exit codes

| Código | Significado |
|--------|-------------|
| `0` | Todas as etapas concluídas com sucesso |
| `1` | Uma ou mais etapas com erro (seed parcial) |

Em caso de erro parcial, execute novamente com `--reset` para reprocessar.

---

## Pré-requisitos

```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=AX...
API_FOOTBALL_KEY=...
```
