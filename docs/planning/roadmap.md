# Roadmap — Resenha Pré-Jogo

> **Plano consolidado atualizado em abril 2026.**  
> Este arquivo é um sumário de status. O plano de produto completo está em `~/.claude/plans/coma-um-analista-especialisa-snug-anchor.md`.

---

## Status das Fases

| Fase | Descrição | Status |
|------|-----------|--------|
| **Foundation** | tipos, competitions.ts, infraestrutura, caching | ✅ Completa |
| **Core features** | próximos jogos, resultados, standings, ficha, onde assistir | ✅ Completa |
| **Copa 2026** | Página `/copa-2026` completa | ✅ Completa |
| **Multi-competição UI** | StandingsModal + RoundModal com abas por competição | 🟡 Pendente |
| **Admin UI** | Painel `/admin` para cache, seed, logs | ⬜ Pendente |
| **Social UX** | Wiring do SocialDrawer + feed + perfis (backend pronto) | ⬜ Pendente |
| **Bolão Copa 2026** | Feature de palpites com leaderboard em tempo real | ⬜ Pendente ⚠️ |
| **Escalações multi-comp** | Lineups via API-Football para Libertadores/Copa BR | ⬜ Pendente |

> ⚠️ **Bolão Copa 2026 tem janela temporal crítica** — Copa começa em junho 2026. Iniciar em maio 2026 no máximo.

---

## Próximos passos imediatos

```
1. Fase Multi-competição UI
   ├── StandingsModal com tabs: Brasileirão · Libertadores · Sul-Americana
   │   Novos componentes: GruposTable.tsx, BracketView.tsx
   └── RoundModal com tabs por competição
       Novos componentes: MataMataRound.tsx, GruposRound.tsx

2. Bolão Copa 2026 (prioridade urgente por data)
   Auth PIN por email → CRUD bolão → Grid palpites → Scoring cron → Leaderboard

3. Social UX
   Wiring SocialDrawer na home → auth inline → feed paginado → perfil /u/[username]
```

---

## O que NÃO muda

- CBF API como fonte canônica para Série A
- `ThemeProvider`, `useFocusTrap`, `useScrollLock`, `redisCache`
- Identidade anônima (`sc_uid` cookie + Redis)
- Lógica de compartilhamento (Web Share API)

---

*Resenha Pré-Jogo | abril 2026*
