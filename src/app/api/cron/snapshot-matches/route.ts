/**
 * GET /api/cron/snapshot-matches
 *
 * Cron semanal que upserta partidas encerradas recentes em match_snapshots.
 * Deve ser chamado toda segunda-feira (ou após cada rodada encerrada).
 *
 * Protegido pelo mesmo CRON_SECRET dos outros crons.
 */

import { type NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { matchSnapshots } from '@/lib/db/schema';
import { getCbfRound } from '@/lib/cbfApi';
import { getConmebolTournament, CONMEBOL_TOURNAMENT_IDS } from '@/lib/conmebolApi';
import type { CbfMatchDetail, ConmebolMatchDetail } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CBF_LEAGUE_ID = 71;
const CBF_SEASON    = 2026;
const LIB_LEAGUE_ID = 13;
const SUL_LEAGUE_ID = 11;

// ─── Helpers (mesma lógica do seed script) ────────────────────────────────────

function parseCbfDatetime(data: string, hora: string): Date {
  const [day, month, year] = data.split('/').map(Number);
  const [hours, minutes]   = hora.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours + 3, minutes));
}

function isCbfMatchFinished(m: CbfMatchDetail): boolean {
  const hasScore  = m.mandante.gols !== '' && m.visitante.gols !== '';
  const hasLineup = m.mandante.atletas.length > 0 && m.visitante.atletas.length > 0;
  return hasScore && hasLineup;
}

function mapCbfMatch(m: CbfMatchDetail, round: number) {
  const mainRef = m.arbitros.find(a => a.funcao === 'Arbitro');
  return {
    fixtureId:     `cbf_${m.idJogo}`,
    source:        'cbf' as const,
    leagueId:      CBF_LEAGUE_ID,
    season:        CBF_SEASON,
    round:         String(round),
    status:        'finished' as const,
    matchDate:     parseCbfDatetime(m.data, m.hora),
    homeTeamId:    m.mandante.id,
    homeTeamName:  m.mandante.nome,
    awayTeamId:    m.visitante.id,
    awayTeamName:  m.visitante.nome,
    homeScore:     parseInt(m.mandante.gols, 10),
    awayScore:     parseInt(m.visitante.gols, 10),
    venue:         m.local || null,
    referee:       mainRef?.nome ?? null,
    hasHomeLineup: m.mandante.atletas.length > 0,
    hasAwayLineup: m.visitante.atletas.length > 0,
    rawPayload:    m as unknown as Record<string, unknown>,
  };
}

