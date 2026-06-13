# Design — Remoção da captura de e-mail (app inteiro)

> Data: 2026-06-13
> Status: aprovado para planejamento

## Contexto

O app tem uma camada de **captura de e-mail** ("Cadastre seu e-mail e receba
novidades, melhorias e análises exclusivas do Resenha Pré-Jogo.") montada sobre
três superfícies:

1. **Botão "Novidades"** (`EmailSubscribeButton`) na fila de CTAs do hero.
2. **Banner flutuante** (`EmailJourneyBanner`) que aparece após 45s.
3. **Email gate** no `MatchCard` — exige cadastro para abrir H2H, Escalações e
   Ficha do jogo (com os 2 primeiros grupos liberados como teaser via
   `noEmailGate`).

Todas abrem o mesmo `EmailCaptureModal`, que faz `POST /api/identity`. O endpoint
grava um registro de usuário anônimo (`user:{id}` / `email:{hash}` no Redis +
shadow-write na tabela `users` do Postgres) e seta o cookie `sc_uid`
(`IDENTITY_COOKIE`).

## Objetivo

Remover **toda** a funcionalidade de captura de e-mail do app, incluindo o gate,
sem conteúdo substituto. As áreas liberadas simplesmente refluem.

## Decisões tomadas (brainstorming)

- **Escopo:** app inteiro (Copa + home Brasileirão + gate do MatchCard).
- **Substituição:** nenhuma — o hero reflui e os modais já têm conteúdo próprio.
- **Gate:** H2H, Escalações e Ficha ficam **livres para todos**.
- **Código morto:** remover também `/api/identity` e os trechos órfãos do
  `userIdentity.ts` (`IDENTITY_COOKIE`, `registerOrUpdateUser`).

## Fronteiras — intocável

`userIdentity.ts` é **infraestrutura compartilhada**: auth e social dependem de
`hashEmail`, `getUserById`, `getUserByEmail`, `UserRecord`, da tabela `users` e
das chaves `user:{id}` / `email:{hash}`. Consumidores confirmados:
`/api/auth/{register,login,me,forgot-password,reset-password}`,
`/api/social/{posts,users/[username]}`.

- **Manter** todo o `userIdentity.ts` exceto os 2 trechos órfãos.
- **Manter** `email.ts` — usado só por `forgot-password` (recuperação de senha),
  nunca pela captura.
- **Não tocar** em `auth.ts`, `/api/auth/*`, `/api/social/*`, tabela `users`.

Confirmado por busca: `sc_uid` / `IDENTITY_COOKIE` e `registerOrUpdateUser` são
usados **exclusivamente** por `/api/identity`. Nada mais lê esse cookie.

## Blast radius

| Arquivo | Ação |
|---|---|
| `src/components/EmailCaptureModal.tsx` | **Apagar** o arquivo inteiro (modal, `EmailSubscribeButton`, `EmailJourneyBanner`, `EMAIL_REGISTERED_KEY`). |
| `src/app/copa-2026/page.tsx` | Remover o import (l.10-12), `<EmailSubscribeButton/>` (l.79) e `<EmailJourneyBanner/>` (l.102). A fila do hero (`flex-wrap`) reflui sozinha. |
| `src/components/home/ClubHome.tsx` | Remover import (l.8), `<EmailSubscribeButton/>` (l.46), `<EmailJourneyBanner/>` (l.69). |
| `src/components/MatchCard.tsx` | Remover import (l.31-33); estado `emailRegistered`/`emailGateOpen`/`pendingActionRef` (l.1650-1654); `useEffect` de leitura do flag (l.1656-1658); `withEmailGate` (l.1660-1667); `handleEmailGateClose` (l.1669-1677); render do modal (l.2247); prop `noEmailGate` (l.1601, 1613, 1661). Desembrulhar os 3 callsites: `onClick={() => withEmailGate(openX)}` → `onClick={openX}` (H2H l.2124, Players l.2132, Ficha l.2140). |
| `src/components/MatchSection.tsx` | Remover as 3 passagens da prop `noEmailGate` (l.586, 637, 655). |
| `src/app/api/identity/route.ts` | **Apagar** o arquivo (e a pasta `identity/` se ficar vazia). |
| `src/lib/userIdentity.ts` | Remover `IDENTITY_COOKIE` (l.6) e `registerOrUpdateUser` (l.45-103). Manter o resto. |

### Documentação a atualizar

- `docs/features/10-email-capture.md` — apagar (ou marcar como removido com data).
- Referências a remover/ajustar em: `ARCHITECTURE.md`, `docs/technical/architecture.md`,
  `docs/technical/api-routes.md`, `docs/technical/system-overview.md`,
  `docs/technical/redis-key-catalog.md` (chave `identity:`/`sc_uid`).

## Consequências de produto (aceitas)

1. **Fim do funil de coleta de e-mail.** Era o único mecanismo de lead capture.
2. **H2H / Escalações / Ficha liberados para todos** — o muro deixa de existir.

## Dados existentes

- Cookies `sc_uid` já no navegador dos usuários ficam **órfãos** (nada os lê) —
  inofensivo; expiram em até 1 ano.
- Registros de usuário anônimo (só-e-mail) no Redis/Postgres **permanecem**; não
  há limpeza de dados neste escopo.
- Flag `localStorage` `resenha-prejogo:email-registered` fica órfão — inofensivo.

## Testes e verificação

- Nenhum spec e2e referencia `EmailCaptureModal`, `withEmailGate` ou
  `EMAIL_REGISTERED` (confirmado). Ainda assim, revisar `tests/e2e/` para fluxos
  que abrem H2H/Escalações/Ficha e que possam assumir o passo de cadastro.
- Após as mudanças: `npm run lint`, `npm run build` e `npm run test:e2e` devem
  passar.
- Verificação manual: hero da Copa e home do Brasileirão sem o botão "Novidades";
  banner não aparece após 45s; H2H/Escalações/Ficha abrem direto em qualquer
  card e em qualquer grupo.

## Riscos

- **Baixo.** A camada é fina e bem isolada. O único ponto de atenção é o
  `MatchCard` (arquivo grande) — remover o gate sem mexer em lógica vizinha.
  Mitigação: edições cirúrgicas nos blocos listados, build + e2e como rede.
