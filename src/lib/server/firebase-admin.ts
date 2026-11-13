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
interface ServiceAccountJson {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

/**
 * Accepts the service-account key as pasted in Vercel: raw JSON (optionally wrapped in quotes,
 * with stray whitespace/BOM), a JSON string literal, or base64. Never logs the key itself.
 */
function parseServiceAccount(raw: string): ServiceAccountJson {
  let v = raw.replace(/^\uFEFF/, '').trim();
  const attempts: string[] = [];
  for (let i = 0; i < 3; i++) {
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('`') && v.endsWith('`'))) v = v.slice(1, -1).trim();
    if (v.startsWith('{')) {
      try {
        const sa = JSON.parse(v) as ServiceAccountJson;
        if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
        if (!sa.client_email || !sa.private_key) throw new Error('missing client_email/private_key');
        return sa;
      } catch (e) {
        attempts.push(`json:${(e as Error).message.slice(0, 60)}`);
        break;
      }
    }
    if (v.startsWith('"')) {
      try {
        v = String(JSON.parse(v)).trim();
        continue;
      } catch {
        attempts.push('quoted-string');
      }
    }
    const decoded = Buffer.from(v, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) {
      v = decoded;
      continue;
    }
    break;
  }
  const first = raw.trim().charCodeAt(0);
  throw new Error(
    `FIREBASE_SERVICE_ACCOUNT is not a valid service-account JSON key (length ${raw.length}, first char code ${first}, ${attempts.join(', ') || 'not JSON or base64 JSON'}). ` +
      'Paste the full contents of the downloaded .json file.'
  );
}

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId: FIREBASE_PROJECT_ID });
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured on the server.');
  }
  const sa = parseServiceAccount(raw);
  return initializeApp({
    credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }),
    projectId: sa.project_id ?? FIREBASE_PROJECT_ID
  });
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
