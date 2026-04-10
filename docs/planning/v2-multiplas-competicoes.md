# Proposta Técnica v2.0 — Suporte a Múltiplas Competições

> Documento interno de desenvolvimento — Resenha Pré-Jogo  
> Elaborado em: abril 2026  
> Baseado em: Plano de Desenvolvimento v2.0 (produto) + análise do codebase atual

---

## 1. Diagnóstico do Estado Atual

### 1.1 O que o app já faz

| Camada | Estado atual |
|--------|-------------|
| Dados de jogos futuros | API-Football — **hardcoded** league ID `71` (Série A) |
| Dados de jogos encerrados | CBF API — championship ID `1260611` (Série A) |
| Classificação | API-Football — só Série A |
| Rodada | CBF API — rounds 1–38 fixos |
| "Onde assistir" | Gemini AI com Google Search — já é flexível por texto |
| Forma recente | API-Football `/teams/statistics` — só Série A |
| H2H | API-Football `/fixtures/headtohead` — sem filtro de competição |
| Club preference | `localStorage` — sem conta de usuário |

### 1.2 O que precisa mudar

O app é completamente hardcoded para Série A. A abstração de "competição" não existe no codebase — não há campo `leagueId` nos tipos de dados, não há seletor de competição nos componentes, e não há cache diferenciado por liga.

---

## 2. Fontes de Dados por Competição

### 2.1 API-Football — cobertura disponível

A API já contratada suporta todas as 4 competições. Nenhum custo adicional de contratação é esperado, mas é necessário **verificar os limites de requisições do plano atual** — a expansão de 1 para 4 ligas aumenta o volume de chamadas em até 4×.

| Competição | League ID (API-Football) | Formato |
|------------|--------------------------|---------|
| Brasileirão Série A | `71` | Pontos corridos |
| Copa do Brasil | `73` | Mata-mata |
| Copa Libertadores | `13` | Grupos + Mata-mata |
| Copa Sul-Americana | `11` | Grupos + Mata-mata |

**Ação necessária:** Testar endpoints para cada league ID antes de iniciar o desenvolvimento. Confirmar que `/fixtures`, `/standings`, `/teams/statistics` e `/fixtures/headtohead` retornam dados para `13`, `11` e `73`.

### 2.2 CBF API — cobertura limitada

A CBF API está atrelada ao championship ID `1260611` (Série A). **Ela não cobre Libertadores, Copa do Brasil ou Sul-Americana.** Para dados de jogos encerrados nessas competições, há duas opções:

| Opção | Vantagem | Desvantagem |
|-------|----------|-------------|
| **A) API-Football `/fixtures` com status FT** | Já integrado, sem novo contrato | Menos detalhes (sem escalação, cartões individuais) |
| **B) APIs alternativas** (Sportmonks, football-data.org) | Dados ricos | Novo contrato + nova integração |

**Recomendação:** Usar a **opção A** para MVP v2. O nível de detalhe do API-Football (placar, gols, estatísticas básicas) é suficiente para jogos encerrados de Libertadores/Copa. A CBF continua sendo a fonte canônica para Série A.

### 2.3 "Onde assistir" — já funciona por texto

O Gemini já recebe o contexto do jogo como texto livre. Basta garantir que o prompt inclua o nome da competição. Ajuste mínimo necessário.

Mapeamento base a hardcodar como fallback:

| Competição | Canais principais |
|------------|-------------------|
| Brasileirão | Globo, Premiere, SporTV |
| Copa do Brasil | SporTV, Premiere, Amazon Prime Video |
| Libertadores | ESPN, Disney+, SBT (fases finais) |
| Sul-Americana | SBT, ESPN, Disney+ |

### 2.4 Forma recente por competição

API-Football `/teams/statistics` aceita `league` como parâmetro. Atualmente é chamado só com `league=71`. Para mostrar forma da Libertadores, chamar com `league=13`. Isso requer **cache separado por `{teamId}:{leagueId}:{season}`**.

### 2.5 H2H filtrado por competição

`/fixtures/headtohead?h2h={homeId}-{awayId}&league={leagueId}` já suporta o parâmetro `league`. Atualmente não é usado. Adicionar ao payload de chamada.

---

## 3. Necessidade de Área Logada

### 3.1 Análise dos requisitos do produto

O documento de produto afirma:
> "O usuário nunca deve precisar configurar manualmente quais competições quer ver. O app deve detectar automaticamente em quais competições o time participa naquela temporada."

Isso significa que a lógica de "quais competições mostrar" é **baseada no time selecionado**, não no usuário. A auto-detecção pode ser feita chamando `GET /fixtures?team={id}&season={year}` e agrupando os `league.id` distintos retornados — sem necessidade de conta.

