# Funcionalidade: Seleção de Clube & Tema

## O que faz

Permite ao usuário escolher seu clube favorito entre os 20 da Série A. A escolha adapta toda a interface visualmente às cores oficiais do time selecionado e é persistida entre sessões.

---

## Fluxo do usuário

1. Na primeira visita, o modal de **Onboarding** aparece e leva o usuário à seleção de clube.
2. Em visitas seguintes, o clube salvo é carregado automaticamente do `localStorage`.
3. O usuário pode trocar de clube a qualquer momento clicando no nome/logo do time no header (abre o `ClubSelector`).

---

## Componentes

| Componente | Arquivo | Responsabilidade |
|------------|---------|-----------------|
| `ThemeProvider` | `src/components/ThemeProvider.tsx` | Context React com estado do clube; aplica variáveis CSS |
| `ClubSelector` | `src/components/ClubSelector.tsx` | Modal com grid dos 20 clubes; pesquisa e seleção |
| `HeroClubName` | `src/components/HeroClubName.tsx` | Exibe nome e escudo do clube selecionado no header |
| `InitialLoader` | `src/components/InitialLoader.tsx` | Skeleton overlay enquanto o tema carrega do localStorage |

---

## Dados dos clubes

Fonte: `src/data/clubs.json` — array estático com os 20 clubes.

Cada entrada tem:
```json
{
  "id": "flamengo",
  "name": "Flamengo",
  "shortName": "FLA",
  "city": "Rio de Janeiro",
  "state": "RJ",
  "stadium": "Maracanã",
  "apiFootballId": 127,
  "cbfId": 262,
  "colors": {
    "primary": "#E8172B",
    "secondary": "#000000",
    "accent": "#FF4757"
  },
  "textOnPrimary": "white"
}
```

**`textOnPrimary`** — define se o texto sobre a cor primária deve ser branco ou escuro (calculado pela luminância para garantir contraste acessível).

---

## Variáveis CSS do tema

O `ThemeProvider` injeta variáveis no `:root` ao selecionar um clube:

| Variável | Valor | Uso |
|----------|-------|-----|
| `--club-primary` | `colors.primary` | Gradiente do header, botão ativo |
| `--club-secondary` | `colors.secondary` | Contraste secundário |
| `--club-accent` | `colors.accent` | Destaques sutis |
| `--club-text-on-primary` | `white` ou `dark` | Cor de texto sobre o primário |

---

## Persistência

- **Chave localStorage:** `resenha-prejogo:club` — JSON do objeto `ClubTheme` completo
- Carregado sincronicamente no `ThemeProvider` via `useEffect` na montagem
- O `InitialLoader` exibe um skeleton até o tema ser aplicado, evitando flash de layout sem cor

---

## Comportamento de fallback

Se nenhum clube estiver salvo (primeira visita sem onboarding, ou localStorage limpo):
- A interface usa as variáveis CSS padrão (zinc/neutro)
- O `OnboardingModal` é exibido automaticamente para guiar a seleção

---

## Arquitetura relevante

```
localStorage → ThemeProvider (Context)
                    ↓
             CSS vars no :root
                    ↓
    Todos os componentes via Tailwind + var()
```

O clube selecionado é acessado por qualquer componente via `useTheme()` hook exportado do `ThemeProvider`.