function mapConmebolMatch(m: ConmebolMatchDetail, leagueId: number) {
  const se = m.scoreEntries;
  return {
    fixtureId:     `conmebol_${m.id}`,
    source:        'conmebol' as const,
    leagueId,
    season:        CBF_SEASON,
    round:         m.stage,
    status:        'finished' as const,
    matchDate:     new Date(m.date * 1000),
    homeTeamId:    String(m.home.id),
    homeTeamName:  m.home.name,
    awayTeamId:    String(m.away.id),
    awayTeamName:  m.away.name,
    homeScore:     m.homeScore,
    awayScore:     m.awayScore,
    scoreHtHome:   se?.ht?.home_score  ?? null,
    scoreHtAway:   se?.ht?.away_score  ?? null,
    scoreEtHome:   se?.et?.home_score  ?? null,
    scoreEtAway:   se?.et?.away_score  ?? null,
    scorePenHome:  se?.pen?.home_score ?? null,
    scorePenAway:  se?.pen?.away_score ?? null,
    scoreAggHome:  se?.aggregate?.home_score ?? null,
    scoreAggAway:  se?.aggregate?.away_score ?? null,
    winner:        m.winner,
    matchLengthMin: m.matchLengthMin,
    venue:         m.venue,
    hasHomeLineup: false,
    hasAwayLineup: false,
    rawPayload:    m as unknown as Record<string, unknown>,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

const MONITOR_SLUG = 'snapshot-matches';

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Sentry cron check-in (dead-man's-switch): a missed or errored check-in
  // raises an alert, so a silently-dead cron can no longer go unnoticed —
  // which is exactly how stale CONMEBOL results went unseen for weeks.
  const checkInId = Sentry.captureCheckIn(
    { monitorSlug: MONITOR_SLUG, status: 'in_progress' },
    {
      schedule:      { type: 'crontab', value: '0 * * * *' },
      checkinMargin: 10,
      maxRuntime:    10,
      timezone:      'Etc/UTC',
    },
  );

  try {
    const results: Record<string, number> = {};

    // ── CBF: jogos das últimas 2 semanas ──
    // A rodada atual é buscada do Redis via cache; o cron só grava rounds encerrados.
    const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
    const since = Date.now() - TWO_WEEKS_MS;

    let cbfInserted = 0;
    for (let round = 1; round <= 38; round++) {
      try {
        const data = await getCbfRound(round, false);
        const finished = data.matches.filter(m => {
          if (!isCbfMatchFinished(m)) return false;
          const matchTs = parseCbfDatetime(m.data, m.hora).getTime();
          return matchTs >= since; // só as últimas 2 semanas
        });
        if (finished.length === 0) continue;

        const rows = finished.map(m => mapCbfMatch(m, round));
        await db.insert(matchSnapshots)
          .values(rows)
          .onConflictDoUpdate({
            target: matchSnapshots.fixtureId,
            set: {
              homeScore:     sql`excluded.home_score`,
              awayScore:     sql`excluded.away_score`,
              hasHomeLineup: sql`excluded.has_home_lineup`,
              hasAwayLineup: sql`excluded.has_away_lineup`,
              rawPayload:    sql`excluded.raw_payload`,
              updatedAt:     sql`now()`,
            },
          });
        cbfInserted += rows.length;
      } catch { /* round pode não existir ainda — falha esperada, não reportar */ }
    }
    results.cbf = cbfInserted;

    // ── CONMEBOL ──
    const conmebolTournaments = [
      { id: CONMEBOL_TOURNAMENT_IDS.libertadores,    leagueId: LIB_LEAGUE_ID },
      { id: CONMEBOL_TOURNAMENT_IDS['sul-americana'], leagueId: SUL_LEAGUE_ID },
    ];

    let conmebolInserted = 0;
    for (const t of conmebolTournaments) {
      try {
        const data = await getConmebolTournament(t.id, false);
        const finished = data.matches.filter(m =>
          m.matchStatus === 'Played' && m.date * 1000 >= since,
        );
        if (finished.length === 0) continue;

        const rows = finished.map(m => mapConmebolMatch(m, t.leagueId));
        // Upsert (not DoNothing): a result corrected after the fact — score
        // fix, walkover — must overwrite the stored snapshot. Matches the CBF
        // branch and the conmebolApi write-through.
        await db.insert(matchSnapshots).values(rows).onConflictDoUpdate({
          target: matchSnapshots.fixtureId,
          set: {
            homeScore:  sql`excluded.home_score`,
            awayScore:  sql`excluded.away_score`,
            rawPayload: sql`excluded.raw_payload`,
            updatedAt:  sql`now()`,
          },
        });
        conmebolInserted += rows.length;
      } catch (e) {
        // Only 2 tournaments — a failure here is unexpected, so surface it.
        Sentry.captureException(e, { tags: { cron: MONITOR_SLUG, source: 'conmebol' } });
      }
    }
    results.conmebol = conmebolInserted;

    Sentry.captureCheckIn({ checkInId, monitorSlug: MONITOR_SLUG, status: 'ok' });
    return NextResponse.json({ ok: true, inserted: results });
  } catch (err) {
    Sentry.captureCheckIn({ checkInId, monitorSlug: MONITOR_SLUG, status: 'error' });
    Sentry.captureException(err, { tags: { cron: MONITOR_SLUG } });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
