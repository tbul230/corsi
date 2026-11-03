'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, Eyebrow } from '@/components/ui';
import { LockIcon } from '@/components/icons';
import { browserClient } from '@/lib/supabase/browser';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await browserClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError('Invalid email or password.');
      setBusy(false);
      return;
    }
    router.replace('/admin');
    router.refresh();
  }

  return (
    <Card className="fade-up">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-sky-200">
        <LockIcon className="h-6 w-6" />
      </div>
      <div className="mt-4">
        <Eyebrow>Administrators only</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold">Researcher login</h1>
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
          <input id="email" type="email" required autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">Password</label>
          <input id="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error ? <Alert>{error}</Alert> : null}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Card>
  );
}
