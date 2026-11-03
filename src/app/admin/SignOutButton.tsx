'use client';

import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase/browser';

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-glass text-sm"
      onClick={async () => {
        await browserClient().auth.signOut();
        router.replace('/admin/login');
        router.refresh();
      }}>
      Sign out
    </button>
  );
}
