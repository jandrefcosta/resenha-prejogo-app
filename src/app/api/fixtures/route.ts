import { NextResponse } from 'next/server';
import { getFixturesByClub } from '@/lib/apiFootball';
import { COMPETITIONS } from '@/data/competitions';
import type { Match } from '@/lib/types';

// All club-scope competitions to fetch in parallel
const CLUB_COMPETITIONS = COMPETITIONS.filter((c) => c.scope === 'club');

export const dynamic = 'force-dynamic';

export async function GET() {
  // Fetch all 4 club competitions in parallel; individual results are cached
  // independently in Redis (6 h each), so parallel calls are cheap after warm-up.
  const results = await Promise.allSettled(
    CLUB_COMPETITIONS.map((c) => getFixturesByClub(c)),
  );

  // Merge by club slug — deduplicate per slug to avoid double-counting if the same fixture
  // appears in multiple competition results for the same club (edge case).
  // NOTE: dedup must be per-slug, not global — the same fixture legitimately belongs to
  // both the home club and the away club, so a global set would erase one side.
  const merged: Record<string, Match[]> = {};
  const seenBySlug: Record<string, Set<string>> = {};

  for (const result of results) {
    if (result.status === 'rejected') continue;
    for (const [slug, matches] of Object.entries(result.value)) {
      if (!merged[slug]) merged[slug] = [];
      if (!seenBySlug[slug]) seenBySlug[slug] = new Set();
      for (const match of matches) {
        if (!seenBySlug[slug].has(match.id)) {
          seenBySlug[slug].add(match.id);
          merged[slug].push(match);
        }
      }
    }
  }

  // Sort each club's matches chronologically
  for (const slug in merged) {
    merged[slug].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // Public, no user-specific data — let Vercel Edge cache for 6h (matches Redis TTL).
  // stale-while-revalidate gives 10min buffer for background refresh without user-visible latency.
  return NextResponse.json(merged, {
    headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=600' },
  });
}
