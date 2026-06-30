import { describe, it, expect } from 'vitest';
import { buildBracketTree } from './copaBracket';
import type { Match } from './types';

// Minimal Match builder — only the fields the bracket adapter reads.
function match(
  id: string,
  phase: string,
  date: string,
  homeId: string,
  awayId: string,
  advancedTeamId?: string,
): Match {
  return {
    id,
    homeTeam: { id: homeId, name: `T${homeId}`, shortName: homeId, logo: '' },
    awayTeam: { id: awayId, name: `T${awayId}`, shortName: awayId, logo: '' },
    date,
    stadium: null,
    city: null,
    competition: 'World Cup',
    leagueId: 1,
    competitionName: 'Copa 2026',
    competitionPhase: phase,
    round: phase,
    status: advancedTeamId ? 'finished' : 'scheduled',
    ...(advancedTeamId ? { advancedTeamId } : {}),
  };
}

describe('buildBracketTree', () => {
  it('excludes the group stage and orders knockout columns', () => {
    const tree = buildBracketTree({
      Grupos: [match('g1', 'Grupos', '2026-06-12T00:00:00Z', '1', '2')],
      'Round of 16': [match('o1', 'Round of 16', '2026-07-01T00:00:00Z', '1', '3')],
      'Round of 32': [match('r1', 'Round of 32', '2026-06-29T00:00:00Z', '1', '2')],
    });
    expect(tree.columns.map((c) => c.key)).toEqual(['Round of 32', 'Round of 16']);
  });

  it('labels each column in pt-BR', () => {
    const tree = buildBracketTree({
      'Round of 32': [match('r1', 'Round of 32', '2026-06-29T00:00:00Z', '1', '2')],
    });
    expect(tree.columns[0].label).toBe('16 avos de Final');
  });

  it('orders the first column by kickoff time and assigns leaf positions', () => {
    const tree = buildBracketTree({
      'Round of 32': [
        match('late', 'Round of 32', '2026-06-29T20:00:00Z', '3', '4'),
        match('early', 'Round of 32', '2026-06-29T12:00:00Z', '1', '2'),
      ],
    });
    const col = tree.columns[0];
    expect(col.nodes.map((n) => n.match.id)).toEqual(['early', 'late']);
    expect(col.nodes.map((n) => n.y)).toEqual([0, 1]);
  });

  it('links a downstream match to the two feeders it came from and centres it between them', () => {
    const tree = buildBracketTree({
      'Round of 32': [
        match('r1', 'Round of 32', '2026-06-29T00:00:00Z', 'A', 'B', 'A'),
        match('r2', 'Round of 32', '2026-06-29T03:00:00Z', 'C', 'D', 'C'),
        match('r3', 'Round of 32', '2026-06-29T06:00:00Z', 'E', 'F', 'E'),
        match('r4', 'Round of 32', '2026-06-29T09:00:00Z', 'G', 'H', 'G'),
      ],
      'Round of 16': [
        match('o1', 'Round of 16', '2026-07-01T00:00:00Z', 'A', 'C'),
        match('o2', 'Round of 16', '2026-07-01T03:00:00Z', 'E', 'G'),
      ],
    });
    const o = tree.columns[1].nodes;
    const o1 = o.find((n) => n.match.id === 'o1')!;
    const o2 = o.find((n) => n.match.id === 'o2')!;
    expect(new Set(o1.feederIds)).toEqual(new Set(['r1', 'r2']));
    expect(o1.y).toBe(0.5); // centred between feeders at y=0 and y=1
    expect(new Set(o2.feederIds)).toEqual(new Set(['r3', 'r4']));
    expect(o2.y).toBe(2.5);
  });

  it('keeps unresolved downstream matches (no feeders yet) without crashing', () => {
    const tree = buildBracketTree({
      'Round of 32': [match('r1', 'Round of 32', '2026-06-29T00:00:00Z', 'A', 'B')],
      'Round of 16': [match('o1', 'Round of 16', '2026-07-01T00:00:00Z', 'A', 'C')],
    });
    const o1 = tree.columns[1].nodes[0];
    expect(o1.feederIds).toEqual([]); // r1 not finished → no advancedTeamId → no link
    expect(typeof o1.y).toBe('number');
  });
});
