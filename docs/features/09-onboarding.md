# Funcionalidade: Onboarding

## O que faz

Apresenta o aplicativo ao usuário na primeira visita com um modal de boas-vindas em 2 etapas: apresentação das funcionalidades e seleção do clube favorito. Após completar ou ignorar, nunca mais aparece.

---

## Fluxo do usuário

### Etapa 1 — Boas-vindas (Welcome)
- Lista as 3 funcionalidades principais (Próximos jogos, Onde assistir, Análise pré-jogo)
- Dois botões: **"Escolher meu clube"** (avança) e **"Pular"** (dispensa)

### Etapa 2 — Seleção de clube (Club)
- Grid com todos os 20 clubes (logo + nome)
- Botão voltar para retornar à etapa 1
- Ao clicar em um clube: seleciona, dispensa o modal, aplica o tema

---

## Quando aparece

O modal é exibido **somente** quando:
- `localStorage.getItem('resenha-prejogo:onboarded')` é `null` **E**
- `localStorage.getItem('resenha-prejogo:club')` é `null`

Ou seja: aparece uma vez na primeira visita. Se o usuário já tinha um clube salvo (sessão anterior), não aparece.

---

## Dispensa (dismiss)

O modal é dispensado quando:
- O usuário clica **"Pular"**
- O usuário clica no **backdrop** (área escura ao redor)
- O usuário seleciona um clube
- O usuário pressiona **Escape**

Ao dispensar: `localStorage.setItem('resenha-prejogo:onboarded', '1')` é gravado.

---

## Componente

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `OnboardingModal` | `src/components/OnboardingModal.tsx` | Modal completo com 2 etapas |
| `WelcomeStep` | dentro de `OnboardingModal.tsx` | Etapa 1: apresentação de features |
| `ClubStep` | dentro de `OnboardingModal.tsx` | Etapa 2: grid de seleção de clubes |
| `StepDots` | dentro de `OnboardingModal.tsx` | Indicador de progresso (1 de 2 / 2 de 2) |

---

## Layout adaptativo

O modal usa `min(480px, calc(100dvh - 2rem))` para adaptar a altura à tela:
- Em telas altas (desktop, tablets): altura máxima de 480px
- Em telas curtas (iPhone SE, landscape): encolhe até 2rem de margem acima/abaixo

Isso garante que o botão **"Escolher meu clube"** nunca fique cortado.

**Safe area insets** — respeitados para dispositivos com notch ou barra de início do iOS:
```css
padding-top: max(1rem, env(safe-area-inset-top))
padding-bottom: max(1rem, env(safe-area-inset-bottom))
```

**Flex shrink na lista de features** — a `<ul>` de funcionalidades tem `min-h-0 overflow-y-auto` para permitir que o flex container encolha sem cortar os botões de ação.

---

## Acessibilidade

- `role="dialog"` e `aria-modal="true"` no container
- `aria-label` descritivo
- `useFocusTrap` — o foco é preso dentro do modal enquanto aberto (Tab cycling)
- Escape fecha o modal
- Botão "Voltar" com `aria-label="Voltar"`
- Indicador de etapas com `aria-label="Passo N de 2"`

---

## Chaves localStorage

| Chave | Valor | Significado |
|-------|-------|-------------|
| `resenha-prejogo:onboarded` | `"1"` | Usuário já passou pelo onboarding |
| `resenha-prejogo:club` | JSON do `ClubTheme` | Clube selecionado |

O onboarding só aparece quando **ambas** estiverem ausentes.
