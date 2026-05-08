import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/adminAuth', () => ({
  isAdminRequest: vi.fn().mockResolvedValue(true),
  unauthorizedAdminResponse: vi.fn(() => new Response('Unauthorized', { status: 401 })),
}));

vi.mock('@/lib/cbfApi', () => ({
  getCbfRound: vi.fn(),
}));

vi.mock('@/lib/cbfDocParser', () => ({
  resolvePdfUrls: vi.fn(),
  downloadPdf: vi.fn(),
  processMatchDocuments: vi.fn(),
}));

vi.mock('@/lib/cbfPdfStore', () => ({
  deletePdfs: vi.fn().mockResolvedValue(undefined),
  savePdf: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/redisCache', () => ({
  deleteCache: vi.fn().mockResolvedValue(undefined),
}));

import { getCbfRound } from '@/lib/cbfApi';
import { resolvePdfUrls, downloadPdf, processMatchDocuments } from '@/lib/cbfDocParser';
import { isAdminRequest, unauthorizedAdminResponse } from '@/lib/adminAuth';

const mockGetCbfRound    = vi.mocked(getCbfRound);
const mockResolvePdfUrls = vi.mocked(resolvePdfUrls);
const mockDownloadPdf    = vi.mocked(downloadPdf);
const mockProcessMatch   = vi.mocked(processMatchDocuments);
const mockIsAdminRequest = vi.mocked(isAdminRequest);
const mockUnauthorized   = vi.mocked(unauthorizedAdminResponse);

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/force-reprocess-docs', { method: 'POST' });
}

const FAKE_BUFFER = new ArrayBuffer(8);

const MATCH = {
  idJogo: '999001',
  mandante:  { nome: 'Atletico' },
  visitante: { nome: 'Flamengo' },
  documentos: [],
  data: '01/01/2026',
} as any;

describe('POST /api/admin/force-reprocess-docs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdminRequest.mockResolvedValue(true);

    mockGetCbfRound.mockImplementation(async (r: number) => {
      if (r === 1) return { round: 1, status: 'finished', matches: [MATCH], fetchedAt: '', ttlSeconds: 0 } as any;
      return { round: r, status: 'scheduled', matches: [], fetchedAt: '', ttlSeconds: 0 } as any;
    });

    mockResolvePdfUrls.mockResolvedValue({ sumula: 'http://cbf.com/s.pdf', boletim: 'http://cbf.com/b.pdf' });
    mockDownloadPdf.mockResolvedValue(FAKE_BUFFER);
    mockProcessMatch.mockResolvedValue({ available: true, sumula: {} as any, boletim: {} as any });
  });

  it('returns 401 when not authenticated', async () => {
    mockIsAdminRequest.mockResolvedValueOnce(false);
    mockUnauthorized.mockReturnValueOnce(new Response('Unauthorized', { status: 401 }) as any);

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('counts a processed match when parse succeeds', async () => {
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.rounds).toBe(1);
    expect(body.processed).toBe(1);
    expect(body.errors).toBe(0);
    expect(body.unavailable).toBe(0);
    expect(body.durationMs).toBeTypeOf('number');
  });

  it('counts unavailable when no PDFs can be downloaded', async () => {
    mockDownloadPdf.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.unavailable).toBe(1);
    expect(body.processed).toBe(0);
  });

  it('counts error when processMatchDocuments throws', async () => {
    mockProcessMatch.mockRejectedValueOnce(new Error('parse failure'));

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.errors).toBe(1);
    expect(body.processed).toBe(0);
  });

  it('skips non-finished rounds', async () => {
    mockGetCbfRound.mockResolvedValue({ status: 'scheduled', matches: [] } as any);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.rounds).toBe(0);
    expect(body.ok).toBe(false);
    expect(body.processed).toBe(0);
  });

  it('counts unavailable when processMatchDocuments returns available: false', async () => {
    mockProcessMatch.mockResolvedValue({ available: false });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.unavailable).toBe(1);
    expect(body.processed).toBe(0);
  });
});
