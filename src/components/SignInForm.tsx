'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { describeAuthError, signInWithPassword, type SignInResult } from '@/lib/firebase/client';
import { Alert } from './ui';

/**
 * Code + password sign-in. New participants choose a password and are given a random code
 * (e.g. P-7F3K) that they sign in with from then on. No name, email or account is needed.
 */
export default function SignInForm({
  adminTarget,
  reloadAfter,
  initialMode = 'signup'
}: {
  adminTarget?: string;
  reloadAfter?: boolean;
  initialMode?: 'signup' | 'login';
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<(SignInResult & { code: string }) | null>(null);

  function proceed(r: SignInResult) {
    if (reloadAfter) window.location.reload();
    else if (adminTarget && r.isAdmin) router.push(adminTarget);
    else router.push(r.next || (r.registered ? '/dashboard' : '/register'));
    router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = (await signInWithPassword(code, password, mode)) as SignInResult & { code: string };
      if (mode === 'signup') {
        setCreated(r);
        setBusy(false);
      } else proceed(r);
    } catch (err) {
      setError(describeAuthError(err));
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-4 text-left" data-testid="new-code">
        <p className="text-sm text-ink-2">Your sign-in code is:</p>
        <p className="pop text-center font-mono text-4xl font-semibold tracking-widest" data-testid="assigned-code">
          {created.code}
        </p>
        <Alert tone="info">
          Write this code down. You need it and your password to come back for your other sessions — it can&apos;t be recovered.
        </Alert>
        <button className="btn btn-primary w-full" onClick={() => proceed(created)} data-testid="continue-after-code">
          I wrote it down — continue
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <div className="glass-soft grid grid-cols-2 gap-1 rounded-xl p-1 text-sm" role="tablist">
        {(['signup', 'login'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            data-testid={`mode-${m}`}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`rounded-lg px-3 py-2 font-medium transition ${mode === m ? 'bg-white/15 text-ink' : 'text-ink-3 hover:text-ink'}`}>
            {m === 'signup' ? 'New participant' : 'I have a code'}
          </button>
        ))}
      </div>
      {mode === 'login' ? (
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">Your code</span>
          <input
            className="input font-mono uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="P-7F3K"
            autoComplete="username"
            autoCapitalize="characters"
            required
            data-testid="code-input"
          />
        </label>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block text-ink-2">{mode === 'signup' ? 'Choose a password' : 'Password'}</span>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
          data-testid="password-input"
        />
      </label>
      {mode === 'signup' ? <p className="text-xs text-ink-3">At least 6 characters. You&apos;ll be given a code to sign in with.</p> : null}
      <button type="submit" className="btn btn-primary w-full" disabled={busy} data-testid="signin-submit">
        {busy ? 'Please wait…' : mode === 'signup' ? 'Get my code' : 'Sign in'}
      </button>
      {error ? <Alert>{error}</Alert> : null}
    </form>
  );
}
