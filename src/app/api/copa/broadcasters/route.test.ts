import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/app/api/copa/fixtures/route', () => ({
  getCopaFixtures: vi.fn(),
}));
vi.mock('@/lib/broadcasterSearch', () => ({
  getBroadcastersForFixture: vi.fn(),
}));

import { GET } from './route';
import { getCopaFixtures } from '@/app/api/copa/fixtures/route';
import { getBroadcastersForFixture } from '@/lib/broadcasterSearch';

function fixture(id: string) {
  return {
    id,
    homeTeam: { id: '6', name: 'Brasil', shortName: 'BRA', logo: '' },
    awayTeam: { id: '99', name: 'Escócia', shortName: 'ESC', logo: '' },
    date: '2026-06-20T19:00:00Z',
    round: 'Rodada 1',
    competition: 'World Cup',
    leagueId: 1,
    competitionName: 'Copa 2026',
    status: 'scheduled',
  };
}

function req(ids?: string) {
  const url =
    ids === undefined
      ? 'http://localhost/api/copa/broadcasters'
      : `http://localhost/api/copa/broadcasters?ids=${ids}`;
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  (getCopaFixtures as ReturnType<typeof vi.fn>).mockResolvedValue({
    phases: { Grupos: [fixture('100'), fixture('101')] },
    brazilTeamId: 6,
    updatedAt: '',
    ttlSeconds: 60,
  });
  (getBroadcastersForFixture as ReturnType<typeof vi.fn>).mockResolvedValue([
    { name: 'Globo', url: '' },
  ]);
});

describe('GET /api/copa/broadcasters', () => {
  it('returns {} when ids is missing', async () => {
    const res = await GET(req());
    expect(await res.json()).toEqual({});
    expect(getBroadcastersForFixture).not.toHaveBeenCalled();
  });

  it('returns broadcasters for a known fixture id', async () => {
    const res = await GET(req('100'));
    expect(await res.json()).toEqual({ '100': [{ name: 'Globo', url: '' }] });
    expect(getBroadcastersForFixture).toHaveBeenCalledTimes(1);
  });

  it('omits unknown ids without calling the engine', async () => {
    const res = await GET(req('100,999'));
    const body = await res.json();
    expect(body).toEqual({ '100': [{ name: 'Globo', url: '' }] });
    expect(body['999']).toBeUndefined();
    expect(getBroadcastersForFixture).toHaveBeenCalledTimes(1);
  });
});