### 3.2 O que o sistema de identidade atual faz

Existe hoje um sistema mínimo (`src/lib/userIdentity.ts`):
- Email opcional → cookie httpOnly `sc_uid` (1 ano)
- Armazenado no Redis: `user:{userId}` e `email:{hash}`
- Usado para: analytics e controle de sugestões

### 3.3 Veredicto: área logada não é necessária para v2

| Funcionalidade v2 | Requer login? | Solução sem login |
|-------------------|---------------|-------------------|
| Ver jogos de todas as competições | Não | Auto-detecção via API por time |
| Filtrar por competição | Não | Estado local (React state / URL param) |
| Tabela por competição | Não | Seletor de competição no modal |
| Rodada por competição | Não | Seletor de competição no modal |
| Forma recente por competição | Não | Parâmetro `league` na API call |
| H2H por competição | Não | Parâmetro `league` na API call |

**Conclusão:** Nenhum requisito do plano v2.0 exige autenticação. Implementar login agora adicionaria semanas ao projeto sem entregar valor direto ao usuário.

### 3.4 Quando login se torna necessário (v3+)

Considerar área logada apenas se o produto evoluir para:
- **Notificações push** personalizadas por time/competição
- **Preferências sincronizadas** entre dispositivos
- **Conteúdo personalizado** (análises salvas, alertas de rodada)

**Recomendação:** Não implementar em v2. Garantir que o campo `userId` (já existente no sistema de identidade) seja preservado para uso futuro sem migração de dados.

---

## 4. Mudanças Técnicas Necessárias

### 4.1 Tipos (`src/lib/types.ts`)

```typescript
// ATUAL
interface Match {
  competition: string;  // "Campeonato Brasileiro (1)" — string crua da API
  round: string;        // "Rodada 1"
  // ...
}

// PROPOSTO — adicionar campos
interface Match {
  leagueId: number;          // 71 | 73 | 13 | 11
  competitionName: string;   // "Brasileirão" | "Copa do Brasil" | "Libertadores" | "Sul-Americana"
  competitionPhase?: string; // "Fase de Grupos" | "Oitavas de Final" | null
  round: string;             // string existente, agora polimórfica por competição
  // ...
}

// NOVO
type Competition = {
  id: 71 | 73 | 13 | 11;
  label: 'Brasileirão' | 'Copa do Brasil' | 'Libertadores' | 'Sul-Americana';
  format: 'pontos-corridos' | 'mata-mata' | 'grupos-mata-mata';
};

const COMPETITIONS: Competition[] = [
  { id: 71,  label: 'Brasileirão',    format: 'pontos-corridos'   },
  { id: 73,  label: 'Copa do Brasil', format: 'mata-mata'         },
  { id: 13,  label: 'Libertadores',   format: 'grupos-mata-mata'  },
  { id: 11,  label: 'Sul-Americana',  format: 'grupos-mata-mata'  },
];
```

### 4.2 `src/lib/apiFootball.ts` — expansão de queries

```typescript
// ATUAL — busca apenas league 71
async function fetchFixtures(teamId: number) {
  return fetch(`/fixtures?league=71&team=${teamId}&season=${year}&next=90`);
}

// PROPOSTO — detecta competições ativas do time
async function detectActiveCompetitions(teamId: number): Promise<number[]> {
  // Chama API-Football para os próximos 90 dias sem filtro de liga
  // Agrupa league.id distintos retornados
  // Retorna ex: [71, 13, 73]
  // Cache: Redis `competitions:{teamId}:{season}` TTL 24h
}

async function fetchFixturesByLeague(teamId: number, leagueIds: number[]) {
  // Chamadas paralelas para cada leagueId — Promise.all
  // Cache separado por: `fixtures:{leagueId}:{teamId}:{season}` TTL 6h
}
```

**Impacto no cache:** As chaves Redis existentes (`fixtures:serie-a`) precisam ser migradas para `fixtures:71:{teamId}`. Criar função de migração ou invalidar o cache atual no deploy.

### 4.3 `src/lib/cbfApi.ts` — escopo mantido

Nenhuma mudança necessária. A CBF API continua sendo a fonte canônica para Série A (league 71). Para jogos encerrados de outras competições, usar API-Football `/fixtures?status=FT`.

Criar **abstração de fonte por competição**:

```typescript
// src/lib/matchDataSource.ts (novo arquivo)
function getFinishedMatchSource(leagueId: number) {
  if (leagueId === 71) return 'cbf';
  return 'api-football'; // para 13, 11, 73
}
```

### 4.4 `src/components/MatchCard.tsx`

