# Resenha Pré-Jogo

Acompanhe os próximos jogos do seu clube no Brasileirão Série A — com informações de transmissão buscadas por IA e análises pré-jogo geradas pelo Claude.

## Funcionalidades

- **Escolha seu clube** — tema de cores dinâmico baseado nas cores do clube selecionado
- **Próximos jogos** — busca os próximos jogos na API-Football (janela de 90 dias)
- **Onde assistir** — busca confirmada via IA (Anthropic Claude ou Google Gemini com Google Search grounding)
- **Análise pré-jogo** — análise gerada pelo Claude Haiku com collapse/expand, com cache de 24h
- **Sugestões** — botão flutuante para envio de sugestões e reporte de erros

## Stack

- [Next.js 16](https://nextjs.org) · React 19 · TypeScript · Tailwind CSS v4
- [Anthropic Claude Haiku](https://anthropic.com) — análise pré-jogo + busca de transmissores
- [Google Gemini 2.5 Flash](https://ai.google.dev) — busca de transmissores com Google Search grounding
- [Upstash Redis](https://upstash.com) — cache de fixtures (6h), transmissores (24h) e análises (24h)
- [API-Football v3](https://www.api-football.com) — dados de fixtures, árbitros e estádios

## Configuração local

1. Clone o repositório e instale as dependências:

```bash
npm install
```

2. Crie o arquivo `.env.local` com as seguintes variáveis:

```env
API_FOOTBALL_KEY=...
ANTHROPIC_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
GEMINI_API_KEY=...
BROADCASTER_ENGINE=anthropic   # ou gemini
```

3. Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Deploy (Vercel)

Configure as mesmas variáveis de ambiente acima no painel da Vercel antes de fazer o deploy.

> **Nota:** o `BROADCASTER_ENGINE=gemini` requer uma conta com billing ativo no Google AI Studio. O padrão recomendado é `anthropic`.
