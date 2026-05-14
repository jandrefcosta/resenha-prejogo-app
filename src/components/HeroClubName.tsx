'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTheme } from '@/components/ThemeProvider';
import { teamLogoUrl } from '@/lib/teamLogo';

export function HeroClubName() {
  const { club } = useTheme();
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className="flex items-center gap-3">
      {club?.apiFootballId && !logoFailed && teamLogoUrl(club.apiFootballId) && (
        <Image
          src={teamLogoUrl(club.apiFootballId)!}
          alt=""
          width={52}
          height={52}
          className="object-contain shrink-0 drop-shadow-lg"
          aria-hidden="true"
          onError={() => setLogoFailed(true)}
        />
      )}
      <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white drop-shadow-md transition-all duration-300 font-display uppercase leading-none">
        {club ? club.name : 'Futebol Brasileiro'}
      </h1>
    </div>
  );
}
