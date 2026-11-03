import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseEnv } from './env';

/** Cookie-based Supabase Auth client (used for the administrator area). */
export async function authServerClient() {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — the proxy refreshes sessions instead.
        }
      }
    }
  });
}

/** Returns the signed-in administrator, or null if the user is not signed in / not an admin. */
export async function getAdmin() {
  const supabase = await authServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false } as const;
  const { data, error } = await supabase.rpc('is_admin');
  return { supabase, user, isAdmin: !error && data === true } as const;
}
