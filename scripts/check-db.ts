import 'dotenv/config';

import { db } from '@/lib/db';
import { matchSnapshots, users, boloes, palpites } from '@/lib/db/schema';
import { count, sql } from 'drizzle-orm';

async function main() {
  const [snaps, userCount, bolaoCount, palpiteCount] = await Promise.all([
    db.select({
      total:  count(),
      source: matchSnapshots.source,
    })
      .from(matchSnapshots)
      .groupBy(matchSnapshots.source),
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(boloes),
    db.select({ n: count() }).from(palpites),
  ]);

  console.log('\n── match_snapshots ──');
  if (snaps.length === 0) {
    console.log('  (vazio)');
  } else {
    for (const row of snaps) {
      console.log(`  ${row.source}: ${row.total} partidas`);
    }
  }

  // Últimas 3 partidas inseridas
  const recent = await db.select({
    fixtureId:    matchSnapshots.fixtureId,
    homeTeamName: matchSnapshots.homeTeamName,
    awayTeamName: matchSnapshots.awayTeamName,
    homeScore:    matchSnapshots.homeScore,
    awayScore:    matchSnapshots.awayScore,
    round:        matchSnapshots.round,
    matchDate:    matchSnapshots.matchDate,
  })
    .from(matchSnapshots)
    .orderBy(sql`created_at desc`)
    .limit(3);

  if (recent.length > 0) {
    console.log('\n── últimas inseridas ──');
    for (const m of recent) {
      console.log(`  [${m.fixtureId}] Rd${m.round} ${m.homeTeamName} ${m.homeScore}x${m.awayScore} ${m.awayTeamName} (${m.matchDate?.toISOString().slice(0, 10)})`);
    }
  }

  console.log('\n── dados de usuário ──');
  console.log(`  users:    ${userCount[0].n}`);
  console.log(`  boloes:   ${bolaoCount[0].n}`);
  console.log(`  palpites: ${palpiteCount[0].n}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
