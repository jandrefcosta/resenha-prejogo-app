import { SignJWT, jwtVerify } from 'jose';

export const ADMIN_COOKIE = 'sc_admin';
const ADMIN_TTL = '12h';

// Lazy — Next.js evaluates this module at build time (page-data collection),
// when only build-time env vars are present. Throwing here would break the
// build even though DEBUG_SECRET is correctly set for runtime.
function getSecret(): Uint8Array {
  if (!process.env.DEBUG_SECRET) {
    throw new Error('DEBUG_SECRET env var is required');
  }
  return new TextEncoder().encode(process.env.DEBUG_SECRET);
}

export async function signAdminToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ADMIN_TTL)
    .sign(getSecret());
}

export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.role === 'admin';
  } catch {
    return false;
  }
}
