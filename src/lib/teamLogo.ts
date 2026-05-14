import clubsData from '@/data/clubs.json';
import type { ClubTheme } from '@/lib/types';

const knownLogoIds = new Set(
  (clubsData as ClubTheme[])
    .filter((c) => c.apiFootballId !== null)
    .map((c) => c.apiFootballId as number),
);

/** Returns a local logo path for known clubs, or undefined for unknown teams. */
export function teamLogoUrl(apiFootballId: number | string | null | undefined): string | undefined {
  if (apiFootballId == null) return undefined;
  const id = Number(apiFootballId);
  return knownLogoIds.has(id) ? `/logos/${id}.png` : undefined;
}
