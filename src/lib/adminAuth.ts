import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';

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

export function isAdminRequest(req: NextRequest): boolean {
  const expected = process.env.DEBUG_SECRET;
  const received = getBearerToken(req);

  if (!expected || !received) return false;
  return safeEquals(received, expected);
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
