import { NextRequest, NextResponse } from 'next/server';
import { getFinishedFixturesByClub } from '@/lib/apiFootball';
import { getConmebolFinishedByTeam, CONMEBOL_TOURNAMENT_IDS } from '@/lib/conmebolApi';
import { COMPETITIONS, getCompetitionByLeagueId } from '@/data/competitions';
import clubsData from '@/data/clubs.json';
import type { ClubTheme, ConmebolMatchDetail, Match } from '@/lib/types';

export const dynamic = 'force-dynamic';

const clubs = clubsData as ClubTheme[];

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
  const competition = CONMEBOL_COMPS.find((c) => {
    const tid = CONMEBOL_TOURNAMENT_IDS[c.id as keyof typeof CONMEBOL_TOURNAMENT_IDS];
    // We tag which tournament each match came from in the caller
    return c.id === competitionId;
  })!;

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
      logo:      m.home.crestUrl,
    },
    awayTeam: {
      id:        String(m.away.id),
      name:      m.away.name,
      shortName: m.away.shortName,
      logo:      m.away.crestUrl,
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

  // ── CONMEBOL source (Libertadores + Sul-Americana) ────────────────────────
  const conmebolResults = await Promise.allSettled(
    CONMEBOL_COMPS
      .filter(() => club.conmebolId !== null)
      .map(async (comp) => {
        const tid = CONMEBOL_TOURNAMENT_IDS[comp.id as keyof typeof CONMEBOL_TOURNAMENT_IDS];
        const raw = await getConmebolFinishedByTeam(tid, club.conmebolId!);
        return raw.map((m) => conmebolToMatch(m, comp.id));
      }),
  );

  // ── API-Football fallback for non-CONMEBOL competitions ───────────────────
  const apiFootballResults = await Promise.allSettled(
    API_FOOTBALL_ONLY_COMPS.map((comp) => getFinishedFixturesByClub(comp, teamApiId)),
  );

  // ── Merge ──────────────────────────────────────────────────────────────────
  const matches: Match[] = [];

  for (const result of conmebolResults) {
    if (result.status === 'fulfilled') matches.push(...result.value);
  }
  for (const result of apiFootballResults) {
    if (result.status === 'fulfilled') matches.push(...result.value);
  }

  // If club has conmebolId but CONMEBOL returned nothing, fall back to API-Football
  // for those competitions so the card doesn't appear empty.
  const conmebolCompIds = new Set(CONMEBOL_COMPS.map((c) => c.id));
  const hasConmebolData = matches.some((m) =>
    conmebolCompIds.has(COMPETITIONS.find((c) => c.apiFootballLeagueId === m.leagueId)?.id ?? ''),
  );

  if (club.conmebolId !== null && !hasConmebolData) {
    const fallback = await Promise.allSettled(
      CONMEBOL_COMPS.map((comp) => getFinishedFixturesByClub(comp, teamApiId)),
    );
    for (const result of fallback) {
      if (result.status === 'fulfilled') matches.push(...result.value);
    }
  }

  matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json(matches, {
    headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=120' },
  });
}
