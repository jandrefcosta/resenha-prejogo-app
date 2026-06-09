import { describe, it, expect } from 'vitest';
import { resolveTeam } from './teamIdentity';

// Real clubs.json fixtures (Atlético Mineiro is mapped across all three sources):
//   apiFootballId 1062 · cbfId 62194 · conmebolId 58 · name "Atlético Mineiro" · shortName "GAL"

describe('resolveTeam', () => {
  it('canonicalises an API-Football team via apiFootballId', () => {
    const team = resolveTeam({
      source: 'apiFootball',
      sourceId: 1062,
      id: '1062',
      rawName: 'Atletico-MG',
    });
    expect(team).toEqual({
      id: '1062',
      name: 'Atlético Mineiro',
      shortName: 'GAL',
      logo: '/logos/1062.png',
    });
  });

  it('canonicalises a CBF team via cbfId while preserving the caller id', () => {
    const team = resolveTeam({
      source: 'cbf',
      sourceId: 62194,
      id: '1062', // CBF adapter assigns the API-Football id when known
      rawName: 'Atlético Mineiro',
    });
    expect(team).toEqual({
      id: '1062',
      name: 'Atlético Mineiro',
      shortName: 'GAL',
      logo: '/logos/1062.png',
    });
  });

  it('canonicalises a CONMEBOL team via conmebolId and prefers the LOCAL logo', () => {
    const team = resolveTeam({
      source: 'conmebol',
      sourceId: 58,
      id: '58', // CONMEBOL adapter keeps the CONMEBOL id
      rawName: 'CAM',
      rawShortName: 'CAM',
      rawLogo: 'https://cdn.conmebol.com/2x/atletico.png',
    });
    expect(team).toEqual({
      id: '58',
      name: 'Atlético Mineiro',
      shortName: 'GAL',
      logo: '/logos/1062.png',
    });
  });

  it('falls back to the raw CDN logo for an unmapped (foreign) CONMEBOL team', () => {
    const team = resolveTeam({
      source: 'conmebol',
      sourceId: 999999,
      id: '999999',
      rawName: 'River Plate',
      rawShortName: 'RIV',
      rawLogo: 'https://cdn.conmebol.com/2x/river.png',
    });
    expect(team).toEqual({
      id: '999999',
      name: 'River Plate',
      shortName: 'RIV',
      logo: 'https://cdn.conmebol.com/2x/river.png',
    });
  });

  it('derives a short name and omits the logo for an unmapped API-Football team', () => {
    const team = resolveTeam({
      source: 'apiFootball',
      sourceId: 999999,
      id: '999999',
      rawName: 'Sport Club Internacional',
    });
    expect(team).toEqual({
      id: '999999',
      name: 'Sport Club Internacional',
      shortName: 'INT', // prefixes stripped, first 3 chars uppercased
      logo: undefined,
    });
  });

  it('prefers a provided rawShortName over deriving one when the club is unmapped', () => {
    const team = resolveTeam({
      source: 'conmebol',
      sourceId: 999998,
      id: '999998',
      rawName: 'Club Atlético Peñarol',
      rawShortName: 'PEN',
      rawLogo: 'https://cdn.conmebol.com/2x/penarol.png',
    });
    expect(team.shortName).toBe('PEN');
  });
});
