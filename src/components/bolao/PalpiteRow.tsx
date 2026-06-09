'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { submitPalpite } from '@/lib/palpiteClient';

export interface PalpiteData {
  home: number;
  away: number;
  locked: boolean;
  ts: string;
}

export interface ScoreData {
  pts: number;
  outcome: 'exact' | 'correct' | 'miss';
}

interface Props {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
  palpite?: PalpiteData;
  score?: ScoreData;
  actualScore?: { home: number | null; away: number | null };
  isLocked: boolean;
}

const outcomeColors = {
  exact: 'bg-green-950/40 border-green-800',
  correct: 'bg-blue-950/40 border-blue-800',
  miss: 'bg-zinc-900 border-zinc-700',
};

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

export function PalpiteRow({
  fixtureId,
  homeTeam,
  awayTeam,
  date,
  palpite,
  score,
  actualScore,
  isLocked,
}: Props) {
  const [homeVal, setHomeVal] = useState(palpite?.home?.toString() ?? '');
  const [awayVal, setAwayVal] = useState(palpite?.away?.toString() ?? '');
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const save = useCallback(
    async (h: string, a: string) => {
      const home = parseInt(h, 10);
      const away = parseInt(a, 10);
      if (isNaN(home) || isNaN(away) || home < 0 || away < 0) return;
      if (savedTimer.current) clearTimeout(savedTimer.current);
      setStatus({ kind: 'saving' });

      const result = await submitPalpite(fixtureId, home, away);
      if (!mounted.current) return;

      if (result.ok) {
        setStatus({ kind: 'saved' });
        savedTimer.current = setTimeout(() => {
          if (mounted.current) setStatus({ kind: 'idle' });
        }, 2000);
      } else {
        setStatus({ kind: 'error', message: result.error });
      }
    },
    [fixtureId],
  );

  const dateStr = new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const containerClass = score
    ? `border rounded-xl p-3 ${outcomeColors[score.outcome]}`
    : !palpite && !isLocked
    ? 'border border-dashed border-amber-600/60 bg-amber-950/30 rounded-xl p-3'
    : 'border border-zinc-800 rounded-xl p-3';

  return (
    <div className={containerClass}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs text-zinc-500 shrink-0">{dateStr}</span>
        {score && (
          <span className={`text-xs font-bold text-right ${score.pts > 0 ? 'text-green-400' : 'text-zinc-500'}`}>
            +{score.pts} pts
            {score.outcome === 'exact' ? ' · Acerto exato!' : score.outcome === 'correct' ? ' · Resultado certo' : ' · Errou'}
          </span>
        )}
        {!score && status.kind === 'saving' && (
          <span className="text-xs text-zinc-500 shrink-0">Salvando…</span>
        )}
        {!score && status.kind === 'saved' && (
          <span className="text-xs font-medium text-green-400 shrink-0">✓ Salvo</span>
        )}
        {!score && status.kind === 'error' && (
          <button
            type="button"
            onClick={() => save(homeVal, awayVal)}
            className="text-xs font-medium text-amber-400 hover:text-amber-300 text-right min-w-0"
          >
            ⚠ {status.message} — toque pra salvar
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-right text-sm font-medium truncate">{homeTeam}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number"
            min={0}
            max={99}
            value={homeVal}
            disabled={isLocked || !!score}
            onChange={(e) => setHomeVal(e.target.value)}
            onBlur={() => save(homeVal, awayVal)}
            className="w-10 text-center border border-zinc-700 bg-zinc-900 text-zinc-100 rounded-md p-1 text-sm font-bold disabled:bg-zinc-800 disabled:text-zinc-500"
          />
          <span className="text-zinc-500 text-sm">×</span>
          <input
            type="number"
            min={0}
            max={99}
            value={awayVal}
            disabled={isLocked || !!score}
            onChange={(e) => setAwayVal(e.target.value)}
            onBlur={() => save(homeVal, awayVal)}
            className="w-10 text-center border border-zinc-700 bg-zinc-900 text-zinc-100 rounded-md p-1 text-sm font-bold disabled:bg-zinc-800 disabled:text-zinc-500"
          />
        </div>
        <span className="min-w-0 flex-1 text-sm font-medium truncate">{awayTeam}</span>
      </div>

      {score && actualScore && (
        <p className="text-xs text-center text-zinc-500 mt-1.5">
          Resultado real: {actualScore.home} × {actualScore.away}
        </p>
      )}
    </div>
  );
}
