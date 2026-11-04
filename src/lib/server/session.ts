import 'server-only';
import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'corsi_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  /** Participant record in use: the user's own (uid) or an admin test-run participant. */
  pid: string;
  isAdmin: boolean;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is not configured (min 32 chars).');
  return new TextEncoder().encode(s);
}

/** Admin emails come from the ADMIN_EMAILS environment variable (comma separated). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined) {
  return Boolean(email) && adminEmails().includes(email!.toLowerCase());
}

export async function createSessionToken(user: { uid: string; email: string; name: string; pid?: string }) {
  return new SignJWT({ email: user.email, name: user.name, pid: user.pid ?? user.uid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.uid)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function setSessionCookie(user: { uid: string; email: string; name: string; pid?: string }) {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in Google user, or null. Admin status is re-evaluated on every request. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    const uid = payload.sub;
    const email = String(payload.email ?? '');
    if (!uid || !email) return null;
    const isAdmin = isAdminEmail(email);
    let pid = String(payload.pid ?? uid);
    // Only admins may act as a test-run participant.
    if (pid !== uid && !(isAdmin && pid.startsWith(`test_${uid}_`))) pid = uid;
    return { uid, email, name: String(payload.name ?? ''), pid, isAdmin };
  } catch {
    return null;
  }
}
