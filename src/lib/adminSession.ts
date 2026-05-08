import { SignJWT, jwtVerify } from 'jose';

export const ADMIN_COOKIE = 'sc_admin';
const ADMIN_TTL = '12h';

const secret = new TextEncoder().encode(
  process.env.DEBUG_SECRET ?? 'dev-admin-secret-change-in-production',
);

export async function signAdminToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ADMIN_TTL)
    .sign(secret);
}

export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}
