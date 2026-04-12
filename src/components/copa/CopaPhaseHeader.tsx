/**
 * Translates API-Football round strings to pt-BR labels.
 * Used inside CopaMatchSection to label each match sub-group within a phase tab.
 */

/** Maps league.round values (from API-Football) to pt-BR display strings */
export const PHASE_LABELS: Record<string, string> = {
  'Group Stage - 1': 'Rodada 1 — Fase de Grupos',
  'Group Stage - 2': 'Rodada 2 — Fase de Grupos',
  'Group Stage - 3': 'Rodada 3 — Fase de Grupos',
  'Round of 16':     'Oitavas de Final',
  'Quarter-finals':  'Quartas de Final',
  'Semi-finals':     'Semifinais',
  '3rd Place Final': 'Disputa de 3º Lugar',
  'Final':           'Final',
};

interface CopaPhaseHeaderProps {
  /** Raw league.round string from the API or the "Grupos" tab key */
  phase: string;
  matchCount?: number;
}

export function CopaPhaseHeader({ phase, matchCount }: CopaPhaseHeaderProps) {
  const label = PHASE_LABELS[phase] ?? phase;
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400 font-sans">
        {label}
      </h2>
      {matchCount !== undefined && (
        <span className="text-xs text-zinc-600 font-sans">
          ({matchCount} {matchCount === 1 ? 'jogo' : 'jogos'})
        </span>
      )}
    </div>
  );
}
