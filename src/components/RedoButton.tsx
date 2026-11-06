'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { Condition } from '@/lib/constants';

/** Test mode only: delete this test condition so it can be done again. */
export default function RedoButton({ condition, label = 'Redo' }: { condition: Condition; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="rounded-md border border-amber-300/40 bg-amber-300/10 px-2.5 py-0.5 text-xs font-medium text-amber-100 hover:bg-amber-300/20 disabled:opacity-50"
      disabled={busy}
      data-testid={`redo-${condition}`}
      onClick={async () => {
        setBusy(true);
        try {
          await api('reset-condition', { condition });
          router.push('/dashboard');
          router.refresh();
        } catch (err) {
          alert(err instanceof ApiError ? err.message : 'Could not reset.');
        } finally {
          setBusy(false);
        }
      }}>
      {busy ? 'Resetting…' : label}
    </button>
  );
}
