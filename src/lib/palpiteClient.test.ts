import { describe, it, expect, vi, afterEach } from 'vitest';
import { submitPalpite } from './palpiteClient';

function mockFetch(impl: () => Promise<unknown> | unknown) {
  global.fetch = vi.fn(impl as never) as never;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('submitPalpite', () => {
  it('returns { ok: true } when the request succeeds', async () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));

    const result = await submitPalpite('123', 2, 1);

    expect(result).toEqual({ ok: true });
  });

  it('PUTs to the fixture endpoint with the palpite body', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    global.fetch = fetchMock as never;

    await submitPalpite('456', 0, 3);

    expect(fetchMock).toHaveBeenCalledWith('/api/palpites/456', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ home: 0, away: 3 }),
    });
  });

  it('surfaces the backend error message on an HTTP error with a JSON body', async () => {
    mockFetch(() => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Palpite travado — jogo já começou' }),
    }));

    const result = await submitPalpite('123', 2, 1);

    expect(result).toEqual({ ok: false, error: 'Palpite travado — jogo já começou' });
  });

  it('falls back to the status code when the error body is not parseable JSON', async () => {
    mockFetch(() => ({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('not json');
      },
    }));

    const result = await submitPalpite('123', 2, 1);

    expect(result).toEqual({ ok: false, error: 'Erro 503' });
  });

  it('returns a connection error when fetch throws', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });

    const result = await submitPalpite('123', 2, 1);

    expect(result).toEqual({ ok: false, error: 'Falha de conexão' });
  });
});
