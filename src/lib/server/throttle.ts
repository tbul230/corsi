import 'server-only';
import { createHash } from 'node:crypto';
import { db } from './firebase-admin';

/**
 * Locks out repeated wrong passwords. Counts failures per key (e.g. one internet address, one participant code)
 * in Firestore so every server instance shares the count. Keys are hashed: no IP address or code is stored.
 */
const WINDOW_MS = 15 * 60 * 1000;

function ref(key: string) {
  const id = createHash('sha256').update(`${process.env.SESSION_SECRET ?? ''}|${key}`).digest('hex').slice(0, 40);
  return db().collection('login_throttle').doc(id);
}

/** Seconds until the key is unlocked (0 = not locked). */
export async function lockedFor(key: string): Promise<number> {
  const snap = await ref(key).get();
  const until = Number(snap.get('locked_until') ?? 0);
  return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

/** Records one wrong attempt; locks the key for 15 minutes once `limit` failures happen within 15 minutes. */
export async function recordFailure(key: string, limit: number) {
  const r = ref(key);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(r);
    const now = Date.now();
    const first = Number(snap.get('first_at') ?? 0);
    const fresh = !snap.exists || now - first > WINDOW_MS;
    const count = fresh ? 1 : Number(snap.get('count') ?? 0) + 1;
    tx.set(r, {
      count,
      first_at: fresh ? now : first,
      locked_until: count >= limit ? now + WINDOW_MS : Number(snap.get('locked_until') ?? 0),
      expires_at: new Date(now + 2 * WINDOW_MS)
    });
  });
}

export async function clearFailures(key: string) {
  await ref(key).delete();
}

/** The caller's internet address as Vercel reports it (used only as a hashed throttle key). */
export function clientIp(headers: Headers) {
  return headers.get('x-real-ip') ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}
