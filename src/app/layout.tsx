import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import Script from 'next/script';
import { ThemeProvider } from '@/components/ThemeProvider';
import { InitialLoader } from '@/components/InitialLoader';
import { AuthProvider } from '@/components/social/AuthProvider';
import { SocialDrawer } from '@/components/social/SocialDrawer';
import { SerwistProvider } from './serwist-provider';
import './globals.css';

const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? '';
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';

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
  return new URL('https://www.resenhaprejogo.app');
}

const DESCRIPTION =
  'Acompanhe os próximos jogos do seu clube no futebol brasileiro. Onde assistir, horários, árbitros e análise pré-jogo.';

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: getBaseUrl(),
  title: {
    default: 'Resenha Pré-Jogo — Futebol Brasileiro',
    template: '%s · Resenha Pré-Jogo',
  },
  description: DESCRIPTION,
  keywords: [
    'futebol brasileiro', 'próximos jogos', 'Brasileirão',
    'onde assistir', 'transmissão', 'análise pré-jogo', 'resenha pré-jogo',
  ],
  authors: [{ name: 'Resenha Pré-Jogo' }],
  robots: { index: true, follow: true },
  applicationName: 'Resenha Pré-Jogo',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Resenha Pré-Jogo',
  },
  formatDetection: { telephone: false },
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
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === 'development'}>
        <ThemeProvider>
          <AuthProvider>
            <InitialLoader />
            {children}
            <SocialDrawer />
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script
              id="google-analytics"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');`,
              }}
            />
          </>
        )}
        {CLARITY_PROJECT_ID && (
          <Script
            id="microsoft-clarity"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_PROJECT_ID}");`,
            }}
          />
        )}
        </SerwistProvider>
      </body>
    </html>
  );
}
