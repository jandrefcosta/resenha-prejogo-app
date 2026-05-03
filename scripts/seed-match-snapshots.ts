/**
 * seed-match-snapshots.ts — Carrega partidas encerradas para a tabela match_snapshots.
 *
 * Fontes (em ordem de execução):
 *  1. CBF (Brasileirão Série A) — gratuito, dados mais ricos (escalações, gols, cartões)
 *  2. CONMEBOL (Libertadores + Sul-Americana) — gratuito
 *
 * Usage:
 *   npx tsx scripts/seed-match-snapshots.ts           # CBF rounds 1–38 + CONMEBOL
 *   npx tsx scripts/seed-match-snapshots.ts --cbf-only
 *   npx tsx scripts/seed-match-snapshots.ts --conmebol-only
 *   npx tsx scripts/seed-match-snapshots.ts --rounds=1-10   # CBF rounds 1–10 only
 *
 * Requires: DATABASE_URL in environment (Railway Postgres)
 */

import 'dotenv/config';
import { db } from '@/lib/db';
import { matchSnapshots } from '@/lib/db/schema';
import { getCbfRound } from '@/lib/cbfApi';
import { getConmebolTournament, CONMEBOL_TOURNAMENT_IDS } from '@/lib/conmebolApi';
import type { CbfMatchDetail, ConmebolMatchDetail } from '@/lib/types';

// ─── Config ────────────────────────────────────────────────────────────────────

const CBF_LEAGUE_ID = 71;   // Série A (API-Football league ID, used as internal discriminator)
const CBF_SEASON    = 2026;
const LIB_LEAGUE_ID = 13;   // Libertadores
const SUL_LEAGUE_ID = 11;   // Sul-Americana

const TOTAL_CBF_ROUNDS = 38;

// ─── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cbfOnly     = args.includes('--cbf-only');
const conmebolOnly = args.includes('--conmebol-only');
const roundsArg   = args.find(a => a.startsWith('--rounds='))?.split('=')[1];

function parseRoundRange(arg?: string): [number, number] {
  if (!arg) return [1, TOTAL_CBF_ROUNDS];
  const [from, to] = arg.split('-').map(Number);
  return [from, to ?? from];
}

// ─── CBF helpers ───────────────────────────────────────────────────────────────

function parseCbfDatetime(data: string, hora: string): Date {
  const [day, month, year] = data.split('/').map(Number);
  const [hours, minutes]   = hora.split(':').map(Number);
  // CBF timestamps are in Brasília (UTC-3)
  return new Date(Date.UTC(year, month - 1, day, hours + 3, minutes));
}

function isCbfMatchFinished(m: CbfMatchDetail): boolean {
  const hasScore  = m.mandante.gols !== null && m.mandante.gols !== '' &&
                    m.visitante.gols !== null && m.visitante.gols !== '';
  const hasLineup = m.mandante.atletas.length > 0 && m.visitante.atletas.length > 0;
  return hasScore && hasLineup;
}

function mapCbfMatch(m: CbfMatchDetail, round: number) {
  const mainRef = m.arbitros.find(a => a.funcao === 'Arbitro');
  return {
    fixtureId:    `cbf_${m.idJogo}`,
    source:       'cbf' as const,
    leagueId:     CBF_LEAGUE_ID,
    season:       CBF_SEASON,
    round:        String(round),
    status:       'finished' as const,
    matchDate:    parseCbfDatetime(m.data, m.hora),
    homeTeamId:   m.mandante.id,
    homeTeamName: m.mandante.nome,
    awayTeamId:   m.visitante.id,
    awayTeamName: m.visitante.nome,
    homeScore:    parseInt(m.mandante.gols, 10),
    awayScore:    parseInt(m.visitante.gols, 10),
    venue:        m.local || null,
    city:         null,
    referee:      mainRef?.nome ?? null,
    hasHomeLineup: m.mandante.atletas.length > 0,
    hasAwayLineup: m.visitante.atletas.length > 0,
    rawPayload:   m as unknown as Record<string, unknown>,
  };
}

// ─── CONMEBOL helpers ──────────────────────────────────────────────────────────

