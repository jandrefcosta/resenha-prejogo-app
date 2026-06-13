import { describe, it, expect } from 'vitest';
import { userRecordToRow } from './userRow';

describe('userRecordToRow', () => {
  it('maps a full record to a users row', () => {
    const row = userRecordToRow('u1', {
      email: 'a@b.com',
      emailHash: 'hash',
      ip: '1.2.3.4',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastSeen: '2026-02-01T00:00:00.000Z',
      username: 'joao',
      displayName: 'João',
      bio: 'oi',
      clubId: 'flamengo',
      passwordHash: 'pw',
    });

    expect(row).toEqual({
      id: 'u1',
      email: 'a@b.com',
      emailHash: 'hash',
      username: 'joao',
      displayName: 'João',
      bio: 'oi',
      clubId: 'flamengo',
      passwordHash: 'pw',
      ip: '1.2.3.4',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      lastSeen: new Date('2026-02-01T00:00:00.000Z'),
    });
  });

  it('defaults optional social fields to null on a minimal record', () => {
    const row = userRecordToRow('u2', {
      email: 'c@d.com',
      emailHash: 'h2',
      ip: '9.9.9.9',
      createdAt: '2026-03-01T00:00:00.000Z',
      lastSeen: '2026-03-01T00:00:00.000Z',
    });

    expect(row.username).toBeNull();
    expect(row.displayName).toBeNull();
    expect(row.bio).toBeNull();
    expect(row.clubId).toBeNull();
    expect(row.passwordHash).toBeNull();
  });

  it('parses ISO date strings into Date instances', () => {
    const row = userRecordToRow('u3', {
      email: 'e@f.com',
      emailHash: 'h3',
      ip: '0.0.0.0',
      createdAt: '2026-04-01T12:00:00.000Z',
      lastSeen: '2026-04-02T12:00:00.000Z',
    });

    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.lastSeen).toBeInstanceOf(Date);
    expect(row.createdAt.toISOString()).toBe('2026-04-01T12:00:00.000Z');
    expect(row.lastSeen).toBeInstanceOf(Date);
    expect(row.lastSeen.toISOString()).toBe('2026-04-02T12:00:00.000Z');
  });
});
