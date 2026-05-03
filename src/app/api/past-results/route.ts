import { NextRequest, NextResponse } from 'next/server';
import { and, eq, or, desc } from 'drizzle-orm';
import { getFinishedFixturesByClub } from '@/lib/apiFootball';
import { CONMEBOL_TOURNAMENT_IDS } from '@/lib/conmebolApi';
import { db } from '@/lib/db';
import { matchSnapshots } from '@/lib/db/schema';
import { COMPETITIONS } from '@/data/competitions';
import clubsData from '@/data/clubs.json';
import type { ClubTheme, ConmebolMatchDetail, Match } from '@/lib/types';

export const dynamic = 'force-dynamic';

const clubs = clubsData as ClubTheme[];

// ─── ID cross-reference maps ──────────────────────────────────────────────────

/** CONMEBOL team ID → API-Football team ID */
const conmebolToApiId = new Map<number, number>(
  clubs
    .filter((c) => c.conmebolId !== null && c.apiFootballId !== null)
    .map((c) => [c.conmebolId as number, c.apiFootballId as number]),
);

// CONMEBOL team ID → high-res CONMEBOL CDN logo (2x)
// For teams without a CONMEBOL ID mapping, crestUrl (1x) is used as fallback.
function teamLogo(_conmebolId: number, crestUrl: string): string {
  // Replace 1x with 2x in the CONMEBOL CDN URL for better resolution
  return crestUrl.replace('/1x/', '/2x/');
}

// Competitions that use API-Football as results fallback (non-CBF, non-CONMEBOL)
const API_FOOTBALL_ONLY_COMPS = COMPETITIONS.filter(
  (c) => c.scope === 'club' && !c.hasCbfData &&
  c.id !== 'libertadores' && c.id !== 'sul-americana',
);

// Competitions backed by CONMEBOL (data read from match_snapshots)
const CONMEBOL_COMPS = COMPETITIONS.filter(
  (c) => c.id === 'libertadores' || c.id === 'sul-americana',
);

const CONMEBOL_LEAGUE_IDS: Record<string, number> = {
  libertadores:     13,
  'sul-americana':  11,
};

// ─── CONMEBOL → Match converter ───────────────────────────────────────────────

