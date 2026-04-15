import { NextRequest, NextResponse } from 'next/server';
import { COMPETITIONS } from '@/data/competitions';
import { isAdminRequest, unauthorizedAdminResponse } from '@/lib/adminAuth';
import { getCache, deleteCache } from '@/lib/redisCache';
import { getFixturesByClub } from '@/lib/apiFootball';
import clubsData from '@/data/clubs.json';
import type { ClubTheme, Match } from '@/lib/types';

const clubs = clubsData as ClubTheme[];
const CLUB_COMPETITIONS = COMPETITIONS.filter((c) => c.scope === 'club');

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return unauthorizedAdminResponse();
  }

  const sp = req.nextUrl.searchParams;
  const clubSlug = sp.get('club'); // optional — show per-club match detail
  const bust = sp.get('bust') === '1';

  // Optionally bust all competition caches at once
  if (bust) {
    await Promise.all(CLUB_COMPETITIONS.map((c) => deleteCache(`fixtures:${c.id}`)));
  }

  // Snapshot cache state before fetching
  const cacheStatuses = await Promise.all(
    CLUB_COMPETITIONS.map(async (c) => {
      const cached = await getCache<unknown[]>(`fixtures:${c.id}`);
      return { id: c.id, status: cached ? 'HIT' : 'MISS', rawCount: cached?.length ?? 0 };
    }),
  );

  // Run through the same pipeline as /api/fixtures — all competitions merged
  const results = await Promise.allSettled(CLUB_COMPETITIONS.map((c) => getFixturesByClub(c)));

  const merged: Record<string, Match[]> = {};
  const seenFixtureIds = new Set<string>();
  const competitionErrors: string[] = [];

  CLUB_COMPETITIONS.forEach((comp, i) => {
    const result = results[i];
    if (result.status === 'rejected') {
      competitionErrors.push(`${comp.id}: ${String(result.reason)}`);
      return;
    }
    for (const [slug, matches] of Object.entries(result.value)) {
      if (!merged[slug]) merged[slug] = [];
      for (const match of matches) {
        if (!seenFixtureIds.has(match.id)) {
          seenFixtureIds.add(match.id);
          merged[slug].push(match);
        }
      }
    }
  });

  for (const slug in merged) {
    merged[slug].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // Per-club summary: slug → total count + breakdown by competition
  const clubSummary = Object.entries(merged)
    .map(([slug, matches]) => {
      const byComp: Record<string, number> = {};
      for (const m of matches) {
        byComp[m.competitionName] = (byComp[m.competitionName] ?? 0) + 1;
      }
      return {
        slug,
        name: clubs.find((c) => c.id === slug)?.name ?? slug,
        total: matches.length,
        byCompetition: byComp,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const clubDetail = clubSlug ? { slug: clubSlug, matches: merged[clubSlug] ?? [] } : undefined;

  return NextResponse.json(
    {
      cacheBusted: bust,
      caches: cacheStatuses,
      ...(competitionErrors.length ? { errors: competitionErrors } : {}),
      pipeline: {
        totalClubsWithMatches: clubSummary.length,
        clubsWithFewMatches: clubSummary.filter((c) => c.total < 3),
        allClubs: clubSummary,
        ...(clubDetail !== undefined ? { clubDetail } : {}),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
