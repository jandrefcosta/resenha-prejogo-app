// Pure helpers for Copa do Mundo group-stage qualification — no Redis/Postgres
// imports, so they stay unit-testable in isolation (mirrors bolaoScoring.ts).

export type QualificationState =
  | 'qualified' // advanced to the knockout stage
  | 'possible'  // could still advance (group stage not finished)
  | 'none';     // out

/** A standings row carries this once it advances from the groups (e.g. "Round of 32"). */
function hasKnockoutMark(description: string | null): boolean {
  return !!description && /Round of/i.test(description);
}

/**
 * True once the knockout field is set — i.e. API-Football has stamped at least
 * one team with a qualification mark. Before this we are still in the group
 * stage and qualification is shown as a rank-based hint, not a fact.
 */
export function isKnockoutDecided(
  entries: { description: string | null }[],
): boolean {
  return entries.some((e) => hasKnockoutMark(e.description));
}

/**
 * Qualification zone for a single standings row.
 *
 * - decided → trust the API mark only (works for top-2 AND best third-placed,
 *   no rank math). An unmarked team is out, whatever its rank.
 * - undecided → fall back to the group-stage hint: top 2 qualify, 3rd is a
 *   possible (best-thirds) qualifier, the rest are out.
 */
export function qualificationState(
  entry: { rank: number; description: string | null },
  decided: boolean,
): QualificationState {
  if (decided) {
    return hasKnockoutMark(entry.description) ? 'qualified' : 'none';
  }
  if (entry.rank <= 2) return 'qualified';
  if (entry.rank === 3) return 'possible';
  return 'none';
}
