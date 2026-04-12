/**
 * CBF standings scraper for accumulated yellow/red cards.
 *
 * The CBF public website (www.cbf.com.br) includes yellow (CA) and red (CV)
 * card totals per team in the Série A standings table. This data is not
 * available in the api-football.com standings response, and is critical for
 * suspension tracking ("pendurados").
 *
 * Cache strategy (Redis key: `cbf:standings:serie-a:{season}`):
 *  - TTL: 6 h — standings update after each round, typically mid-week or weekend.
 *
 * The scraper maps team names to API-Football team IDs using the clubs.json
 * data file, so the card data can be merged into the existing StandingEntry[].
 */

import { getCache, setCache, TTL_6H } from '@/lib/redisCache';
import clubsData from '@/data/clubs.json';
import type { ClubTheme } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CBF_WWW_BASE = 'https://www.cbf.com.br';

/** Browser-like headers required by www.cbf.com.br */
const SCRAPER_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Cache-Control': 'no-cache',
  Referer: 'https://www.cbf.com.br/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CbfCardEntry {
  /** API-Football team ID (for merging with StandingEntry) */
  apiFootballId: number;
  yellowCards: number;
  redCards: number;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function cacheKey(season: number): string {
  return `cbf:standings:serie-a:${season}`;
}

// ─── Team name normalisation ──────────────────────────────────────────────────

const clubs = clubsData as ClubTheme[];

/**
 * Build a lookup map from normalised team name → API-Football ID.
 * CBF uses the full club name (e.g. "Flamengo", "Atlético Mineiro").
 * We normalise both sides to handle minor name differences.
 */
function buildNameMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const club of clubs) {
    if (club.apiFootballId === null) continue;
    map.set(normaliseName(club.name), club.apiFootballId);
    map.set(normaliseName(club.shortName), club.apiFootballId);
  }
  return map;
}

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── HTML parsing ─────────────────────────────────────────────────────────────

/**
 * Parse the CBF Série A standings page and extract card totals per team.
 *
 * The standings table structure:
 *   <table> or <tbody> with rows per team.
 *   Columns (by position, left to right):
 *     Pos | Team | PTS | J | V | E | D | GP | GC | SG | CA | CV | % | Recent | Next
 *
 * We identify CA and CV columns by their header text, falling back to
 * positional parsing if the header structure differs.
 */
function parseStandings(html: string, nameMap: Map<string, number>): CbfCardEntry[] {
  const entries: CbfCardEntry[] = [];

  // Find table rows — each row represents one team
  // Pattern: look for rows with a team name cell and numeric card values
  // The CBF table uses <tr> with multiple <td> cells
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Extract all cell text values from this row
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, '')  // strip HTML tags
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .trim();
      cells.push(text);
    }

    // We need at least 12 columns to have CA and CV
    if (cells.length < 12) continue;

    // Column layout (0-indexed): Pos(0) Team(1) PTS(2) J(3) V(4) E(5) D(6) GP(7) GC(8) SG(9) CA(10) CV(11)
    const teamCell = cells[1] ?? '';
    const caCell = cells[10] ?? '';
    const cvCell = cells[11] ?? '';

    const yellowCards = parseInt(caCell, 10);
    const redCards = parseInt(cvCell, 10);

    if (isNaN(yellowCards) || isNaN(redCards)) continue;

    // Try to match the team name to an API-Football ID
    const teamName = normaliseName(teamCell);
    const apiFootballId = nameMap.get(teamName);

    if (!apiFootballId) continue;

    entries.push({ apiFootballId, yellowCards, redCards });
  }

  return entries;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch (or return cached) accumulated card totals for all Série A teams.
 *
 * Returns a map from API-Football team ID → { yellowCards, redCards }.
 * Returns an empty map on fetch failure (non-critical data — don't break the page).
 *
 * @param season  e.g. 2026
 * @param force   Skip cache and re-fetch
 */
export async function getCbfSerieACards(
  season: number,
  force = false,
): Promise<Map<number, { yellowCards: number; redCards: number }>> {
  const key = cacheKey(season);

  if (!force) {
    const cached = await getCache<CbfCardEntry[]>(key);
    if (cached) return toMap(cached);
  }

  const url = `${CBF_WWW_BASE}/futebol-brasileiro/tabelas/campeonato-brasileiro/serie-a/${season}`;

  let html: string;
  try {
    const res = await fetch(url, {
      headers: SCRAPER_HEADERS,
      cache: 'no-store',
    });

    if (!res.ok) return new Map();
    html = await res.text();
  } catch {
    return new Map();
  }

  const nameMap = buildNameMap();
  const entries = parseStandings(html, nameMap);

  if (entries.length > 0) {
    await setCache(key, entries, TTL_6H);
  }

  return toMap(entries);
}

function toMap(entries: CbfCardEntry[]): Map<number, { yellowCards: number; redCards: number }> {
  return new Map(entries.map((e) => [e.apiFootballId, { yellowCards: e.yellowCards, redCards: e.redCards }]));
}
