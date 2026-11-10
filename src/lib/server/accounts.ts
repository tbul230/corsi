import 'server-only';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './firebase-admin';
import { participantIdFor, randomCode } from './pseudonym';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** Participants sign in with their assigned code (e.g. P-7F3K) and a password they chose. */
export const CODE_RE = /^P-[A-Z0-9]{4,5}$/;

export function normalizeCode(raw: unknown) {
  return String(raw ?? '').trim().toUpperCase().replace(/^P(?=[A-Z0-9]{4,5}$)/, 'P-');
}

/** The in-memory identity behind a code (never stored); the participant ID is an HMAC of it. */
export function uidFor(code: string) {
  return `acct:${code}`;
}

async function hash(password: string, salt: Buffer) {
  return (await scrypt(password, salt, 64)).toString('base64');
}

/** Creates an account with a fresh, unique code. The code doubles as the participant's anonymous code. */
export async function createAccount(password: string): Promise<string> {
  const salt = randomBytes(16);
  const pwHash = await hash(password, salt);
  return db().runTransaction(async (tx) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomCode('P', attempt < 5 ? 4 : 5);
      const codeRef = db().collection('codes').doc(code);
      const accRef = db().collection('accounts').doc(code);
      const [c, a] = await Promise.all([tx.get(codeRef), tx.get(accRef)]);
      if (c.exists || a.exists) continue;
      const now = new Date().toISOString();
      tx.create(accRef, { salt: salt.toString('base64'), hash: pwHash, created_at: now });
      tx.create(codeRef, { participant_id: participantIdFor(uidFor(code)), created_at: now });
      return code;
    }
    throw new Error('Could not allocate an anonymous code');
  });
}

export async function checkPassword(code: string, password: string): Promise<boolean> {
  const snap = await db().collection('accounts').doc(code).get();
  const salt = Buffer.from(snap.exists ? String(snap.get('salt')) : 'AAAAAAAAAAAAAAAAAAAAAA==', 'base64');
  const got = Buffer.from(await hash(password, salt), 'base64'); // hash even when missing, to keep timing similar
  if (!snap.exists) return false;
  const want = Buffer.from(String(snap.get('hash')), 'base64');
  return want.length === got.length && timingSafeEqual(want, got);
}
