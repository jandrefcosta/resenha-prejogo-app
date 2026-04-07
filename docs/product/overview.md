# Visão Geral do Produto

## O que é

**Resenha Pré-Jogo** é uma aplicação web mobile-first para torcedores do Campeonato Brasileiro Série A. O usuário escolhe seu clube favorito e recebe uma visão personalizada de tudo que precisa saber antes de cada partida: quando joga, onde assistir, a forma dos times, confrontos históricos, desfalques e a classificação atualizada.

Após o jogo, o mesmo espaço mostra os resultados oficiais com gols, cartões, escalações e arbitragem — direto da CBF.

---

## Problema que resolve

Torcedores consultam múltiplas fontes para saber:
- Quando e onde o time joga
- Em qual canal ou streaming passa o jogo
- Como está o time em forma
- Quem está machucado
- O resultado oficial com todos os detalhes

A aplicação centraliza tudo isso, com dados atualizados e linguagem direta.

---

## Usuário-alvo

Torcedor brasileiro, fã de um dos 20 clubes da Série A. Acessa nos dias que antecedem (ou sucedem) o jogo do seu time para "fazer a resenha" — daí o nome.

---

## Escopo

**Incluído:**
- Campeonato Brasileiro Série A (apenas)
- Os 20 clubes da edição atual
- Janela de dados: próximos 90 dias (jogos futuros) + rodadas encerradas (histórico)

**Fora do escopo:**
- Libertadores, Copa do Brasil, Copa do Nordeste etc.
- Divisões inferiores
- Estatísticas individuais avançadas

---

## Funcionalidades principais

| Funcionalidade | Resumo |
|----------------|--------|
| Seleção de clube | Personalização visual completa (cores, gradientes) por clube |
| Próximos jogos | Calendário dos próximos 90 dias agrupado por rodada |
| Onde assistir | Canais de TV e streaming descobertos via IA + Google Search |
| Forma dos times | Últimos 5 resultados de mandante e visitante |
| H2H e desfalques | Histórico de confrontos diretos + jogadores lesionados |
| Resultados | Dados oficiais CBF: gols, cartões, escalações, árbitros |
| Classificação | Tabela completa com zonas Libertadores / Rebaixamento |
| Rodada atual | Todos os jogos da rodada em um modal |
| Compartilhamento | Share nativo + WhatsApp fallback |
| Onboarding | Boas-vindas na primeira visita com seleção de clube |
| Captura de e-mail | Cadastro para newsletter futura |
| Sugestões | Canal de feedback e relato de bugs |

---

## Stack tecnológico

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| Linguagem | TypeScript 5 |
| IA — transmissões | Google Gemini 2.5 Flash (grounding Google Search) |
| Dados de jogos | API-Football v3 |
| Dados oficiais | CBF API (gweb.cbf.com.br) |
| Cache distribuído | Upstash Redis |
| Cache em processo | Next.js `unstable_cache` |
| Cache cliente | `localStorage` |
| Monitoramento | Sentry, Vercel Analytics, Microsoft Clarity |
| Deploy | Vercel |

---

## Decisões de produto

**Tema por clube** — a personalização visual é o diferencial principal. Cada clube tem paleta oficial aplicada em gradientes, badges e destaques. Isso cria senso de pertencimento e identidade.

**IA para transmissões** — informação de onde o jogo passa é a mais difícil de obter via API pública. Google Gemini com grounding no Google Search garante cobertura real e atualizada.

**Cache agressivo** — APIs pagas (API-Football, Gemini) têm custo por requisição. O cache em camadas (processo → Redis → API) reduz custo sem sacrificar frescor nas janelas críticas (ao vivo, pré-jogo).

**Mobile-first** — a aplicação é pensada para consumo no celular, antes ou durante o jogo. Modais adaptam-se a alturas curtas; botões têm área mínima de 44px; safe area insets respeitam o notch do iPhone.

**Dado oficial para resultados** — os resultados são buscados direto da CBF (não de APIs terceiras) para garantir fidelidade: gols, cartões e escalações exatamente como publicados.

**Fallback robusto para CBF** — rodadas encerradas são imutáveis. Após finalização, os dados são gravados permanentemente no Redis (sem TTL) e não dependem mais da CBF estar disponível.
