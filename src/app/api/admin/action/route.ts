import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, requireAdmin } from '@/lib/participant-server';
import { adminDeleteParticipant, adminDeleteSession, createTestParticipant } from '@/lib/server/experiment';
import { setSessionCookie } from '@/lib/server/session';
import { testPrefixFor } from '@/lib/server/pseudonym';

export const dynamic = 'force-dynamic';

/** Administrator actions: delete data, start / exit an admin test run. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    switch (body.action) {
      case 'delete-participant':
        if (!id) break;
        await adminDeleteParticipant(admin.email, id);
        return NextResponse.json({ ok: true });
      case 'delete-session':
        if (!id) break;
        await adminDeleteSession(admin.email, id);
        return NextResponse.json({ ok: true });
      case 'start-test': {
        const pid = await createTestParticipant(testPrefixFor(admin.uid));
        await setSessionCookie({ uid: admin.uid, email: admin.email, pid });
        return NextResponse.json({ ok: true, pid });
      }
      case 'exit-test':
        await setSessionCookie({ uid: admin.uid, email: admin.email });
        return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
