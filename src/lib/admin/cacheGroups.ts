export interface CacheGroup {
  label: string;
  patterns: string[];
  /** Destructive groups require explicit `confirm: true` to bulk-delete. */
  destructive: boolean;
}

export const CACHE_GROUPS: CacheGroup[] = [
  {
    label: 'Sports — fixtures e cache esportivo',
    patterns: [
      'fixtures:*',
      'cbf:round:*',
      'cbf:match:*',
      'cbf:standings:*',
      'conmebol:tournament:*',
      'broadcasters:*',
      'standings:*',
      'h2h:*',
      'form:*',
      'lineups:*',
      'copa-fixtures:*',
    ],
    destructive: false,
  },
  {
    label: 'Bolão — palpites, scores, rankings',
    patterns: [
      'bolao:*',
      'palpite:*',
      'score:*',
    ],
    destructive: true,
  },
  {
    label: 'Social — posts, feeds, follows',
    patterns: [
      'post:*',
      'feed:*',
      'club:posts:*',
      'user:posts:*',
      'user:liked:*',
      'following:*',
      'followers:*',
    ],
    destructive: true,
  },
  {
    label: 'Auth — usuários e sessões',
    patterns: [
      'user:*',
      'email:*',
      'username:*',
      'session:*',
      'reset:*',
    ],
    destructive: true,
  },
  {
    label: 'Rate limiting',
    patterns: ['rl:*'],
    destructive: false,
  },
];

const DESTRUCTIVE_PREFIXES = [
  'user:',
  'bolao:',
  'palpite:',
  'score:',
  'post:',
  'feed:',
  'session:',
  'email:',
  'username:',
  'club:posts:',
  'user:posts:',
  'user:liked:',
  'following:',
  'followers:',
  'reset:',
];

/** Whether a pattern needs `confirm: true` to delete in bulk. */
export function isDestructivePattern(pattern: string): boolean {
  if (pattern === '*' || pattern.trim() === '') return true;
  return DESTRUCTIVE_PREFIXES.some((p) => pattern.startsWith(p));
}
