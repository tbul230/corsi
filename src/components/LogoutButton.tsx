'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signOutEverywhere } from '@/lib/firebase/client';

export default function LogoutButton({ label = 'Sign out' }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-glass text-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOutEverywhere();
        router.push('/');
        router.refresh();
      }}>
      {busy ? 'Signing out…' : label}
    </button>
  );
}
