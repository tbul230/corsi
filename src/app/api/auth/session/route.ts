import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { checkPassword, CODE_RE, createAccount, normalizeCode, uidFor } from '@/lib/server/accounts';
import { participantIdFor } from '@/lib/server/pseudonym';
import { getParticipantState } from '@/lib/server/experiment';
import { ADMIN_LOGIN, clearSessionCookie, setSessionCookie } from '@/lib/server/session';
import { clearFailures, clientIp, lockedFor, recordFailure } from '@/lib/server/throttle';
import { errorResponse } from '@/lib/participant-server';
import { verifyRecaptcha } from '@/lib/server/recaptcha';

export const dynamic = 'force-dynamic';

function fail(error: string, status: number, code: string) {
  return NextResponse.json({ error, code }, { status });
}

/** Wrong-password limits (per 15 minutes). A locked key refuses every attempt, right or wrong, until it unlocks. */
const LIMITS = { adminPerIp: 5, adminTotal: 25, perCode: 10, loginPerIp: 50 };

async function locked(keys: string[]) {
  const waits = await Promise.all(keys.map(lockedFor));
  const wait = Math.max(0, ...waits);
  return wait
    ? fail(`Too many wrong tries. Please wait ${Math.ceil(wait / 60)} minute${wait > 60 ? 's' : ''} and try again.`, 429, 'TOO_MANY_TRIES')
    : null;
}

/** mode "signup": choose a password, get a new code. mode "login": code + password. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    if ((body.mode !== 'admin' && password.length < 6) || password.length > 200) return fail('Passwords must be at least 6 characters.', 400, 'BAD_PASSWORD');

    const mode = body.mode === 'admin' ? 'admin' : body.mode === 'signup' ? 'signup' : 'login';
    await verifyRecaptcha(body.recaptchaToken, mode);

    const ip = clientIp(req.headers);

    if (body.mode === 'admin') {
      const keys = [`admin-ip:${ip}`, 'admin-all'];
      const blocked = await locked(keys);
      if (blocked) return blocked;
      const expected = process.env.ADMIN_PASSWORD ?? '';
      const a = Buffer.from(password);
      const b = Buffer.from(expected);
      if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
        await Promise.all([recordFailure(keys[0], LIMITS.adminPerIp), recordFailure(keys[1], LIMITS.adminTotal)]);
        console.warn('[auth] wrong admin password');
        return fail('Wrong admin password.', 401, 'BAD_LOGIN');
      }
      await clearFailures(keys[0]);
      console.info('[auth] admin signed in');
      await setSessionCookie({ uid: 'admin', email: ADMIN_LOGIN });
      return NextResponse.json({ isAdmin: true, registered: false, next: '/admin' });
    }

    let code: string;
    if (body.mode === 'signup') {
      code = await createAccount(password);
    } else {
      code = normalizeCode(body.code);
      const keys = [`code:${code}`, `login-ip:${ip}`];
      const blocked = await locked(keys);
      if (blocked) return blocked;
      if (!CODE_RE.test(code) || !(await checkPassword(code, password))) {
        await Promise.all([recordFailure(keys[0], LIMITS.perCode), recordFailure(keys[1], LIMITS.loginPerIp)]);
        return fail('Wrong code or password. Codes look like P-7F3K.', 401, 'BAD_LOGIN');
      }
      await clearFailures(keys[0]);
    }

    const uid = uidFor(code);
    await setSessionCookie({ uid, email: code });
    const state = await getParticipantState(participantIdFor(uid));
    const active = state?.sessions.find((s) => s.status !== 'completed');
    const next = !state ? '/register' : active ? `/session/${active.id}` : '/dashboard';
    return NextResponse.json({ code, isAdmin: false, registered: Boolean(state), next });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
