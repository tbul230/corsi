import { NextResponse, type NextRequest } from 'next/server';
import { verifyFirebaseIdToken } from '@/lib/server/verify-id-token';
import { getParticipantState } from '@/lib/server/experiment';
import { clearSessionCookie, isAdminEmail, setSessionCookie } from '@/lib/server/session';
import { errorResponse } from '@/lib/participant-server';

export const dynamic = 'force-dynamic';

/** Exchange a Firebase ID token (Google sign-in) for an httpOnly session cookie. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.idToken !== 'string' || body.idToken.length > 4096) {
      return NextResponse.json({ error: 'Missing sign-in token.' }, { status: 400 });
    }
    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(body.idToken);
    } catch {
      return NextResponse.json({ error: 'Google sign-in could not be verified. Please try again.' }, { status: 401 });
    }
    if (decoded.firebase?.sign_in_provider !== 'google.com' || !decoded.email || decoded.email_verified !== true) {
      return NextResponse.json({ error: 'Please sign in with a verified Google account.' }, { status: 403 });
    }
    const email = decoded.email.toLowerCase();
    const name = typeof decoded.name === 'string' ? decoded.name : '';
    await setSessionCookie({ uid: decoded.sub, email, name });
    const state = await getParticipantState(decoded.sub);
    return NextResponse.json({ isAdmin: isAdminEmail(email), registered: Boolean(state), email, name });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
