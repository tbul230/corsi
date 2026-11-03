'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, Eyebrow } from '@/components/ui';
import { ArrowIcon, LockIcon } from '@/components/icons';
import { api, ApiError } from '@/lib/api';

export default function TestModeForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError('Enter the admin code.');
    setBusy(true);
    setError(null);
    try {
      await api('test-mode', { code });
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <Card className="fade-up">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-300/15 text-amber-200">
        <LockIcon className="h-6 w-6" />
      </div>
      <div className="mt-4">
        <Eyebrow>Researchers only</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold">Admin test mode</h1>
        <p className="mt-2 text-sm muted">
          Try the full experiment without registering. In test mode you can skip the 15-minute break and redo any
          condition. Test runs are labelled “Admin Test” and are <strong className="text-white">never counted</strong>{' '}
          in results, charts, statistics or exports.
        </p>
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="code" className="mb-1.5 block text-sm font-medium">Admin code</label>
          <input
            id="code"
            type="password"
            autoComplete="off"
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {error ? <Alert>{error}</Alert> : null}
        <button className="btn btn-primary w-full" disabled={busy} data-testid="enter-test-mode">
          {busy ? 'Checking…' : 'Start a test run'} <ArrowIcon className="h-5 w-5" />
        </button>
      </form>
    </Card>
  );
}
