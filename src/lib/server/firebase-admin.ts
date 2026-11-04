import 'server-only';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'corsitask';

/**
 * Server-only Firebase Admin app. Credentials come from the FIREBASE_SERVICE_ACCOUNT
 * environment variable (the JSON key from Firebase console → Project settings →
 * Service accounts, either raw JSON or base64). When FIRESTORE_EMULATOR_HOST is set
 * (local testing) no credentials are needed.
 */
function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId: FIREBASE_PROJECT_ID });
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured on the server.');
  }
  const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(json);
  return initializeApp({ credential: cert(sa), projectId: sa.project_id ?? FIREBASE_PROJECT_ID });
}

// One shared instance per server process (route bundles may load this module more than once).
const g = globalThis as unknown as { __corsiFirestore?: Firestore };
export function db(): Firestore {
  if (!g.__corsiFirestore) {
    const fs = getFirestore(app());
    try {
      fs.settings({ ignoreUndefinedProperties: true });
    } catch {
      /* already configured */
    }
    g.__corsiFirestore = fs;
  }
  return g.__corsiFirestore;
}
