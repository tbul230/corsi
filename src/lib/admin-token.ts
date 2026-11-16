/**
 * Admin session safety, shared by the server and src/proxy.ts (Web Crypto only, so it runs in either runtime).
 *
 * An admin cookie carries `av` = a fingerprint of the current ADMIN_PASSWORD (keyed with SESSION_SECRET).
 * Changing the admin password changes the fingerprint, which instantly signs out every admin session.
 */
export const ADMIN_LOGIN = 'admin';
export const ADMIN_MAX_AGE = 60 * 60 * 8; // admin sessions last 8 hours

export async function adminVersion(): Promise<string> {
  const data = new TextEncoder().encode(`${process.env.SESSION_SECRET ?? ''}|admin|${process.env.ADMIN_PASSWORD ?? ''}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Old email-based admin accounts (from the Google sign-in days). Only honoured when E2E_ALLOW_EMAIL_ADMINS=1,
 * which the automated tests set and the real site does not, so it is never a way in on production.
 */
export function emailAdmins(): string[] {
  if (process.env.E2E_ALLOW_EMAIL_ADMINS !== '1') return [];
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** True when a verified cookie payload belongs to a current admin session. */
export async function isAdminPayload(payload: Record<string, unknown>): Promise<boolean> {
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  if (email === ADMIN_LOGIN) return Boolean(process.env.ADMIN_PASSWORD) && payload.av === (await adminVersion());
  return email !== '' && emailAdmins().includes(email);
}
