import { NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/participant-server';
import { getPublicResults } from '@/lib/server/experiment';

export const dynamic = 'force-dynamic';

/** Anonymised completed-session data (participants shown as #1, #2…, the viewer as "You") for the results dashboard (signed-in users only; test runs excluded). */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await getPublicResults(user.pid), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
