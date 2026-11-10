'use client';

export type SignInResult = { isAdmin: boolean; registered: boolean; next: string };

/** Signs in or creates an account; the server sets an httpOnly session cookie. */
export async function signInWithPassword(username: string, password: string, mode: 'login' | 'signup' | 'admin'): Promise<SignInResult> {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, mode })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Sign-in failed. Please try again.');
  return data;
}

export async function signOutEverywhere() {
  await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => undefined);
}

export function describeAuthError(err: unknown) {
  return err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
}
