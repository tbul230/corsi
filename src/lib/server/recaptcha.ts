import 'server-only';
import { ApiFailure } from '../participant-server';
import { db } from './firebase-admin';

const ALLOWED_HOSTS = ['corsitest.vercel.app', 'localhost'];
/** Google's public test secret (always passes, reports hostname testkey.google.com) — for automated tests only. */
const GOOGLE_TEST_SECRET = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';

/**
 * Verifies a reCAPTCHA v2 checkbox token server-side (single-use, expires after 2 minutes). Skipped only when no site key is
 * configured (local development). Logs only the outcome (hostname, error codes), never the token.
 */
let cached: { secret: string; at: number } | null = null;

/**
 * The secret comes from RECAPTCHA_SECRET_KEY, or else from the server-only Firestore doc config/recaptcha
 * (browsers cannot read Firestore at all: firestore.rules denies every client request).
 */
async function recaptchaSecret(): Promise<string> {
  if (process.env.RECAPTCHA_SECRET_KEY) return process.env.RECAPTCHA_SECRET_KEY;
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.secret;
  const snap = await db().collection('config').doc('recaptcha').get();
  cached = { secret: String(snap.get('secret') ?? ''), at: Date.now() };
  return cached.secret;
}

export async function verifyRecaptcha(token: unknown, action: string) {
  // Disabled only when the site has no reCAPTCHA site key at all (local development).
  if (!process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) return;
  const secret = await recaptchaSecret();
  if (!secret) {
    console.error('[recaptcha] site key is set but no secret is configured');
    throw new ApiFailure('SERVER_NOT_CONFIGURED', 503, 'The robot check is not set up correctly on the server. The research team needs to fix this.');
  }
  if (typeof token !== 'string' || !token || token.length > 4000) {
    throw new ApiFailure('RECAPTCHA_MISSING', 400, 'Please tick “I’m not a robot” first.');
  }
  let result: { success?: boolean; hostname?: string; 'error-codes'?: string[] };
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(8000)
    });
    result = await res.json();
  } catch {
    throw new ApiFailure('RECAPTCHA_UNAVAILABLE', 503, 'The robot check could not be completed right now. Please try again in a moment.');
  }
  const hosts = secret === GOOGLE_TEST_SECRET ? [...ALLOWED_HOSTS, 'testkey.google.com'] : ALLOWED_HOSTS;
  const ok = result.success === true && hosts.includes(result.hostname ?? '');
  if (!ok) {
    console.warn(`[recaptcha] rejected action=${action} host=${result.hostname} errors=${(result['error-codes'] ?? []).join(',')}`);
    throw new ApiFailure(
      'RECAPTCHA_FAILED',
      403,
      result['error-codes']?.includes('timeout-or-duplicate')
        ? 'The robot check expired. Please tick “I’m not a robot” again.'
        : 'The robot check failed. Please tick “I’m not a robot” again.'
    );
  }
}
