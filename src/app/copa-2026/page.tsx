import { SELECAO_BRASILEIRA } from "@/data/national-teams";
import { CopaMatchSection } from "@/components/copa/CopaMatchSection";
import { GroupStandingsButton } from "@/components/copa/GroupStandingsModal";
import { BracketButton } from "@/components/copa/BracketModal";
import { BrazilCountdown } from "@/components/copa/BrazilCountdown";
import {
  FooterSuggestion,
  FloatingSuggestion,
} from "@/components/SuggestionModal";
import { CopaThemeApplier } from "@/components/copa/CopaThemeApplier";

export default function CopaPage() {
  return (
    <>
      {/* Apply the Seleção Brasileira theme globally — client-only, no flicker */}
      <CopaThemeApplier theme={SELECAO_BRASILEIRA} />

      <div className="flex flex-col min-h-screen">
        {/* Hero */}
        <header
          className="relative overflow-hidden px-4 pt-14 pb-12 sm:px-6"
          style={{
            background:
              "linear-gradient(160deg, #009C3B 0%, #007a2f 40%, #09090b 100%)",
          }}
        >
          {/* Decorative blur blob */}
          <div
            className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full opacity-20 blur-3xl"
            style={{ backgroundColor: "#002776" }}
            aria-hidden="true"
          />

          <div className="relative max-w-2xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-2 font-sans">
              Resenha Pré-Jogo
            </p>

            <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-white leading-none tracking-tight">
              Copa do Mundo <span style={{ color: "#FFDF00" }}>2026</span>
            </h1>

            <p className="mt-3 text-base text-white/70 font-sans leading-relaxed">
              Todos os jogos, horários e onde assistir
            </p>

            {/* Brazil group badge — hardcoded (confirmed via API: Group C) */}
            <div className="mt-4 inline-flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold font-sans border"
                style={{
                  backgroundColor: "rgba(251,191,36,0.12)",
                  borderColor: "rgba(251,191,36,0.30)",
                  color: "#fbbf24",
                }}
              >
                <span aria-hidden="true">🇧🇷</span>
                Grupo C
              </span>
              <span className="text-xs text-white/40 font-sans">
                Escócia · Haiti · Marrocos
              </span>
            </div>

            {/* Countdown to Brazil's first match (client-only, SSR-safe) */}
            <BrazilCountdown />

            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <a
                href="/meu-clube"
                className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 backdrop-blur-sm"
              >
                ← Brasileirão
              </a>
              <GroupStandingsButton />
              <BracketButton />
              <a
                href="/bolao"
                className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 min-h-[44px] text-sm font-medium font-sans text-white transition-all hover:bg-white/20 hover:border-white/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 backdrop-blur-sm"
              >
                🏆 Bolão da Copa
              </a>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <CopaMatchSection />
        </main>

        <footer className="py-6 flex items-center justify-center gap-3 text-xs text-zinc-600 font-sans">
          <span>Dados via API-Football</span>
          <span>·</span>
          <FooterSuggestion />
        </footer>

        <FloatingSuggestion />
      </div>
    </>
  );
}
