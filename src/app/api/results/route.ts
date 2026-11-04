import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/participant-server';
import { getPublicResults } from '@/lib/server/experiment';

export const dynamic = 'force-dynamic';

/** Anonymised completed-session data for the public results dashboard (test runs excluded). */
export async function GET() {
  try {
    return NextResponse.json(await getPublicResults(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
