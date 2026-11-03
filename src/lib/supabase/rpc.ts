import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from './env';

/** Stateless client used by the server to call the token-checked RPC functions. */
export function rpcClient() {
  const { url, key } = supabaseEnv();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }
  });
}
