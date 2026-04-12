/**
 * diagnose-match-docs.ts — inspect what's stored in Redis for match docs
 */
import { redis } from '@/lib/redisCache';

async function main() {
  // Check sumula keys
  const sumulaKeys = await redis.keys('cbf:match:*:sumula');
  const boletimKeys = await redis.keys('cbf:match:*:boletim');
  const statusKeys = await redis.keys('cbf:match:*:docs:status');

  console.log(`\nRedis match-docs inventory:`);
  console.log(`  sumula keys:  ${sumulaKeys.length}`);
  console.log(`  boletim keys: ${boletimKeys.length}`);
  console.log(`  status keys:  ${statusKeys.length}`);

  if (sumulaKeys.length === 0 && boletimKeys.length === 0) {
    console.log('\n  ⚠  No data in Redis. Run: npm run seed:match-docs');
    return;
  }

  // Sample first sumula
  if (sumulaKeys.length > 0) {
    const key = sumulaKeys[0];
    const data = await redis.get<Record<string, unknown>>(key);
    console.log(`\nSample súmula key: ${key}`);
    if (!data) {
      console.log('  ⚠  Key exists but value is null/empty!');
    } else {
      console.log(`  Top-level keys: ${Object.keys(data).join(', ')}`);
      const mandante = data.mandante as Record<string, unknown> | undefined;
      if (mandante) {
        console.log(`  mandante keys: ${Object.keys(mandante).join(', ')}`);
        const titulares = mandante.titulares as unknown[];
        const reservas = mandante.reservas as unknown[];
        const subs = mandante.substituicoes as unknown[];
        console.log(`  titulares: ${titulares?.length ?? 0}`);
        console.log(`  reservas:  ${reservas?.length ?? 0}`);
        console.log(`  substituicoes: ${subs?.length ?? 0}`);
        if (titulares?.length > 0) {
          console.log(`  primeiro titular: ${JSON.stringify(titulares[0])}`);
        } else {
          console.log('  ⚠  titulares está vazio — parser não encontrou jogadores!');
        }
      } else {
        console.log('  ⚠  mandante field missing from stored data!');
      }
    }
  }

  // Sample first boletim
  if (boletimKeys.length > 0) {
    const key = boletimKeys[0];
    const data = await redis.get<Record<string, unknown>>(key);
    console.log(`\nSample boletim key: ${key}`);
    if (!data) {
      console.log('  ⚠  Key exists but value is null/empty!');
    } else {
      console.log(`  Top-level keys: ${Object.keys(data).join(', ')}`);
      const publico = data.publico as Record<string, unknown> | undefined;
      const renda = data.renda as Record<string, unknown> | undefined;
      console.log(`  publico: ${JSON.stringify(publico)}`);
      console.log(`  renda:   ${JSON.stringify(renda)}`);
    }
  }

  // Check what the API route returns for first match
  if (sumulaKeys.length > 0) {
    const idJogo = sumulaKeys[0].replace('cbf:match:', '').replace(':sumula', '');
    console.log(`\nSimulating GET /api/cbf/match-docs?matchId=${idJogo}`);
    const [sumula, boletim] = await Promise.all([
      redis.get<Record<string, unknown>>(`cbf:match:${idJogo}:sumula`),
      redis.get<Record<string, unknown>>(`cbf:match:${idJogo}:boletim`),
    ]);
    console.log(`  sumula hit: ${!!sumula}`);
    console.log(`  boletim hit: ${!!boletim}`);
    console.log(`  would return available: ${!!(sumula || boletim)}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
