'use client';
import { useState } from 'react';
import { RodadaTabs } from './RodadaTabs';
import { PalpiteRow } from './PalpiteRow';
import type { PalpiteData, ScoreData } from './PalpiteRow';

// Define MatchItem shape here to avoid importing server types in a client component
interface MatchItem {
  match: {
    id: string;
    date: string;
    status: string;
    round: string;
    score?: { home: number | null; away: number | null } | null;
    homeTeam: { name: string };
    awayTeam: { name: string };
  };
  palpite: PalpiteData | null;
  score: ScoreData | null;
  isLocked: boolean;
}

interface Props {
  counts: {
    r1: { filled: number; total: number };
    r2: { filled: number; total: number };
    r3: { filled: number; total: number };
  };
  byRound: Record<1 | 2 | 3, MatchItem[]>;
}

export function RodadaTabsWrapper({ counts, byRound }: Props) {
  const [rodada, setRodada] = useState<1 | 2 | 3>(1);
  const items = byRound[rodada];

  return (
    <div className="space-y-4">
      <RodadaTabs rodada={rodada} counts={counts} onChange={setRodada} />
      <div className="space-y-2">
        {items.map((item) => (
          <PalpiteRow
            key={item.match.id}
            fixtureId={item.match.id}
            homeTeam={item.match.homeTeam.name}
            awayTeam={item.match.awayTeam.name}
            date={item.match.date}
            palpite={item.palpite ?? undefined}
            score={item.score ?? undefined}
            actualScore={item.match.score ?? undefined}
            isLocked={item.isLocked}
          />
        ))}
      </div>
    </div>
  );
}
