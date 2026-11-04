'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function TestModeBanner({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div
      data-testid="test-mode-banner"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100 backdrop-blur-md ${className}`}>
      <span>
        <strong>Admin test mode</strong> — breaks can be skipped and conditions redone. These results are not counted.
      </span>
      <button
        className="rounded-lg border border-amber-300/40 px-3 py-1 text-xs font-medium hover:bg-amber-300/15 disabled:opacity-50"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch('/api/admin/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'exit-test' })
          });
          router.push('/admin');
          router.refresh();
        }}>
        {busy ? 'Leaving…' : 'Exit test mode'}
      </button>
    </div>
  );
}
