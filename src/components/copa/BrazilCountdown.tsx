'use client';

import { useEffect, useState } from 'react';

// Brazil's first match: June 13, 2026 22:00 UTC = 19:00 Brasília
const BRAZIL_FIRST_MATCH = new Date('2026-06-13T22:00:00Z').getTime();

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function computeTimeLeft(): TimeLeft {
  const diff = BRAZIL_FIRST_MATCH - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
    expired: false,
  };
}

const UNITS: { key: keyof Omit<TimeLeft, 'expired'>; label: string }[] = [
  { key: 'days',    label: 'd' },
  { key: 'hours',   label: 'h' },
  { key: 'minutes', label: 'm' },
  { key: 'seconds', label: 's' },
];

export function BrazilCountdown() {
  // null = SSR / not yet hydrated → renders nothing to avoid hydration mismatch
  const [time, setTime] = useState<TimeLeft | null>(null);

  useEffect(() => {
    setTime(computeTimeLeft());
    const id = setInterval(() => setTime(computeTimeLeft()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (!time || time.expired) return null;

  return (
    <div className="mt-5 flex items-center gap-3 flex-wrap">
      <span className="text-xs text-white/50 font-sans uppercase tracking-wider shrink-0">
        Brasil joga em
      </span>
      <div className="flex gap-2">
        {UNITS.map(({ key, label }) => (
          <div
            key={key}
            className="flex flex-col items-center bg-black/30 backdrop-blur-sm rounded-lg px-2.5 py-1.5 min-w-[38px] border border-white/10"
          >
            <span className="text-lg font-black font-display tabular-nums text-white leading-none">
              {String(time[key]).padStart(2, '0')}
            </span>
            <span className="text-[9px] font-sans text-white/40 uppercase mt-0.5 leading-none">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
