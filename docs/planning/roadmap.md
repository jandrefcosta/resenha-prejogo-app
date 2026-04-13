# Roadmap Consolidado — Resenha Pré-Jogo

> Sintetiza os documentos de planejamento e define a ordem de execução.  
> Última revisão: abril 2026

---

## Status das Fases

| Fase | Descrição | Status |
|------|-----------|--------|
| **Fase 0** | Foundation — tipos, competitions.ts, infraestrutura | ✅ Completa |
| **Fase 1** | Competições de clubes na página principal | 🟡 Parcialmente completa |
| **Fase 2** | Página Copa do Mundo 2026 | ✅ Completa |
| **Fase 3** | Bolão da Copa do Mundo | ⬜ Pendente |

---

## Fase 0 — Foundation ✅ Completa

Todos os itens abaixo foram implementados e estão em produção.

| Item | Arquivo | Status |
|------|---------|--------|
| `competitions.ts` | `src/data/competitions.ts` | ✅ |
| Tipos `leagueId`, `competitionName`, `competitionPhase` em `Match` | `src/lib/types.ts` | ✅ |
| `matchDataSource.ts` — roteamento CBF vs API-Football | `src/lib/matchDataSource.ts` | ✅ |
| `apiFootball.ts` parametrizado | `src/lib/apiFootball.ts` | ✅ |
| `broadcasterSearch.ts` — `competitionName` no prompt | `src/lib/broadcasterSearch.ts` | ✅ |
| Endpoint `?competition=` em `/api/fixtures` | `src/app/api/fixtures/route.ts` | ✅ |
| Endpoint `?competition=` em `/api/standings` | `src/app/api/standings/route.ts` | ✅ |
| Endpoint `?competition=` em `/api/round` | `src/app/api/round/route.ts` | ✅ |

---

## Fase 1 — Competições de clubes na página principal 🟡 Parcialmente completa

### ✅ 1.1 · Fixtures de múltiplas competições

Implementado com `Promise.allSettled` em `/api/fixtures`. Retorna jogos de todas as competições ativas do time (Brasileirão + Libertadores + Copa do Brasil + Sul-Americana) mesclados e ordenados por data.

### ✅ 1.2 · Card correto por competição

- `match.competitionName` exibido no card (substituiu label "Serie A" fixo)
- `leagueId` passado para `/api/h2h` e `/api/form`
- Ficha do Jogo: mensagem específica para jogos não-CBF (`leagueId !== 71`)
- Forma unificada em `leagueId=71` para evitar 4× chamadas

### ✅ 1.5 · Filtro de competição (pills) na tela de jogos

Pills unificados entre aba Próximos Jogos e Resultados, com filtro persistindo ao trocar de aba. Pills usam union de competições upcoming + históricas.

### ✅ Resultados de outras competições (`/api/past-results`)

Novo endpoint que retorna resultados encerrados via API-Football para competições não-CBF.

### ✅ Infra e performance

- Semáforo Gemini (máx 3 concurrent) em `/api/previews`
- Cache-Control CDN em todos os endpoints
- TTL de fixtures encerrados corrigido para 6h
- `useScrollLock` unificado em todos os modais
- `global-error.tsx` corrigido (sem `next/error` Pages Router)
- `Array.isArray()` guard no `otherResults` do MatchSection

---

### ⬜ 1.3 · StandingsModal com seletor de competição

**O que falta:** StandingsModal hoje mostra apenas Brasileirão. Precisa de seletor de tabs por competição e views para formatos diferentes.

```
StandingsModal
├── Tabs: [Brasileirão] [Libertadores] [Sul-Americana]
│         (Copa do Brasil é mata-mata sem tabela tradicional)
└── View por formato:
    ├── PontosCorridosTable  (já existe — leagueId 71)
    ├── GruposTable          (novo — leagueIds 13, 11)
    └── BracketView          (novo — leagueId 73 + fases finais)
```

**Arquivos afetados:**
- `src/components/StandingsModal.tsx` — adicionar seletor de competição
- Novos: `src/components/GruposTable.tsx`, `src/components/BracketView.tsx`

