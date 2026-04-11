# Resenha Pré-Jogo — Documentação

Índice central de toda a documentação do produto.

---

## Produto

- [Visão Geral do Produto](product/overview.md) — propósito, usuário-alvo, decisões de produto

---

## Funcionalidades

| # | Funcionalidade | Descrição rápida |
|---|----------------|-----------------|
| 01 | [Seleção de Clube & Tema](features/01-club-selection.md) | Personalização visual por clube |
| 02 | [Próximos Jogos](features/02-upcoming-matches.md) | Calendário multi-competição com pills de filtro |
| 03 | [Resultados Passados](features/03-past-results.md) | Histórico CBF (Série A) + API-Football (outras competições) |
| 04 | [Classificação](features/04-standings.md) | Tabela da Série A com zonas |
| 05 | [Onde Assistir](features/05-broadcasters.md) | Canais via IA + Google Search |
| 06 | [Ficha do Jogo](features/06-ficha-do-jogo.md) | Detalhes oficiais: gols, cartões, escalações |
| 07 | [Visão da Rodada](features/07-round-overview.md) | Todos os jogos da rodada atual |
| 08 | [Compartilhamento](features/08-sharing.md) | Share nativo + WhatsApp fallback |
| 09 | [Onboarding](features/09-onboarding.md) | Boas-vindas e seleção inicial de clube |
| 10 | [Captura de E-mail](features/10-email-capture.md) | Cadastro para newsletter |
| 11 | [Sugestões & Feedback](features/11-feedback-suggestions.md) | Envio de relatos e sugestões |

---

## Técnico

- [Arquitetura](technical/architecture.md) — stack, componentes, fluxo de dados
- [Rotas de API](technical/api-routes.md) — referência completa de todos os endpoints
- [Estratégia de Cache](technical/caching-strategy.md) — camadas, TTLs, stale-while-error
- [Fontes de Dados](technical/data-sources.md) — API-Football, CBF, Gemini
- [Catálogo de Chaves Redis](technical/redis-key-catalog.md) — todas as chaves, TTLs, formato

---

## Scripts de manutenção

Scripts de aquecimento de cache Redis — executar antes de deploys e periodicamente (~5h).

| Script | Descrição |
|--------|-----------|
| [seed-all](scripts/seed-all.md) | Orquestrador — executa todos os seeds na ordem correta |
| [seed-cbf](scripts/seed-cbf.md) | Rodadas do Brasileirão (chaves permanentes) |
| [seed-fixtures](scripts/seed-fixtures.md) | Próximos jogos das 4 competições (TTL 6h) |
| [seed-form](scripts/seed-form.md) | Forma dos times na temporada (TTL 6h) |
| [seed-past-results](scripts/seed-past-results.md) | Histórico W/D/L por clube (TTL 6h) |

---

## Planejamentos

- [Suporte a múltiplos campeonatos](planning/multi-competition.md) — histórico de decisões e fases de implementação
- [V2 Múltiplas Competições](planning/v2-multiplas-competicoes.md) — roadmap detalhado da expansão multi-competição
- [Roadmap](planning/roadmap.md) — prioridades e próximos passos
- [Bolão da Copa do Mundo](planning/bolao-copa.md) — gerenciador de bolão de resultados: auth, palpites, pontuação, leaderboard

---

> **Arquivos de raiz relacionados:** `PRODUCT.md` (visão de produto resumida), `CLAUDE.md` / `AGENTS.md` (instruções para IA).
