'use client';

import { useTheme } from '@/components/ThemeProvider';

export function HeroClubName() {
  const { club } = useTheme();

  return (
    <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white drop-shadow-md transition-all duration-300 font-display uppercase leading-none">
      {club ? club.name : 'Futebol Brasileiro'}
    </h1>
  );
}
