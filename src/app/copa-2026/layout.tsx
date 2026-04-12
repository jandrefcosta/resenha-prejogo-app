import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Copa do Mundo 2026',
  description:
    'Todos os jogos da Copa do Mundo 2026. Horários, onde assistir, classificação dos grupos e análise das partidas.',
  keywords: [
    'Copa do Mundo 2026', 'World Cup 2026', 'Copa 2026',
    'jogos seleção brasileira', 'onde assistir Copa do Mundo',
    'classificação grupos Copa 2026', 'tabela Copa do Mundo',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Resenha Pré-Jogo',
    title: 'Copa do Mundo 2026 — Resenha Pré-Jogo',
    description:
      'Todos os jogos da Copa do Mundo 2026. Horários, onde assistir e classificação dos grupos.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Copa do Mundo 2026 — Resenha Pré-Jogo',
    description:
      'Todos os jogos da Copa do Mundo 2026. Horários, onde assistir e classificação dos grupos.',
  },
};

export default function CopaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
