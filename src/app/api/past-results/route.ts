import { NextRequest, NextResponse } from 'next/server';
import { getFinishedFixturesByClub } from '@/lib/apiFootball';
import { getConmebolFinishedByTeam, CONMEBOL_TOURNAMENT_IDS } from '@/lib/conmebolApi';
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

// Competitions backed by CONMEBOL API
const CONMEBOL_COMPS = COMPETITIONS.filter(
  (c) => c.id === 'libertadores' || c.id === 'sul-americana',
);

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

  // ── Fetch all sources in parallel ────────────────────────────────────────
  const [conmebolResults, apiFootballOnlyResults, conmebolApifResults] = await Promise.all([
    // CONMEBOL source — only for clubs with a conmebolId
    Promise.allSettled(
      CONMEBOL_COMPS
        .filter(() => club.conmebolId !== null)
        .map(async (comp) => {
          const tid = CONMEBOL_TOURNAMENT_IDS[comp.id as keyof typeof CONMEBOL_TOURNAMENT_IDS];
          const raw = await getConmebolFinishedByTeam(tid, club.conmebolId!);
          return raw.map((m) => conmebolToMatch(m, comp.id));
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

  // ── Build API-Football fixture lookup: "YYYY-MM-DD:homeApiId:awayApiId" → Match ──
  // Used to cross-reference CONMEBOL matches and attach apiFootballFixtureId.
  const apifByKey = new Map<string, Match>();
  for (const result of conmebolApifResults) {
    if (result.status !== 'fulfilled') continue;
    for (const m of result.value) {
      const day = m.date.slice(0, 10);
      const key = `${day}:${m.homeTeam.id}:${m.awayTeam.id}`;
      apifByKey.set(key, m);
    }
  }

  // ── Enrich CONMEBOL matches with API-Football fixture IDs ─────────────────
  function enrichConmebol(matches: Match[]): Match[] {
    return matches.map((m) => {
      const homeApiId = conmebolToApiId.get(Number(m.homeTeam.id));
      const awayApiId = conmebolToApiId.get(Number(m.awayTeam.id));
      if (!homeApiId || !awayApiId) return m;
      const day = m.date.slice(0, 10);
      // Try exact day match; API-Football and CONMEBOL timestamps can differ by up to 1 day
      // due to timezone differences, so also try adjacent days.
      const apif =
        apifByKey.get(`${day}:${homeApiId}:${awayApiId}`) ??
        apifByKey.get(`${shiftDay(day, -1)}:${homeApiId}:${awayApiId}`) ??
        apifByKey.get(`${shiftDay(day, +1)}:${homeApiId}:${awayApiId}`);
      if (!apif) return m;
      return {
        ...m,
        apiFootballFixtureId: Number(apif.id),
        apiFootballHomeId:    homeApiId,
        apiFootballAwayId:    awayApiId,
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

  return NextResponse.json(matches, {
    headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=120' },
  });
}