function mapConmebolMatch(m: ConmebolMatchDetail, leagueId: number) {
  const se = m.scoreEntries;
  return {
    fixtureId:    `conmebol_${m.id}`,
    source:       'conmebol' as const,
    leagueId,
    season:       CBF_SEASON,
    round:        m.stage,
    status:       'finished' as const,
    matchDate:    new Date(m.date * 1000),
    homeTeamId:   String(m.home.id),
    homeTeamName: m.home.name,
    awayTeamId:   String(m.away.id),
    awayTeamName: m.away.name,
    homeScore:    m.homeScore,
    awayScore:    m.awayScore,
    scoreHtHome:  se?.ht?.home_score  ?? null,
    scoreHtAway:  se?.ht?.away_score  ?? null,
    scoreEtHome:  se?.et?.home_score  ?? null,
    scoreEtAway:  se?.et?.away_score  ?? null,
    scorePenHome: se?.pen?.home_score ?? null,
    scorePenAway: se?.pen?.away_score ?? null,
    scoreAggHome: se?.aggregate?.home_score ?? null,
    scoreAggAway: se?.aggregate?.away_score ?? null,
    winner:       m.winner,
    matchLengthMin: m.matchLengthMin,
    venue:        m.venue,
    city:         null,
    referee:      null,
    hasHomeLineup: false,
    hasAwayLineup: false,
    rawPayload:   m as unknown as Record<string, unknown>,
  };
}

// ─── Seed CBF ──────────────────────────────────────────────────────────────────

async function seedCbf(fromRound: number, toRound: number) {
  console.log(`\n── CBF Série A: rounds ${fromRound}–${toRound} ──`);
  let inserted = 0, skipped = 0, errors = 0;

  for (let round = fromRound; round <= toRound; round++) {
    try {
      const data = await getCbfRound(round, /* force */ false);
      const finished = data.matches.filter(isCbfMatchFinished);

      if (finished.length === 0) {
        console.log(`  Round ${round}: 0 jogos encerrados — pulando`);
        skipped += data.matches.length;
        continue;
      }

      const rows = finished.map(m => mapCbfMatch(m, round));
      await db.insert(matchSnapshots).values(rows).onConflictDoNothing();
      inserted += rows.length;
      console.log(`  Round ${round}: ${rows.length} jogos inseridos`);
    } catch (err) {
      console.error(`  Round ${round}: erro — ${(err as Error).message}`);
      errors++;
    }

    // Pequena pausa para não sobrecarregar a CBF API
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`  CBF total: ${inserted} inseridos, ${skipped} não-encerrados, ${errors} erros\n`);
  return inserted;
}

// ─── Seed CONMEBOL ─────────────────────────────────────────────────────────────

async function seedConmebol() {
  console.log('── CONMEBOL (Libertadores + Sul-Americana) ──');
  let inserted = 0, errors = 0;

  const tournaments: Array<{ name: string; id: number; leagueId: number }> = [
    { name: 'Libertadores',  id: CONMEBOL_TOURNAMENT_IDS.libertadores,    leagueId: LIB_LEAGUE_ID },
    { name: 'Sul-Americana', id: CONMEBOL_TOURNAMENT_IDS['sul-americana'], leagueId: SUL_LEAGUE_ID },
  ];

  for (const t of tournaments) {
    try {
      const data = await getConmebolTournament(t.id, /* force */ false);
      const finished = data.matches.filter(m => m.matchStatus === 'Played');

      if (finished.length === 0) {
        console.log(`  ${t.name}: 0 jogos encerrados`);
        continue;
      }

      const rows = finished.map(m => mapConmebolMatch(m, t.leagueId));
      await db.insert(matchSnapshots).values(rows).onConflictDoNothing();
      inserted += rows.length;
      console.log(`  ${t.name}: ${rows.length} jogos inseridos`);
    } catch (err) {
      console.error(`  ${t.name}: erro — ${(err as Error).message}`);
      errors++;
    }
  }

  console.log(`  CONMEBOL total: ${inserted} inseridos, ${errors} erros\n`);
  return inserted;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== seed-match-snapshots ===');
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? '✓ definida' : '✗ AUSENTE — abortando'}`);
  if (!process.env.DATABASE_URL) process.exit(1);

  const [fromRound, toRound] = parseRoundRange(roundsArg);
  let total = 0;

  if (!conmebolOnly) {
    total += await seedCbf(fromRound, toRound);
  }

  if (!cbfOnly) {
    total += await seedConmebol();
  }

  console.log(`=== Concluído: ${total} partidas inseridas no total ===`);
  process.exit(0);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
