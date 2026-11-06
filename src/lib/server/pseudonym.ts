import 'server-only';
import { createHmac, randomInt } from 'node:crypto';

/**
 * Pseudonymous participant IDs. All participant data is keyed by
 *   participantId = HMAC-SHA256(firebaseUid, PARTICIPANT_ID_SECRET)
 * The secret lives only in the server environment, so nobody with database or export
 * access can map a participant back to a Google account. The same Google account
 * always yields the same ID, which is how progress resumes across devices.
 */
function secret() {
  const s = process.env.PARTICIPANT_ID_SECRET;
  if (!s || s.length < 32) throw new Error('PARTICIPANT_ID_SECRET is not configured (min 32 chars).');
  return s;
}

export function participantIdFor(firebaseUid: string): string {
  return createHmac('sha256', secret()).update(firebaseUid, 'utf8').digest('hex');
}

/** Prefix for admin test-run participants: derived from the admin's HMAC, never their UID or email. */
export function testPrefixFor(firebaseUid: string): string {
  return `test_${participantIdFor(firebaseUid).slice(0, 16)}_`;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no 0/O, 1/I/L, U

/** Short random display code such as "P-7F3K" (random, not derived from anything about the person). */
export function randomCode(prefix: 'P' | 'T', length = 4): string {
  let s = '';
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${s}`;
}
