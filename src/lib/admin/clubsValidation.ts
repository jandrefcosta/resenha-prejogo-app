import clubsData from '@/data/clubs.json';
import type { ClubTheme } from '@/lib/types';

const clubs = clubsData as ClubTheme[];

export interface ClubValidation {
  slug: string;
  name: string;
  shortName: string;
  apiFootballId: number | null;
  cbfId: number | null | undefined;
  conmebolId: number | null;
  issues: string[];
}

export interface ClubsValidationResult {
  total: number;
  okCount: number;
  issueCount: number;
  clubs: ClubValidation[];
}

/**
 * Static validation of `clubs.json`. Does not call external APIs.
 * Flags missing required IDs, duplicate IDs across clubs, and slug duplicates.
 */
export function validateClubs(): ClubsValidationResult {
  const slugSeen = new Map<string, number>();
  const apiSeen = new Map<number, string[]>();
  const cbfSeen = new Map<number, string[]>();
  const conmebolSeen = new Map<number, string[]>();

  for (const c of clubs) {
    slugSeen.set(c.id, (slugSeen.get(c.id) ?? 0) + 1);
    if (c.apiFootballId !== null && c.apiFootballId !== undefined) {
      const list = apiSeen.get(c.apiFootballId) ?? [];
      list.push(c.id);
      apiSeen.set(c.apiFootballId, list);
    }
    if (c.cbfId !== null && c.cbfId !== undefined) {
      const list = cbfSeen.get(c.cbfId) ?? [];
      list.push(c.id);
      cbfSeen.set(c.cbfId, list);
    }
    if (c.conmebolId !== null && c.conmebolId !== undefined) {
      const list = conmebolSeen.get(c.conmebolId) ?? [];
      list.push(c.id);
      conmebolSeen.set(c.conmebolId, list);
    }
  }

  const validations: ClubValidation[] = clubs.map((c) => {
    const issues: string[] = [];

    if (c.apiFootballId === null || c.apiFootballId === undefined) {
      issues.push('sem apiFootballId');
    } else {
      const dups = apiSeen.get(c.apiFootballId) ?? [];
      if (dups.length > 1) issues.push(`apiFootballId duplicado com: ${dups.filter((s) => s !== c.id).join(', ')}`);
    }

    if (c.cbfId === null || c.cbfId === undefined) {
      issues.push('sem cbfId');
    } else {
      const dups = cbfSeen.get(c.cbfId) ?? [];
      if (dups.length > 1) issues.push(`cbfId duplicado com: ${dups.filter((s) => s !== c.id).join(', ')}`);
    }

    if (c.conmebolId !== null && c.conmebolId !== undefined) {
      const dups = conmebolSeen.get(c.conmebolId) ?? [];
      if (dups.length > 1) issues.push(`conmebolId duplicado com: ${dups.filter((s) => s !== c.id).join(', ')}`);
    }

    if ((slugSeen.get(c.id) ?? 0) > 1) issues.push('slug duplicado');

    return {
      slug: c.id,
      name: c.name,
      shortName: c.shortName,
      apiFootballId: c.apiFootballId,
      cbfId: c.cbfId,
      conmebolId: c.conmebolId,
      issues,
    };
  });

  validations.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return {
    total: validations.length,
    okCount: validations.filter((v) => v.issues.length === 0).length,
    issueCount: validations.filter((v) => v.issues.length > 0).length,
    clubs: validations,
  };
}