- Substituir etiqueta "Serie A" hardcoded por `match.competitionName`
- Adaptar label de rodada: `getRoundLabel(match)` → retorna "Rodada 12", "Oitavas - Jogo de Ida", "Fase de Grupos - Rod. 3"
- Forma recente: receber `formByLeague: Record<leagueId, Result[]>` em vez de array único
- H2H: parâmetro `leagueId` ao chamar `/api/h2h`
- Broadcasters: garantir que o prompt do Gemini inclua `match.competitionName`

### 4.5 `src/components/StandingsModal.tsx`

Refatoração mais significativa:

```
StandingsModal
├── CompetitionSelector (tabs: Brasileirão | Libertadores | Copa do Brasil | Sul-Americana)
│   └── Renderizar só as competições que o time selecionado participa
└── StandingsView (switch por formato)
    ├── PontosCorridosTable    (já existe — league 71)
    ├── GruposTable            (novo — leagues 13, 11)
    └── BracketView            (novo — league 73 + fases finais)
```

O seletor só exibe competições ativas para o time, evitando tabs vazias.

### 4.6 `src/components/RoundModal.tsx`

Atualmente mostra todos os jogos da rodada atual da Série A:

```
RoundModal
├── CompetitionSelector (mesmo padrão do StandingsModal)
└── RoundView (switch por formato)
    ├── BrasileiraoRound   (rodada 1–38 — já existe)
    ├── MataMataRound      (fase + jogos de ida/volta — novo)
    └── GruposRound        (todos os grupos da rodada N — novo)
```

### 4.7 `src/components/MatchSection.tsx`

Adicionar filtro opcional de competição **acima da lista de jogos**, como pills/chips:

```
[ Todos ] [ Brasileirão ] [ Libertadores ] [ Copa do Brasil ]
```

Implementação: `useState<number | null>(null)` para competição selecionada. `null` = todos. Filtrar `matches` antes de renderizar.

### 4.8 `src/data/clubs.json`

Nenhuma mudança estrutural necessária. As competições são detectadas dinamicamente via API-Football por `team.id`. O campo `apiFootballId` já existente é suficiente.

---

## 5. Estratégia de Cache

| Dado | Chave Redis (proposta) | TTL |
|------|------------------------|-----|
| Competições ativas do time | `competitions:{teamId}:{season}` | 24h |
| Fixtures por liga | `fixtures:{leagueId}:{teamId}:{season}` | 6h |
| Standings Série A | `standings:71:v2` (já existe) | Smart TTL |
| Standings Libertadores | `standings:13:{season}` | 3h |
| Standings Copa do Brasil | `standings:73:{season}` | 3h |
| Standings Sul-Americana | `standings:11:{season}` | 3h |
| Forma por liga | `form:{teamId}:{leagueId}:{season}` | 6h |
| H2H por liga | `h2h:{min}-{max}:{leagueId}` | 6h |
| Fixtures encerrados (não-CBF) | `finished:{leagueId}:{fixtureId}` | 30 dias |

**Atenção à quota da API-Football:** Com 4 ligas × N times × múltiplos endpoints, o volume de chamadas pode triplicar. Priorizar cache agressivo e evitar chamadas paralelas desnecessárias no carregamento inicial.

---

## 6. Plano de Execução por Prioridade

### Prioridade 1 — Crítica: Jogos de todas as competições na tela principal

**O que entregar:** Usuário seleciona Corinthians e vê jogos do Brasileirão + Libertadores + Copa do Brasil ordenados por data.

**Arquivos afetados:**
- `src/lib/types.ts` — adicionar `leagueId`, `competitionName`, `competitionPhase`
- `src/lib/apiFootball.ts` — `detectActiveCompetitions()` + `fetchFixturesByLeague()`
- `src/app/api/fixtures/route.ts` — aceitar múltiplos league IDs, retornar jogos mesclados
- `src/components/MatchSection.tsx` — renderizar jogos de múltiplas competições
- `src/components/MatchCard.tsx` — exibir competição correta na etiqueta

**Critério de aceite:** Cenários 1, 6 e 7 do documento de produto passando.

---

### Prioridade 2 — Alta: Card correto por competição

**O que entregar:** Etiqueta certa, forma certa por competição, broadcaster certo, H2H filtrado.

**Arquivos afetados:**
- `src/components/MatchCard.tsx` — etiqueta + `getRoundLabel()`
- `src/lib/teamForm.ts` — adicionar parâmetro `leagueId`
- `src/app/api/form/route.ts` — pass-through do `leagueId`
- `src/app/api/h2h/route.ts` — adicionar `leagueId` à query
- `src/lib/broadcasterSearch.ts` — incluir `competitionName` no prompt
- `src/lib/matchDataSource.ts` — **novo arquivo**, roteamento CBF vs API-Football

