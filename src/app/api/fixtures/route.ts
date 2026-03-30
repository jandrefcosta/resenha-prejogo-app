import { NextResponse } from 'next/server';
import { getFixturesByClub } from '@/lib/apiFootball';

// Second-layer cache: CDN/browser revalidates after 6h (21600s)
export const revalidate = 21600;

export async function GET() {
  const fixtures = await getFixturesByClub();
  return NextResponse.json(fixtures);
}
