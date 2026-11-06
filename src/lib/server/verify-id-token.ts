import 'server-only';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { FIREBASE_PROJECT_ID } from './firebase-admin';

// Google's public keys for Firebase Auth ID tokens (cached and rotated automatically by jose).
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export interface FirebaseIdToken extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  auth_time?: number;
  firebase?: { sign_in_provider?: string };
}

/**
 * Verifies a Firebase Auth ID token exactly as documented by Firebase:
 * RS256 signature from Google's securetoken keys, issuer and audience = this project,
 * not expired, issued/auth_time in the past and a non-empty subject (uid).
 */
export async function verifyFirebaseIdToken(token: string): Promise<FirebaseIdToken> {
  const { payload } = await jwtVerify(token, JWKS, {
    algorithms: ['RS256'],
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID
  });
  const p = payload as FirebaseIdToken;
  const now = Math.floor(Date.now() / 1000) + 60;
  if (!p.sub || p.sub.length > 128) throw new Error('invalid subject');
  if (typeof p.auth_time !== 'number' || p.auth_time > now) throw new Error('invalid auth_time');
  if (typeof p.iat === 'number' && p.iat > now) throw new Error('invalid iat');
  return p;
}
