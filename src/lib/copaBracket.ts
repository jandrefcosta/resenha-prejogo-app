// Pure adapter: turns the Copa fixtures payload (phase → matches) into a
// laid-out knockout tree for the bracket view. No React/server imports, so it
// is unit-testable in isolation.

import type { Match } from './types';
import { KNOCKOUT_PHASE_ORDER, PHASE_LABELS } from './copaPhases';

export interface BracketNode {
  match: Match;
  /** Vertical centre of the node, in leaf-row units (leaf spacing = 1). */
  y: number;
  /** Fixture ids of the previous-column matches that feed this one (0–2). */
  feederIds: string[];
}

export interface BracketColumn {
  /** API-Football round key, e.g. "Round of 32". */
  key: string;
  /** pt-BR display label. */
  label: string;
  nodes: BracketNode[];
}

export interface BracketTree {
  columns: BracketColumn[];
}

function byDate(a: Match, b: Match): number {
  return new Date(a.date).getTime() - new Date(b.date).getTime();
}

/**
 * Builds the knockout bracket from the fixtures payload.
 *
 * Linkage is derived dynamically: a match's feeders are the previous-column
 * matches whose `advancedTeamId` is one of this match's two teams. This stays
 * correct as results land — no hardcoded 2026 allocation table — and simply
 * shows no connector until the feeding ties are decided.
 */
export function buildBracketTree(phases: Record<string, Match[]>): BracketTree {
  const presentRounds = KNOCKOUT_PHASE_ORDER.filter(
    (key) => (phases[key]?.length ?? 0) > 0,
  );

  const columns: BracketColumn[] = [];
  let prev: BracketNode[] = [];

  for (const key of presentRounds) {
    const matches = [...phases[key]].sort(byDate);

    const nodes: BracketNode[] = matches.map((m, i) => {
      const feeders = prev.filter(
        (p) =>
          p.match.advancedTeamId !== undefined &&
          (p.match.advancedTeamId === m.homeTeam.id ||
            p.match.advancedTeamId === m.awayTeam.id),
      );
      const feederIds = feeders.map((f) => f.match.id);
      // Centre between feeders when known; otherwise fall back to date order so
      // unresolved matches still get a stable, monotonic position.
      const y =
        feeders.length > 0
          ? feeders.reduce((sum, f) => sum + f.y, 0) / feeders.length
          : i;
      return { match: m, y, feederIds };
    });

    nodes.sort((a, b) => a.y - b.y || byDate(a.match, b.match));

    columns.push({ key, label: PHASE_LABELS[key] ?? key, nodes });
    prev = nodes;
  }

  return { columns };
}
