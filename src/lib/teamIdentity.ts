import clubsData from '@/data/clubs.json';
import type { ClubTheme, MatchTeam } from '@/lib/types';
import { teamLogoUrl } from '@/lib/teamLogo';

const clubs = clubsData as ClubTheme[];

// ─── Canonical lookup maps (built once at module init) ────────────────────────
// clubs.json is the single source of truth for a club's display identity. Each
// upstream feed (API-Football, CBF, CONMEBOL) keys into it by its own native id.

const byApiFootballId = new Map<number, ClubTheme>(
  clubs.filter((c) => c.apiFootballId !== null).map((c) => [c.apiFootballId as number, c]),
);
const byCbfId = new Map<number, ClubTheme>(
  clubs.filter((c) => c.cbfId != null).map((c) => [c.cbfId as number, c]),
);
const byConmebolId = new Map<number, ClubTheme>(
  clubs.filter((c) => c.conmebolId !== null).map((c) => [c.conmebolId as number, c]),
);

/** The upstream feed a raw team came from — determines which id maps into clubs.json. */
export type TeamSource = 'apiFootball' | 'cbf' | 'conmebol';

export interface ResolveTeamInput {
  source: TeamSource;
  /** Native id from the source, used to look the club up in clubs.json. */
  sourceId: number | string;
  /** Id assigned to the resulting MatchTeam — the caller owns its semantics. */
  id: string;
  /** Source name, already source-cleaned; used as a fallback when the club is unmapped. */
  rawName: string;
  /** Source short name; used when the club is unmapped. */
  rawShortName?: string;
  /** Source-provided remote logo (e.g. CONMEBOL CDN crest); used only when no local logo exists. */
  rawLogo?: string;
}

function lookup(source: TeamSource, sourceId: number | string): ClubTheme | undefined {
  const n = Number(sourceId);
  if (Number.isNaN(n)) return undefined;
  switch (source) {
    case 'apiFootball': return byApiFootballId.get(n);
    case 'cbf':         return byCbfId.get(n);
    case 'conmebol':    return byConmebolId.get(n);
  }
}

/** Crude 3-letter abbreviation used only for clubs absent from clubs.json. */
function deriveShortName(name: string): string {
  return name
    .replace(/^(Clube |Esporte Clube |Sport Club |Sociedade Esportiva )/i, '')
    .substring(0, 3)
    .toUpperCase();
}

/**
 * Resolves a raw team from any feed into a canonical MatchTeam.
 *
 * When the club is known in clubs.json its display name, short name and the
 * house-style local logo win — so the same club looks identical across every
 * competition. Unmapped clubs (foreign opponents, minor cup sides) fall back to
 * the source-provided values, including a remote logo when one exists.
 */
export function resolveTeam(input: ResolveTeamInput): MatchTeam {
  const club = lookup(input.source, input.sourceId);
  return {
    id: input.id,
    name: club?.name ?? input.rawName,
    shortName: club?.shortName ?? input.rawShortName ?? deriveShortName(input.rawName),
    logo: (club ? teamLogoUrl(club.apiFootballId) : undefined) ?? input.rawLogo,
  };
}
