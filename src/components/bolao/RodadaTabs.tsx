'use client';

interface Props {
  rodada: 1 | 2 | 3;
  counts: { r1: { filled: number; total: number }; r2: { filled: number; total: number }; r3: { filled: number; total: number } };
  onChange: (r: 1 | 2 | 3) => void;
}

export function RodadaTabs({ rodada, counts, onChange }: Props) {
  const tabs: Array<{ key: 1 | 2 | 3; label: string; count: { filled: number; total: number } }> = [
    { key: 1, label: 'Rodada 1', count: counts.r1 },
    { key: 2, label: 'Rodada 2', count: counts.r2 },
    { key: 3, label: 'Rodada 3', count: counts.r3 },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const active = rodada === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              active
                ? 'bg-green-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {tab.label}{' '}
            <span className={`text-xs ${active ? 'opacity-80' : 'opacity-60'}`}>
              ({tab.count.filled}/{tab.count.total})
            </span>
          </button>
        );
      })}
    </div>
  );
}
