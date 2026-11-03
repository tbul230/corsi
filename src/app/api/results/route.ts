import { NextResponse } from 'next/server';
import { callRpc, errorResponse } from '@/lib/participant-server';

export const dynamic = 'force-dynamic';

/** Anonymised completed-session data for the public results dashboard. */
export async function GET() {
  try {
    const data = await callRpc('get_public_results');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
