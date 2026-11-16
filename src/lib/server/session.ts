import 'server-only';
import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { participantIdFor, testPrefixFor } from './pseudonym';
import { ADMIN_LOGIN, ADMIN_MAX_AGE, adminVersion, isAdminPayload } from '../admin-token';

export const SESSION_COOKIE = 'corsi_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
  /** Account identity (acct:CODE) — used only in memory (HMAC input and admin test prefix), never stored or logged. */
  uid: string;
  /** The sign-in code — used for the admin allowlist and to keep the same participant code. */
  email: string;
  /** Pseudonymous participant ID: HMAC-SHA256(uid), or an admin test-run participant. */
  pid: string;
  isAdmin: boolean;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is not configured (min 32 chars).');
  return new TextEncoder().encode(s);
}

export { ADMIN_LOGIN };

const isAdminLogin = (email: string) => email.toLowerCase() === ADMIN_LOGIN;

/**
 * Session cookie: signed, httpOnly, lives only in the user's own browser. `pid` is set only for admin test runs.
 * Admin cookies last 8 hours and carry a fingerprint of the current admin password (see lib/admin-token.ts).
 */
export async function createSessionToken(user: { uid: string; email: string; pid?: string }) {
  const admin = isAdminLogin(user.email);
  return new SignJWT({ email: user.email, ...(user.pid ? { pid: user.pid } : {}), ...(admin ? { av: await adminVersion() } : {}) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.uid)
    .setIssuedAt()
    .setExpirationTime(`${admin ? ADMIN_MAX_AGE : MAX_AGE}s`)
    .sign(secret());
}

export async function setSessionCookie(user: { uid: string; email: string; pid?: string }) {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: isAdminLogin(user.email) ? ADMIN_MAX_AGE : MAX_AGE
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Admin status is re-evaluated on every request. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    const uid = payload.sub;
    const email = String(payload.email ?? '');
    if (!uid || !email) return null;
    const isAdmin = await isAdminPayload(payload);
    // An old admin cookie (password changed since) is treated as signed out, not as a participant.
    if (isAdminLogin(email) && !isAdmin) return null;
    const own = participantIdFor(uid);
    const requested = typeof payload.pid === 'string' ? payload.pid : '';
    // Only admins may act as one of their own test-run participants.
    const pid = isAdmin && requested.startsWith(testPrefixFor(uid)) ? requested : own;
    return { uid, email, pid, isAdmin };
  } catch {
    return null;
  }
}
