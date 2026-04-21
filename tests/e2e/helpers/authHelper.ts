import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import type { APIRequestContext, Page } from '@playwright/test';

export interface TestUser {
  userId: string;
  email: string;
  password: string;
  username: string;
}

export async function createTestUser(request: APIRequestContext): Promise<TestUser> {
  const ts = Date.now();
  const email = `e2e_${ts}@test.invalid`;
  const username = `e2e${ts}`;
  const password = 'TestPass123!';

  const res = await request.post('/api/auth/register', {
    data: { username, email, password },
  });

  if (res.status() !== 201) {
    const body = await res.text();
    throw new Error(`createTestUser failed ${res.status()}: ${body}`);
  }

  const data = await res.json();
  return { userId: data.user.id, email, password, username };
}

export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  const res = await page.request.post('/api/auth/login', {
    data: { email, password },
  });

  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`loginAs failed ${res.status()}: ${body}`);
  }

  const cookieHeaders = res.headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
  const scAuthHeader = cookieHeaders
    .map((h) => h.match(/sc_auth=([^;]+)/))
    .find((m) => m !== null);
  if (!scAuthHeader) throw new Error('sc_auth cookie not found in login response');

  await page.context().addCookies([{
    name: 'sc_auth',
    value: scAuthHeader[1],
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
  }]);
}

export function cleanupTestData(opts: {
  users: Array<{ userId: string; email: string; username: string }>;
  bolaoIds?: string[];
  codigos?: string[];
}): void {
  const { users, bolaoIds = [], codigos = [] } = opts;

  const keysToDelete: string[] = [];
  const userIds: string[] = [];

  for (const u of users) {
    const emailHash = createHash('sha256')
      .update(u.email.toLowerCase().trim())
      .digest('hex');
    keysToDelete.push(
      `user:${u.userId}`,
      `email:${emailHash}`,
      `username:${u.username}`,
      `bolao:user:${u.userId}:boloes`,
      `palpite:user:${u.userId}:fixtures`,
    );
    userIds.push(u.userId);
  }

  for (const id of bolaoIds) {
    keysToDelete.push(
      `bolao:${id}:meta`,
      `bolao:${id}:members`,
      `bolao:${id}:ranking`,
    );
  }

  for (const codigo of codigos) {
    keysToDelete.push(`bolao:code:${codigo}`);
  }

  const script = `
import { Redis } from '@upstash/redis';
const r = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const keys = ${JSON.stringify(keysToDelete)};
const userIds = ${JSON.stringify(userIds)};
await Promise.all([
  keys.length ? r.del(...keys) : Promise.resolve(),
  userIds.length ? r.zrem('bolao:global:ranking', ...userIds) : Promise.resolve(),
]);
console.log('cleanup ok', keys.length, 'keys,', userIds.length, 'ranking entries');
`.trim();

  try {
    execSync('node --input-type=module', {
      input: script,
      env: process.env,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch (err) {
    console.warn('[authHelper] cleanup warning:', err);
  }
}
