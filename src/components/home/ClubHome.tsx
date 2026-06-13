import { ClubSelector } from '@/components/ClubSelector';
import { MatchSection } from '@/components/MatchSection';
import { HeroClubName } from '@/components/HeroClubName';
import { FooterSuggestion, FloatingSuggestion } from '@/components/SuggestionModal';
import { OnboardingModal } from '@/components/OnboardingModal';
import { StandingsButton } from '@/components/StandingsModal';
import { RoundButton } from '@/components/RoundModal';
import { EmailSubscribeButton, EmailJourneyBanner } from '@/components/EmailCaptureModal';
import Link from 'next/link';

/** Club hub — served at `/` (outside the cup window) and `/meu-clube` (always). */
export function ClubHome() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <header
        className="relative overflow-hidden px-4 pb-12 sm:px-6"
        style={{
          background:
            'linear-gradient(160deg, var(--club-primary) 0%, var(--club-gradient-end) 65%, #09090b 100%)',
          /* Pull header up into the safe area zone so gradient covers the notch/Dynamic Island,
             then pad the content down by the same amount so nothing is hidden */
          marginTop: 'calc(-1 * env(safe-area-inset-top))',
          paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)',
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
            Resenha Pré-Jogo
          </p>
          <HeroClubName />
          <p className="mt-3 text-base text-white/70 font-sans leading-relaxed">
            Próximos jogos, onde assistir &amp; análise pré-jogo do seu clube
          </p>
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <ClubSelector />
            <StandingsButton />
            <RoundButton />
            <EmailSubscribeButton />
            <Link
              href="/bolao"
              className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 backdrop-blur-sm"
            >
              🏆 Bolão da Copa
            </Link>
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
      <EmailJourneyBanner />
      <OnboardingModal />
    </div>
  );
}
