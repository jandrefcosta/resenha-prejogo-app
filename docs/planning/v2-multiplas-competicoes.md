# Proposta Técnica v2.0 — Suporte a Múltiplas Competições

> Documento interno de desenvolvimento — Resenha Pré-Jogo  
> Elaborado em: abril 2026  
> **Atualizado em: abril 2026** — reflete o estado atual após implementação parcial

---

## 1. Estado de Implementação

### 1.1 O que foi implementado

| Camada | Estado anterior | Estado atual |
|--------|----------------|--------------|
| Dados de jogos futuros | Hardcoded league 71 | `Promise.allSettled` para todas as competições ativas |
| Dados de jogos encerrados (não-CBF) | Inexistente | `/api/past-results` via API-Football |
| Tipos `Match` | Sem `leagueId`/`competitionName` | `leagueId`, `competitionName`, `competitionPhase` adicionados |
| `competitions.ts` | Inexistente | `src/data/competitions.ts` com 4 competições de clube + Copa 2026 |
| `matchDataSource.ts` | Inexistente | `src/lib/matchDataSource.ts` — roteamento CBF vs API-Football |
| Filtro por competição (pills) | Inexistente | Implementado em `MatchSection`, persistindo entre abas |
| Etiqueta de competição no card | "Serie A" fixo | `match.competitionName` dinâmico |
| H2H por competição | Sem `leagueId` | `leagueId` passado para `/api/h2h` |
| Broadcasters por competição | Prompt sem contexto | `competitionName` incluído no prompt Gemini |
| Classificação (StandingsModal) | Só Série A | Só Série A — **seletor de competição pendente** |
| Rodada (RoundModal) | Só Série A | Só Série A — **seletor de competição pendente** |

### 1.2 O que ainda falta

- **StandingsModal** com seletor de competição (1.3)
- **RoundModal** com seletor de competição (1.4)
- **Página Copa do Mundo** `/copa-2026` (Fase 2)

---

## 2. Fontes de Dados por Competição

### 2.1 API-Football — cobertura atual

| Competição | League ID | Formato | Fixtures | Standings | Form | H2H |
|------------|-----------|---------|----------|-----------|------|-----|
| Brasileirão Série A | `71` | Pontos corridos | ✅ | ✅ | ✅ | ✅ |
| Copa do Brasil | `73` | Mata-mata | ✅ | ➖ (mata-mata) | ✅ | ✅ |
| Copa Libertadores | `13` | Grupos + Mata-mata | ✅ | ✅ | ✅ | ✅ |
| Copa Sul-Americana | `11` | Grupos + Mata-mata | ✅ | ✅ | ✅ | ✅ |

### 2.2 CBF API — escopo mantido

Fonte canônica apenas para Série A (leagueId 71). Para jogos encerrados de outras competições, `/api/past-results` usa API-Football `/fixtures?status=FT`.

### 2.3 Forma recente

Unificada em `leagueId=71` para todas as competições. Decisão deliberada para evitar 4× chamadas por time. Futuro: separar por liga se houver demanda de produto.

### 2.4 "Onde assistir"

Gemini recebe `competitionName` no prompt desde a implementação atual. Mapeamento de fallback hardcoded:

| Competição | Canais principais |
|------------|-------------------|
| Brasileirão | Globo, Premiere, SporTV |
| Copa do Brasil | SporTV, Premiere, Amazon Prime Video |
| Libertadores | ESPN, Disney+, SBT (fases finais) |
| Sul-Americana | SBT, ESPN, Disney+ |

---

## 3. Pendências Técnicas

### 3.1 StandingsModal com seletor de competição

**Prioridade: Alta**

```
StandingsModal
├── Tabs: [Brasileirão] [Libertadores] [Sul-Americana]
│         (Copa do Brasil: mata-mata, sem tabela de pontos)
└── View por formato:
    ├── PontosCorridosTable  (já existe — leagueId 71)
    ├── GruposTable          (novo — leagueIds 13, 11 — fase de grupos)
    └── BracketView          (novo — leagueId 73 + fases finais de todas)
```

**Decisões de design:**
- Tab padrão ao abrir: Brasileirão sempre
- Mostrar só tabs de competições em que o time participa (sem tabs vazias)
- Copa do Brasil sem `PontosCorridosTable` — apenas `BracketView`
- `BracketView` MVP: lista de confrontos (não bracket visual completo)

**Arquivos afetados:**
- `src/components/StandingsModal.tsx`
- Novos: `src/components/GruposTable.tsx`, `src/components/BracketView.tsx`

---

### 3.2 RoundModal com seletor de competição

**Prioridade: Alta**

```
RoundModal
├── Tabs: [Brasileirão] [Libertadores] [Copa do Brasil] [Sul-Americana]
└── View por formato:
    ├── BrasileiraoRound  (já existe — rodadas 1–38, dados CBF)
    ├── MataMataRound     (novo — fase atual + jogos de ida/volta)
    └── GruposRound       (novo — todos os grupos da rodada N)
```

**Arquivos afetados:**
- `src/components/RoundModal.tsx`
- Novos: `src/components/MataMataRound.tsx`, `src/components/GruposRound.tsx`

---

## 4. Estratégia de Cache (estado atual)

| Dado | Chave Redis | TTL |
|------|-------------|-----|
| Fixtures por competição | `fixtures:{competition.id}` | 6h |
| Resultados encerrados (não-CBF) | `finished:{competition.id}:{teamApiId}` | 6h |
| Standings Série A | `standings:71:v2` | Smart TTL (30min–3h) |
| Standings Libertadores | `standings:13:v2` | 3h |
| Standings Sul-Americana | `standings:11:v2` | 3h |
| Forma | `form:{teamId}:71:{season}` | 6h |
| H2H | `h2h:{min}-{max}` | 6h |
| Broadcasters | `broadcasters:{fixtureId}` | 24h / 1h (vazio) |
| Rodadas CBF | `cbf:round:{N}` + `cbf:round:{N}:stale` | Variável |

---

## 5. Riscos Ativos

| Risco | Probabilidade | Impacto | Mitigação atual |
|-------|---------------|---------|-----------------|
| Quota API-Football excedida | Média | Alto | Cache 6h por competição; semáforo Gemini (max 3); Cache-Control CDN |
| API-Football sem dados de Copa do Brasil nas fases iniciais | Baixa | Médio | `/api/past-results` retorna `[]` sem quebrar UI — `SimpleResultCard` mostra "vazio" |
| Cache Redis com chaves legadas | Resolvido | — | Chaves `fixtures:serie-a` descontinuadas; invalidar manualmente se necessário |
| `GruposTable`/`BracketView` demora mais que estimado | Alta | Médio | Entregar lista de confrontos simples no MVP, bracket visual na iteração seguinte |

---

## 6. Checklist de Deploy — Próxima Versão (1.3 + 1.4)

- [ ] Implementar `GruposTable` com dados reais de Libertadores (testar times em fase de grupos)
- [ ] Implementar `BracketView` MVP (lista de confrontos — não bracket visual)
- [ ] StandingsModal: tab ativa muda ao trocar de clube no seletor
- [ ] RoundModal: `MataMataRound` usando `/api/round?competition=copa-brasil`
- [ ] RoundModal: `GruposRound` usando `/api/round?competition=libertadores`
- [ ] Testes E2E: adicionar mocks para standings multi-competição
- [ ] Testes E2E: adicionar mocks para round multi-competição
- [ ] Verificar Sentry após deploy

---

*Documento técnico interno — Resenha Pré-Jogo | abril 2026*