function conmebolToMatch(m: ConmebolMatchDetail, competitionId: string): Match {
  const competition = CONMEBOL_COMPS.find((c) => c.id === competitionId)!;

  const leagueId = competition?.apiFootballLeagueId ?? 0;
  const competitionName = competition?.shortName ?? m.description;

  const homeScore = m.scoreEntries?.total?.home_score ?? m.homeScore ?? null;
  const awayScore = m.scoreEntries?.total?.away_score ?? m.awayScore ?? null;

  const scoreDetail: Match['scoreDetail'] = {};
  if (m.scoreEntries?.ht)        scoreDetail.ht        = { home: m.scoreEntries.ht.home_score,        away: m.scoreEntries.ht.away_score };
  if (m.scoreEntries?.et)        scoreDetail.et        = { home: m.scoreEntries.et.home_score,        away: m.scoreEntries.et.away_score };
  if (m.scoreEntries?.pen)       scoreDetail.pen       = { home: m.scoreEntries.pen.home_score,       away: m.scoreEntries.pen.away_score };
  if (m.scoreEntries?.aggregate) scoreDetail.aggregate = { home: m.scoreEntries.aggregate.home_score, away: m.scoreEntries.aggregate.away_score };

  const hadExtraTime = m.matchLengthMin !== null && m.matchLengthMin > 95;

  return {
    id:              String(m.id),
    homeTeam: {
      id:        String(m.home.id),
      name:      m.home.name,
      shortName: m.home.shortName,
      logo:      teamLogo(m.home.id, m.home.crestUrl),
    },
    awayTeam: {
      id:        String(m.away.id),
      name:      m.away.name,
      shortName: m.away.shortName,
      logo:      teamLogo(m.away.id, m.away.crestUrl),
    },
    date:            new Date(m.date * 1000).toISOString(),
    stadium:         m.venue,
    city:            null,
    competition:     competition?.name ?? competitionId,
    leagueId,
    competitionName,
    round:           m.stage,
    status:          'finished',
    score:           homeScore !== null && awayScore !== null ? { home: homeScore, away: awayScore } : undefined,
    scoreDetail:     Object.keys(scoreDetail).length > 0 ? scoreDetail : undefined,
    winner:          m.winner ?? undefined,
    hadExtraTime:    hadExtraTime || undefined,
    isNeutralVenue:  m.isNeutralVenue || undefined,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const clubSlug = req.nextUrl.searchParams.get('club');
  if (!clubSlug) {
    return NextResponse.json({ error: 'Missing "club" param' }, { status: 400 });
  }

  const club = clubs.find((c) => c.id === clubSlug);
  if (!club?.apiFootballId) {
    return NextResponse.json({ error: 'Club not found or missing apiFootballId' }, { status: 422 });
  }

  const teamApiId = club.apiFootballId;
  const conmebolTeamIdStr = club.conmebolId !== null ? String(club.conmebolId) : null;

  // ── Fetch all sources in parallel ────────────────────────────────────────
  const [conmebolResults, apiFootballOnlyResults, conmebolApifResults] = await Promise.all([
    // CONMEBOL source — read from match_snapshots (source of truth for finished matches)
    Promise.allSettled(
      CONMEBOL_COMPS
        .filter(() => conmebolTeamIdStr !== null)
        .map(async (comp) => {
          const leagueId = CONMEBOL_LEAGUE_IDS[comp.id];
          const rows = await db.select().from(matchSnapshots)
            .where(and(
              eq(matchSnapshots.source, 'conmebol'),
              eq(matchSnapshots.leagueId, leagueId),
              or(
                eq(matchSnapshots.homeTeamId, conmebolTeamIdStr!),
                eq(matchSnapshots.awayTeamId, conmebolTeamIdStr!),
              ),
            ))
            .orderBy(desc(matchSnapshots.matchDate))
            .limit(10);
          return rows.map(row => conmebolToMatch(row.rawPayload as ConmebolMatchDetail, comp.id));
        }),
    ),
    // API-Football for non-CONMEBOL competitions (Copa do Brasil, etc.)
    Promise.allSettled(
      API_FOOTBALL_ONLY_COMPS.map((comp) => getFinishedFixturesByClub(comp, teamApiId)),
    ),
    // API-Football fixtures for CONMEBOL competitions — always fetch for cross-reference
    // so we can enrich CONMEBOL matches with the correct API-Football fixture ID for events.
    Promise.allSettled(
      CONMEBOL_COMPS.map((comp) => getFinishedFixturesByClub(comp, teamApiId)),
    ),
  ]);

  // ── Build API-Football fixture lookups ────────────────────────────────────
  // Primary:  "YYYY-MM-DD:homeApiId:awayApiId" → Match  (both teams known)
  // Fallback: "YYYY-MM-DD:teamApiId"           → Match  (only one team known, e.g. foreign opponents)
  const apifByKey      = new Map<string, Match>();
  const apifByDayTeam  = new Map<string, Match>();
  for (const result of conmebolApifResults) {
    if (result.status !== 'fulfilled') continue;
    for (const m of result.value) {
      const day = m.date.slice(0, 10);
      apifByKey.set(`${day}:${m.homeTeam.id}:${m.awayTeam.id}`, m);
      // Index by each team so we can match even when the opponent has no CONMEBOL→AF mapping
      apifByDayTeam.set(`${day}:${m.homeTeam.id}`, m);
      apifByDayTeam.set(`${day}:${m.awayTeam.id}`, m);
    }
  }

  // ── Enrich CONMEBOL matches with API-Football fixture IDs ─────────────────
  function enrichConmebol(matches: Match[]): Match[] {
    return matches.map((m) => {
      const homeApiId = conmebolToApiId.get(Number(m.homeTeam.id));
      const awayApiId = conmebolToApiId.get(Number(m.awayTeam.id));
      // At least one Brazilian club must be identifiable for a cross-reference
      if (!homeApiId && !awayApiId) return m;

      const day = m.date.slice(0, 10);

      // Try exact match first (both teams are Brazilian clubs with known AF IDs)
      let apif: Match | undefined;
      if (homeApiId && awayApiId) {
        apif =
          apifByKey.get(`${day}:${homeApiId}:${awayApiId}`) ??
          apifByKey.get(`${shiftDay(day, -1)}:${homeApiId}:${awayApiId}`) ??
          apifByKey.get(`${shiftDay(day, +1)}:${homeApiId}:${awayApiId}`);
      }

      // Fallback: match by the known Brazilian club's AF ID alone (opponent is foreign)
      if (!apif) {
        const knownApiId = (homeApiId ?? awayApiId)!;
        apif =
          apifByDayTeam.get(`${day}:${knownApiId}`) ??
          apifByDayTeam.get(`${shiftDay(day, -1)}:${knownApiId}`) ??
          apifByDayTeam.get(`${shiftDay(day, +1)}:${knownApiId}`);
      }

      if (!apif) return m;

      // Resolve AF team IDs from the matched fixture: home/away position may differ from CONMEBOL
      const resolvedHomeApiId = homeApiId ?? Number(apif.homeTeam.id);
      const resolvedAwayApiId = awayApiId ?? Number(apif.awayTeam.id);

      return {
        ...m,
        apiFootballFixtureId: Number(apif.id),
        apiFootballHomeId:    resolvedHomeApiId,
        apiFootballAwayId:    resolvedAwayApiId,
        referee:              apif.referee,
      };
    });
  }

  function shiftDay(isoDay: string, deltaDays: number): string {
    const d = new Date(isoDay + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  }

  // ── Merge ──────────────────────────────────────────────────────────────────
  const matches: Match[] = [];

  for (const result of conmebolResults) {
    if (result.status === 'fulfilled') matches.push(...enrichConmebol(result.value));
  }
  for (const result of apiFootballOnlyResults) {
    if (result.status === 'fulfilled') matches.push(...result.value);
  }

  // If CONMEBOL returned nothing, use the API-Football fixtures as fallback.
  const hasConmebolData = matches.some((m) =>
    CONMEBOL_COMPS.some((c) => c.apiFootballLeagueId === m.leagueId),
  );
  if (club.conmebolId !== null && !hasConmebolData) {
    for (const result of conmebolApifResults) {
      if (result.status === 'fulfilled') matches.push(...result.value);
    }
  }

  matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Check if any match finished within the last 2 hours — use short CDN TTL so
  // scores appear quickly; otherwise use a longer TTL for stable historical data.
  const nowMs = Date.now();
  const hasRecentFinish = matches.some((m) => {
    const age = nowMs - new Date(m.date).getTime();
    return age < 2 * 60 * 60 * 1000;
  });
  const maxAge = hasRecentFinish ? 60 : 1800;

  return NextResponse.json(matches, {
    headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=30` },
  });
}
