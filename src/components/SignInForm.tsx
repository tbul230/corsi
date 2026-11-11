'use client';

import { useRef, useState } from 'react';
import { describeAuthError, signInWithPassword, type SignInResult } from '@/lib/firebase/client';
import { recaptchaEnabled } from '@/lib/recaptcha';
import RecaptchaBox, { type RecaptchaHandle } from './RecaptchaBox';
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
  initialMode?: 'signup' | 'login' | 'admin';
}) {
  const [mode, setMode] = useState<'signup' | 'login' | 'admin'>(initialMode);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState('');
  const captchaBox = useRef<RecaptchaHandle>(null);
  const [created, setCreated] = useState<(SignInResult & { code: string }) | null>(null);

  // A full page load (not client navigation) so no page cached while signed out is reused.
  function proceed(r: SignInResult) {
    if (reloadAfter) window.location.reload();
    else window.location.assign(adminTarget && r.isAdmin ? adminTarget : r.next || (r.registered ? '/dashboard' : '/register'));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Read what is actually in the fields (covers browser autofill and typing before the page finished loading).
      const f = new FormData(e.currentTarget as HTMLFormElement);
      const r = (await signInWithPassword(String(f.get('code') ?? code), String(f.get('password') ?? password), mode, captcha)) as SignInResult & { code: string };
      if (mode === 'signup') {
        setCreated(r);
        setBusy(false);
      } else proceed(r);
    } catch (err) {
      setError(describeAuthError(err));
      captchaBox.current?.reset(); // tokens are single-use
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
    <form onSubmit={submit} method="post" className="space-y-3 text-left">
      {mode === 'admin' ? null : (<div className="glass-soft grid grid-cols-2 gap-1 rounded-xl p-1 text-sm" role="tablist">
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
      </div>)}
      {mode === 'login' ? (
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">Your code</span>
          <input
            className="input font-mono uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            name="code"
            placeholder="P-7F3K"
            autoComplete="username"
            autoCapitalize="characters"
            required
            data-testid="code-input"
          />
        </label>
      ) : null}
      <label className="block text-sm">
        <span className="mb-1 block text-ink-2">{mode === 'signup' ? 'Choose a password' : mode === 'admin' ? 'Admin password' : 'Password'}</span>
        <input
          className="input"
          type="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={mode === 'admin' ? 1 : 6}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          required
          data-testid="password-input"
        />
      </label>
      {mode === 'signup' ? <p className="text-xs text-ink-3">At least 6 characters. You&apos;ll be given a code to sign in with.</p> : null}
      <RecaptchaBox ref={captchaBox} onToken={setCaptcha} />
      <button type="submit" className="btn btn-primary w-full" disabled={busy || (recaptchaEnabled && !captcha)} data-testid="signin-submit">
        {busy ? 'Please wait…' : mode === 'signup' ? 'Get my code' : 'Sign in'}
      </button>
      {error ? <Alert>{error}</Alert> : null}
    </form>
  );
}
