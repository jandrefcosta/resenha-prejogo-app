// Pure mapper: Redis UserRecord -> Postgres `users` insert row. No I/O imports
// (no ./db client, no ./redisCache) so it stays unit-testable in the node env,
// mirroring bolaoScoring.ts / teamIdentity.ts. Consumed by userIdentity.ts.
import type { NewUser } from './db/schema';

/** Structural shape of the Redis user record needed to build a users row. */
export interface UserRecordInput {
  email: string;
  emailHash: string;
  ip?: string;
  createdAt: string;
  lastSeen: string;
  username?: string;
  displayName?: string;
  bio?: string;
  clubId?: string;
  passwordHash?: string;
}

export function userRecordToRow(userId: string, r: UserRecordInput): NewUser {
  return {
    id:           userId,
    email:        r.email,
    emailHash:    r.emailHash,
    username:     r.username ?? null,
    displayName:  r.displayName ?? null,
    bio:          r.bio ?? null,
    clubId:       r.clubId ?? null,
    passwordHash: r.passwordHash ?? null,
    ip:           r.ip ?? null,
    createdAt:    new Date(r.createdAt),
    lastSeen:     new Date(r.lastSeen),
  };
}
