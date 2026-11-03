'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-glass text-sm"
      disabled={busy}
      onClick={async () => {
        if (!confirm('Sign out of this device? You can sign back in with your name and access code.')) return;
        setBusy(true);
        await api('logout').catch(() => undefined);
        router.push('/');
        router.refresh();
      }}>
      Not you? Sign out
    </button>
  );
}
