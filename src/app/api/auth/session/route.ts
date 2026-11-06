import { NextResponse, type NextRequest } from 'next/server';
import { verifyFirebaseIdToken } from '@/lib/server/verify-id-token';
import { participantIdFor } from '@/lib/server/pseudonym';
import { getParticipantState } from '@/lib/server/experiment';
import { clearSessionCookie, isAdminEmail, setSessionCookie } from '@/lib/server/session';
import { errorResponse } from '@/lib/participant-server';

export const dynamic = 'force-dynamic';

/** Exchange a Firebase ID token (Google sign-in) for an httpOnly session cookie. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.idToken !== 'string' || body.idToken.length > 4096) {
      return NextResponse.json({ error: 'Please sign in with Google.', code: 'NOT_AUTHENTICATED' }, { status: 401 });
    }
    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(body.idToken);
    } catch (err) {
      // Log only the failure reason (no token contents, email or UID).
      console.warn('[auth] ID token rejected:', (err as Error).name);
      return NextResponse.json(
        { error: 'Your Google sign-in could not be verified (it may have expired). Please sign in again.', code: 'INVALID_ID_TOKEN' },
        { status: 401 }
      );
    }
    if (decoded.firebase?.sign_in_provider !== 'google.com' || !decoded.email || decoded.email_verified !== true) {
      return NextResponse.json({ error: 'Please sign in with a verified Google account.' }, { status: 403 });
    }
    // The email is used only for the admin allowlist; it is never stored or logged.
    const email = decoded.email.toLowerCase();
    await setSessionCookie({ uid: decoded.sub, email });
    const state = await getParticipantState(participantIdFor(decoded.sub));
    const isAdmin = isAdminEmail(email);
    // Where to go next: new users register; returning users continue exactly where they left off.
    const active = state?.sessions.find((s) => s.status !== 'completed');
    const next = !state ? '/register' : active ? `/session/${active.id}` : '/dashboard';
    return NextResponse.json({ isAdmin, registered: Boolean(state), next });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
