import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, requireAdmin } from '@/lib/participant-server';
import { getAdminResults } from '@/lib/server/experiment';

export const dynamic = 'force-dynamic';

/** Live data for the admin charts (participant codes; test runs only with include_test=1). */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const includeTest = req.nextUrl.searchParams.get('include_test') === '1';
    return NextResponse.json(await getAdminResults(includeTest), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
