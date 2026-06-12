import type { Metadata } from 'next';
import { ClubHome } from '@/components/home/ClubHome';

export const metadata: Metadata = {
  title: 'Meu Clube',
  description:
    'Próximos jogos, onde assistir e análise pré-jogo do seu clube no futebol brasileiro.',
};

export default function MeuClubePage() {
  return <ClubHome />;
}
