import type { ClubTheme } from '@/lib/types';

/**
 * ClubTheme for the Brazilian national team.
 * Used as the fixed theme for the /copa-2026 page.
 * ThemeProvider accepts any ClubTheme — no changes needed there.
 */
export const SELECAO_BRASILEIRA: ClubTheme = {
  id: 'selecao-brasileira',
  name: 'Seleção Brasileira',
  shortName: 'Brasil',
  city: '',
  state: '',
  stadium: '',
  /** API-Football team ID — confirmed via API call (Copa 2022 + 2026 fixtures) */
  apiFootballId: 6,
  cbfId: undefined,
  conmebolId: null,
  colors: {
    primary: '#009C3B',   // verde brasil
    secondary: '#FFDF00', // amarelo
    accent: '#002776',    // azul
  },
  textOnPrimary: 'white',
};
