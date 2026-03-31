// ─── Free-tier limits ─────────────────────────────────────────────────────────
//
// Limits reset every Monday (per "jornada" cycle).
// All data lives in localStorage — no server state required.
//
// Clubs  : user can explore up to FREE_CLUB_LIMIT different clubs per week.
// Details: per club, user can open the detailed view (H2H / Players) of up to
//          FREE_DETAIL_LIMIT different matches per week.

export const FREE_CLUB_LIMIT = 3;
export const FREE_DETAIL_LIMIT = 2;

const CLUBS_KEY = 'resenha-prejogo:free:clubs';
const DETAILS_KEY = 'resenha-prejogo:free:details';

// ─── Storage schemas ──────────────────────────────────────────────────────────

interface ClubsStore {
  week: string;   // Monday YYYY-MM-DD
  ids: string[];  // visited club IDs this week
}

interface DetailsStore {
  week: string;
  data: Record<string, string[]>; // clubId → matchIds[]
}

// ─── Week key (Monday ISO date) ───────────────────────────────────────────────

function weekKey(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

// ─── Clubs store ──────────────────────────────────────────────────────────────

export function readClubs(): ClubsStore {
  if (typeof window === 'undefined') return { week: weekKey(), ids: [] };
  try {
    const raw = localStorage.getItem(CLUBS_KEY);
    if (!raw) return { week: weekKey(), ids: [] };
    const parsed: ClubsStore = JSON.parse(raw);
    if (parsed.week !== weekKey()) return { week: weekKey(), ids: [] };
    return parsed;
  } catch {
    return { week: weekKey(), ids: [] };
  }
}

/** Returns true if the user can select (or has already selected) this clubId. */
export function canSelectClub(clubId: string): boolean {
  const { ids } = readClubs();
  return ids.includes(clubId) || ids.length < FREE_CLUB_LIMIT;
}

/** Records a club visit. Idempotent — safe to call multiple times. */
export function recordClub(clubId: string): void {
  if (typeof window === 'undefined') return;
  const rec = readClubs();
  if (rec.ids.includes(clubId)) return;
  localStorage.setItem(
    CLUBS_KEY,
    JSON.stringify({ week: rec.week, ids: [...rec.ids, clubId] }),
  );
}

export function clubsUsed(): number {
  return readClubs().ids.length;
}

// ─── Details store ────────────────────────────────────────────────────────────

export function readDetails(): DetailsStore {
  if (typeof window === 'undefined') return { week: weekKey(), data: {} };
  try {
    const raw = localStorage.getItem(DETAILS_KEY);
    if (!raw) return { week: weekKey(), data: {} };
    const parsed: DetailsStore = JSON.parse(raw);
    if (parsed.week !== weekKey()) return { week: weekKey(), data: {} };
    return parsed;
  } catch {
    return { week: weekKey(), data: {} };
  }
}

/** Returns true if this matchId detail can be viewed for the given clubId. */
export function canViewDetail(clubId: string, matchId: string): boolean {
  const { data } = readDetails();
  const matches = data[clubId] ?? [];
  return matches.includes(matchId) || matches.length < FREE_DETAIL_LIMIT;
}

/** Records a detail view. Idempotent — safe to call multiple times. */
export function recordDetail(clubId: string, matchId: string): void {
  if (typeof window === 'undefined') return;
  const rec = readDetails();
  const matches = rec.data[clubId] ?? [];
  if (matches.includes(matchId)) return;
  localStorage.setItem(
    DETAILS_KEY,
    JSON.stringify({ week: rec.week, data: { ...rec.data, [clubId]: [...matches, matchId] } }),
  );
}

export function detailsUsed(clubId: string): number {
  return (readDetails().data[clubId] ?? []).length;
}

export function detailsLeft(clubId: string): number {
  return Math.max(0, FREE_DETAIL_LIMIT - detailsUsed(clubId));
}
