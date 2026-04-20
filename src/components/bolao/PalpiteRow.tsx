'use client';
import { useState, useCallback } from 'react';

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
  exact: 'bg-green-50 border-green-200',
  correct: 'bg-blue-50 border-blue-200',
  miss: 'bg-gray-50 border-gray-200',
};

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
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (h: string, a: string) => {
      const home = parseInt(h, 10);
      const away = parseInt(a, 10);
      if (isNaN(home) || isNaN(away) || home < 0 || away < 0) return;
      setSaving(true);
      try {
        await fetch(`/api/palpites/${fixtureId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ home, away }),
        });
      } finally {
        setSaving(false);
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
    ? 'border border-dashed border-amber-300 bg-amber-50 rounded-xl p-3'
    : 'border border-gray-200 rounded-xl p-3';

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">{dateStr}</span>
        {score && (
          <span className={`text-xs font-bold ${score.pts > 0 ? 'text-green-700' : 'text-gray-400'}`}>
            +{score.pts} pts
            {score.outcome === 'exact' ? ' · Acerto exato!' : score.outcome === 'correct' ? ' · Resultado certo' : ' · Errou'}
          </span>
        )}
        {saving && <span className="text-xs text-gray-400">Salvando…</span>}
      </div>

      <div className="flex items-center gap-2">
        <span className="flex-1 text-right text-sm font-medium truncate">{homeTeam}</span>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={99}
            value={homeVal}
            disabled={isLocked || !!score}
            onChange={(e) => setHomeVal(e.target.value)}
            onBlur={() => save(homeVal, awayVal)}
            className="w-9 text-center border border-gray-300 rounded-md p-1 text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500"
          />
          <span className="text-gray-400 text-sm">×</span>
          <input
            type="number"
            min={0}
            max={99}
            value={awayVal}
            disabled={isLocked || !!score}
            onChange={(e) => setAwayVal(e.target.value)}
            onBlur={() => save(homeVal, awayVal)}
            className="w-9 text-center border border-gray-300 rounded-md p-1 text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500"
          />
        </div>
        <span className="flex-1 text-sm font-medium truncate">{awayTeam}</span>
      </div>

      {score && actualScore && (
        <p className="text-xs text-center text-gray-400 mt-1.5">
          Resultado real: {actualScore.home} × {actualScore.away}
        </p>
      )}
    </div>
  );
}
