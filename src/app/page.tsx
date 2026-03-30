import { ClubSelector } from '@/components/ClubSelector';
import { MatchSection } from '@/components/MatchSection';
import { HeroClubName } from '@/components/HeroClubName';
import { FooterSuggestion, FloatingSuggestion } from '@/components/SuggestionModal';

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <header
        className="relative overflow-hidden px-4 pt-14 pb-12 sm:px-6"
        style={{
          background:
            'linear-gradient(160deg, var(--club-primary) 0%, var(--club-gradient-end) 65%, #09090b 100%)',
        }}
      >
        {/* Decorative blur blob */}
        <div
          className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full opacity-25 blur-3xl"
          style={{ backgroundColor: 'var(--club-accent)' }}
          aria-hidden="true"
        />

        <div className="relative max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-2 font-sans">
            Campeonato Brasileiro Série A
          </p>
          <HeroClubName />
          <p className="mt-3 text-base text-white/70 font-sans leading-relaxed">
            Próximos jogos, onde assistir &amp; análise pré-jogo com IA
          </p>
          <div className="mt-6">
            <ClubSelector />
          </div>
        </div>
      </header>

      {/* Main content — 48px+ section gaps as per skill guidelines */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        <MatchSection />
      </main>

      <footer className="py-6 flex items-center justify-center gap-3 text-xs text-zinc-600 font-sans">
        <span>Dados via API-Football</span>
        <span>·</span>
        <FooterSuggestion />
      </footer>

      <FloatingSuggestion />
    </div>
  );
}
