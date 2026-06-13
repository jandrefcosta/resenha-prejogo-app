import { redirect } from 'next/navigation';
import { ClubHome } from '@/components/home/ClubHome';
import { isCupTakeover } from '@/lib/cupTakeover';

// The takeover check is time-based; without this the page is statically
// rendered and the date comparison would be frozen at build time.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  if (isCupTakeover()) {
    redirect('/copa-2026');
  }
  return <ClubHome />;
}