**Nota:** Seletor já mostra só competições em que o time participa — não exibir tabs vazias.

---

### ⬜ 1.4 · RoundModal com seletor de competição

**O que falta:** RoundModal hoje mostra apenas rodadas da Série A (via CBF). Precisa de seletor e views adaptadas ao formato de cada competição.

```
RoundModal
├── Tabs: [Brasileirão] [Libertadores] [Copa do Brasil] [Sul-Americana]
└── View por formato:
    ├── BrasileiraoRound  (já existe — rodadas 1–38)
    ├── MataMataRound     (novo — fase + jogos de ida/volta)
    └── GruposRound       (novo — todos os grupos da rodada N)
```

**Arquivos afetados:**
- `src/components/RoundModal.tsx` — adicionar seletor de competição
- Novos: `src/components/MataMataRound.tsx`, `src/components/GruposRound.tsx`

---

## Fase 2 — Página Copa do Mundo 2026 ✅ Completa

Página `/copa-2026` implementada e em produção. Tema verde/amarelo fixo, Brasil destacado, todos os jogos visíveis.

### Implementado

| Item | Arquivo |
|------|---------|
| Página principal + layout SEO | `src/app/copa-2026/page.tsx`, `layout.tsx` |
| API fixtures Copa | `src/app/api/copa/fixtures/route.ts` |
| API standings grupos | `src/app/api/copa/standings/route.ts` |
| `CopaMatchSection` | `src/components/copa/CopaMatchSection.tsx` |
| `GroupStandingsModal` (grupos A–L, 12 grupos) | `src/components/copa/GroupStandingsModal.tsx` |
| `CopaPhaseHeader` | `src/components/copa/CopaPhaseHeader.tsx` |
| `CopaMatchRow`, `CopaThemeApplier` | `src/components/copa/` |
| `BrazilCountdown` | `src/components/copa/BrazilCountdown.tsx` |
| `national-teams.ts` (ClubTheme Seleção) | `src/data/national-teams.ts` |

### Pendente (pós-MVP)

- Link de descoberta na página da Série A (banner ou nav header)
- `CountrySelector` — "Seguir outro país" via `localStorage`
- 32 seleções em `national-teams.ts` — só Brasil no MVP
- Fases eliminatórias interativas (bracket visual)

---

## Fase 3 — Bolão da Copa do Mundo ⬜ Pendente

**Dependência:** Fase 2 funcional + sistema de auth.

### 3.0 · Auth: PIN por e-mail

- `POST /api/auth/request-pin` → gera PIN, Redis `pin:{email}` TTL 15min, envia via Resend
- `POST /api/auth/verify-pin` → valida, atualiza cookie
- Pacotes novos: `resend`, `nanoid`

### 3.1 · Etapas sequenciais

| Etapa | Entrega |
|-------|---------|
| **Auth** | Login via PIN, `displayName` no perfil |
| **CRUD Bolão** | Criar bolão, código de convite, entrar por código |
| **Palpites** | Grid de jogos com inputs, lock automático no kickoff |
| **Pontuação** | Cron Vercel 30min, sorted sets Redis, leaderboard |
| **Polish** | Revelar palpites após kickoff, share de ranking |

---

## Ordem de execução recomendada (próximos sprints)

```
AGORA
  │
  ├─→ 1.3 StandingsModal multi-competição
  │       GruposTable + BracketView MVP
  │
  ├─→ 1.4 RoundModal multi-competição
  │       MataMataRound + GruposRound
  │
  ├─→ 2.x Copa — link de descoberta na Série A   ← único item restante da Fase 2
  │
  └─→ 3.x Bolão                                  ← Depende da Fase 2 (já completa)
```

---

## O que NÃO muda em nenhuma fase

- CBF API como fonte canônica para Série A
- `ThemeProvider`, `useFocusTrap`, `useScrollLock`, `redisCache` — genéricos
- `SuggestionModal`, `EmailCaptureModal`, `OnboardingModal`
- Sistema de identidade (`sc_uid` cookie + Redis) — apenas cresce na Fase 3
- Lógica de compartilhamento (Web Share API)

---

*Roadmap interno — Resenha Pré-Jogo | abril 2026*
