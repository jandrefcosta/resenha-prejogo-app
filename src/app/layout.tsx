import type { Metadata } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

const barlow = Barlow({
  variable: '--font-barlow',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  variable: '--font-barlow-condensed',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

function getBaseUrl(): URL {
  if (process.env.NEXT_PUBLIC_BASE_URL) return new URL(process.env.NEXT_PUBLIC_BASE_URL);
  if (process.env.VERCEL_URL) return new URL(`https://${process.env.VERCEL_URL}`);
  return new URL('http://localhost:3000');
}

const DESCRIPTION =
  'Acompanhe os próximos jogos do seu clube no Brasileirão Série A. Onde assistir, horários, árbitros e análise pré-jogo com inteligência artificial.';

export const metadata: Metadata = {
  metadataBase: getBaseUrl(),
  title: {
    default: 'Resenha Pré-Jogo — Futebol Brasileiro',
    template: '%s · Resenha Pré-Jogo',
  },
  description: DESCRIPTION,
  keywords: [
    'Brasileirão', 'Série A', 'futebol brasileiro', 'próximos jogos',
    'onde assistir', 'transmissão', 'análise pré-jogo', 'IA',
  ],
  authors: [{ name: 'Resenha Pré-Jogo' }],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Resenha Pré-Jogo',
    title: 'Resenha Pré-Jogo — Futebol Brasileiro',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Resenha Pré-Jogo — Futebol Brasileiro',
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${barlow.variable} ${barlowCondensed.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
