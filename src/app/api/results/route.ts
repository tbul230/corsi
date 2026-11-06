import { NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/participant-server';
import { getPublicResults } from '@/lib/server/experiment';

export const dynamic = 'force-dynamic';

/** Anonymised completed-session data for the results dashboard (signed-in users only; test runs excluded). */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(await getPublicResults(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
