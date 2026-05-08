import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, verifyAdminToken } from './adminSession';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length).trim();
}

function safeEquals(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(receivedBuffer, expectedBuffer);
}

/**
 * Accepts either:
 *  - `Authorization: Bearer <DEBUG_SECRET>` header (cron, scripts)
 *  - `sc_admin` cookie set after admin login (browser)
 */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const expected = process.env.DEBUG_SECRET;

  // Bearer fast path
  const bearer = getBearerToken(req);
  if (expected && bearer && safeEquals(bearer, expected)) return true;

  // Cookie path
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  return verifyAdminToken(cookie);
}

export function unauthorizedAdminResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized' },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer',
        'Cache-Control': 'no-store',
      },
    },
  );
}