**Critério de aceite:** Cenários 4 e 5 do documento de produto passando.

---

### Prioridade 3 — Alta: Tabela com seletor de competição

**O que entregar:** StandingsModal com tabs por competição e formatos corretos.

**Arquivos afetados:**
- `src/components/StandingsModal.tsx` — refatorar com seletor
- `src/app/api/standings/route.ts` — aceitar `leagueId` como parâmetro
- `src/lib/apiFootball.ts` — `fetchStandings(leagueId)`
- Novos componentes: `GruposTable.tsx`, `BracketView.tsx`

**Critério de aceite:** Cenário 2 do documento de produto passando.

---

### Prioridade 4 — Média: Rodada com seletor de competição

**O que entregar:** RoundModal com seletor e adaptação do conceito de "rodada" por competição.

**Arquivos afetados:**
- `src/components/RoundModal.tsx` — refatorar com seletor
- `src/app/api/round/route.ts` — aceitar `leagueId`
- Novos componentes: `MataMataRound.tsx`, `GruposRound.tsx`

**Critério de aceite:** Cenário 3 do documento de produto passando.

---

### Prioridade 5 — Média: Filtro de competição na tela de jogos

**O que entregar:** Pills opcionais acima da lista de jogos para filtrar por competição.

**Arquivos afetados:**
- `src/components/MatchSection.tsx` — adicionar estado de filtro + pills UI

**Critério de aceite:** Usuário pode selecionar "só Libertadores" e ver apenas esses jogos.

---

## 7. Decisões de Design a Validar com Produto

Antes de iniciar o desenvolvimento, alinhar:

1. **Competição padrão da Tabela:** Quando o usuário abre o StandingsModal, qual tab abre primeiro? Sugestão: Brasileirão sempre (é a principal).

2. **Time que não está em nenhuma competição continental:** Ex: time recém-promovido que não entrou na Copa do Brasil ainda. Mostrar só Brasileirão silenciosamente ou exibir mensagem?

3. **Jogos eliminatórios onde o time já foi eliminado:** Ex: time eliminado da Copa do Brasil. A tab "Copa do Brasil" some do modal de Tabela? Ou mantém histórico?

4. **Resultados passados de Libertadores:** Nível de detalhe desejado — apenas placar (API-Football) ou detalhe de gols/cartões (exigiria API adicional)?

5. **Bracket visual (Prioridade 3):** Implementar bracket visual completo ou lista de confrontos simples para MVP? O bracket é mais impactante mas mais custoso.

---

## 8. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Quota da API-Football excedida | Média | Alto | Cache agressivo por liga; lazy load de competições secundárias |
| API-Football sem dados de Copa do Brasil em fases iniciais | Baixa | Médio | Fallback: exibir "dados indisponíveis" sem quebrar a tela |
| Gemini retornando broadcaster errado por competição | Baixa | Médio | Hardcodar mapeamento de fallback por `leagueId` |
| Cache Redis com chaves legadas conflitando | Alta | Baixo | Deploy com invalidação explícita das chaves antigas |
| Bracket visual complexo demora mais que estimado | Alta | Médio | Entregar lista de confrontos simples na P3 e bracket na P3.1 |

---

## 9. O que NÃO muda

- Sistema de identidade (email + cookie) — manter intacto
- CBF API como fonte canônica para Série A — manter
- ThemeProvider e cores por clube — nenhuma mudança
- OnboardingModal e EmailCaptureModal — nenhuma mudança
- SuggestionModal e rate limiting — nenhuma mudança
- E2E tests — atualizar mocks em `tests/e2e/helpers/mocks.ts` para incluir fixtures multi-competição

---

## 10. Checklist de Deploy

Antes de ir para produção:

- [ ] Testar endpoints API-Football para leagues `13`, `11`, `73` com times reais
- [ ] Confirmar limite de requests do plano API-Football vs. estimativa de volume
- [ ] Invalidar chaves Redis com formato legado (`fixtures:serie-a`)
- [ ] Atualizar `tests/e2e/helpers/mocks.ts` com respostas multi-competição
- [ ] Validar Gemini returnando broadcaster correto para jogo de Libertadores
- [ ] Testar cenário de time sem Libertadores (não deve mostrar tab vazia)
- [ ] Testar cenário de time eliminado da Copa do Brasil (cenário 8)
- [ ] Verificar Sentry errors após deploy (monitorar 1h)

---

*Documento técnico interno — Resenha Pré-Jogo | abril 2026*
