# Funcionalidade: Compartilhamento

## O que faz

Permite ao usuário compartilhar informações de um jogo ou da rodada completa via share sheet nativo do dispositivo (WhatsApp, Telegram, SMS, etc.) ou diretamente para o WhatsApp como fallback em desktop.

---

## Superfícies de compartilhamento

| Onde | O que compartilha |
|------|------------------|
| `MatchCard` | Informações de um jogo específico (times, data, horário, transmissão) |
| `RoundModal` | Todos os jogos da rodada atual |

---

## Implementação técnica

### Estratégia principal: Web Share API

```typescript
async function handleShare(text: string) {
  if (navigator.share) {
    await navigator.share({ text });
  } else {
    // fallback desktop
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }
}
```

**Por que Web Share API em vez de `<a href="wa.me">` direto?**

O link `<a target="_blank">` falha silenciosamente em alguns cenários:
- iOS Safari em modo PWA: links `_blank` são bloqueados por padrão
- Android WebView: depende da configuração do WebView
- Alguns browsers bloqueiam popups por política de segurança

A Web Share API usa o mecanismo nativo do sistema operacional, que sempre funciona.

### Fallback desktop

Em desktop (onde `navigator.share` geralmente não existe), abre `wa.me/?text=...` em nova aba. Isso garante cobertura cross-platform.

---

## Texto gerado

### MatchCard (jogo individual)

```
⚽ Flamengo × Palmeiras
📅 Sábado, 12 de abril — 18h30
🏟️ Maracanã, Rio de Janeiro
📺 Globo, Premiere

#Brasileirao #SerieA
```

### RoundModal (rodada completa)

```
Rodada 5 — Brasileirão Série A 🇧🇷

Quarta, 9 de abril
• Flamengo × Palmeiras - 20h00 (Globo)
• Corinthians × Santos - 20h30 (SporTV)

Sábado, 12 de abril
• Atlético-MG × Grêmio - 16h00 (Premiere)
• São Paulo × Botafogo - 18h30 (SporTV)

via Resenha Pré-Jogo
```

---

## Componentes relevantes

| Componente | Função no share |
|------------|----------------|
| `MatchCard` | `buildShareText()` monta o texto; `handleShare()` executa |
| `RoundModal` | `buildShareText()` monta o texto da rodada; `handleShare()` executa |

O botão usa `<button onClick={handleShare}>` em vez de `<a href>` para controle total do fluxo.

---

## Ícone

O botão de share usa um ícone de compartilhamento genérico (não o logo do WhatsApp) pois o share sheet pode abrir qualquer app de mensagem — não necessariamente o WhatsApp.

---

## Compatibilidade

| Plataforma | Comportamento |
|-----------|--------------|
| iOS Safari | Web Share API nativa → share sheet do iOS |
| iOS Safari PWA | Web Share API nativa → funciona (soluciona problema do `_blank`) |
| Android Chrome | Web Share API nativa → share sheet do Android |
| Desktop Chrome/Firefox | `navigator.share` geralmente não existe → fallback WhatsApp |
| Desktop Safari | `navigator.share` disponível no macOS 12+ |
