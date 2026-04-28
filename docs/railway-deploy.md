# Deploy no Railway

## 1. Criar o projeto

1. Acesse [railway.app](https://railway.app) e crie um novo projeto
2. Escolha **Deploy from GitHub repo** e selecione este repositório
3. O Railway detecta automaticamente o `railway.toml` e usa Nixpacks para build

## 2. Variáveis de ambiente

Configure todas as variáveis abaixo em **Settings → Variables** do serviço:

### Obrigatórias

| Variável | Descrição |
|---|---|
| `UPSTASH_REDIS_REST_URL` | URL do Redis Upstash (mesmo do ambiente anterior) |
| `UPSTASH_REDIS_REST_TOKEN` | Token do Redis Upstash |
| `API_FOOTBALL_KEY` | Chave da API-Football v3 |
| `GEMINI_API_KEY` | Chave do Google Gemini |
| `JWT_SECRET` | Secret para assinar tokens JWT (gere com `openssl rand -hex 32`) |
| `CRON_SECRET` | Secret para autenticar chamadas dos cron jobs (gere com `openssl rand -hex 32`) |
| `NEXT_PUBLIC_BASE_URL` | URL pública do app, ex: `https://resenhaprejogo.app` |
| `RESEND_API_KEY` | Chave do Resend (envio de emails) |

### Opcionais

| Variável | Descrição |
|---|---|
| `DEBUG_SECRET` | Secret para endpoints de admin/debug |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Microsoft Clarity (analytics) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics |
| `SENTRY_DSN` | Sentry error tracking |
| `SENTRY_ORG` | Organização no Sentry |
| `SENTRY_PROJECT` | Projeto no Sentry |
| `SENTRY_AUTH_TOKEN` | Token do Sentry (necessário para source maps no build) |

> **Nota:** `VERCEL_URL` não existe no Railway. O app usa `NEXT_PUBLIC_BASE_URL` como fallback
> primário em `layout.tsx`, `robots.ts` e `sitemap.ts` — basta definir essa variável.

## 3. Cron jobs

O Railway não lê cron jobs do `railway.toml`. Configure os dois crons manualmente
no painel: **Settings → Cron Jobs** (ou crie um serviço Cron separado).

### docs-cron — processa PDFs da CBF (súmulas e boletins)

| Campo | Valor |
|---|---|
| Schedule | `0 13 * * *` (13h UTC diariamente) |
| Command | `curl -s -X GET https://SEU_DOMINIO/api/admin/run-docs-cron -H "Authorization: Bearer $CRON_SECRET"` |

### bolao-score — calcula pontuações do bolão

| Campo | Valor |
|---|---|
| Schedule | `0 3 * * *` (3h UTC diariamente) |
| Command | `curl -s -X POST https://SEU_DOMINIO/api/bolao/score -H "Authorization: Bearer $CRON_SECRET"` |

Substitua `SEU_DOMINIO` pelo domínio gerado pelo Railway (ex: `resenha-production.up.railway.app`)
ou pelo domínio customizado configurado.

## 4. Domínio customizado (opcional)

Em **Settings → Networking**, adicione seu domínio e configure o DNS:

```
CNAME  @  SEU_PROJETO.up.railway.app
```

Depois atualize `NEXT_PUBLIC_BASE_URL` com o domínio final.

## 5. O que mudou em relação à Vercel

| | Vercel (antes) | Railway (agora) |
|---|---|---|
| Timeout de funções | 10s (Hobby) / 300s (Pro) | Sem limite |
| Cron jobs | `vercel.json` | Painel do Railway |
| `maxDuration = 300` | Necessário no Hobby | Removido (desnecessário) |
| Variável de URL | `VERCEL_URL` | `NEXT_PUBLIC_BASE_URL` |

O arquivo `vercel.json` pode ser mantido no repositório sem efeito — o Railway o ignora.
