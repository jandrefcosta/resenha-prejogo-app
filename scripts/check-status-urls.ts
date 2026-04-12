/**
 * Check a sample status key to see which URLs were resolved during seeding.
 * Usage: npx tsx --env-file=.env.local scripts/check-status-urls.ts
 */
import { redis } from '../src/lib/redisCache';

async function main() {
  const sumulaKeys = await redis.keys('cbf:match:*:sumula');
  const sample = sumulaKeys.slice(0, 3);

  for (const sk of sample) {
    const idJogo = sk.split(':')[2];
    const statusKey = `cbf:match:${idJogo}:docs:status`;
    const status = await redis.get(statusKey) as any;
    console.log(`\nMatch ${idJogo}:`);
    console.log('  URLs:', JSON.stringify(status?.urls ?? null, null, 4));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
