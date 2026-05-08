import { NextResponse } from 'next/server';
import { validateClubs } from '@/lib/admin/clubsValidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const result = validateClubs();
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
