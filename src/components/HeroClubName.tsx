'use client';

import { useTheme } from '@/components/ThemeProvider';

export function HeroClubName() {
  const { club } = useTheme();

  return (
    <div className="flex items-center gap-3">
      {club?.apiFootballId && (
        <img
          src={`https://media.api-sports.io/football/teams/${club.apiFootballId}.png`}
          alt=""
          width={52}
          height={52}
          className="object-contain shrink-0 drop-shadow-lg"
          aria-hidden="true"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white drop-shadow-md transition-all duration-300 font-display uppercase leading-none">
        {club ? club.name : 'Futebol Brasileiro'}
      </h1>
    </div>
  );
}
