'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
};

function auth() {
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

/** Opens the Google sign-in popup and exchanges the Firebase ID token for a server session. */
export async function signInWithGoogle(): Promise<{ isAdmin: boolean; registered: boolean; next: string }> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth(), provider);
  const idToken = await cred.user.getIdToken();
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Sign-in failed.');
  return data;
}

export async function signOutEverywhere() {
  await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => undefined);
  await signOut(auth()).catch(() => undefined);
}

export function describeAuthError(err: unknown) {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Sign-in was cancelled.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
  if (code === 'auth/unauthorized-domain') return 'This website address is not authorised for Google sign-in yet.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection and try again.';
  return err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
}
