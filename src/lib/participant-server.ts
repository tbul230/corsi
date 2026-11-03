import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { rpcClient } from './supabase/rpc';
import { mapDbError } from './errors';

export const PARTICIPANT_COOKIE = 'corsi_participant';
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function getParticipantToken() {
  return (await cookies()).get(PARTICIPANT_COOKIE)?.value ?? null;
}

export async function setParticipantToken(token: string) {
  (await cookies()).set(PARTICIPANT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR
  });
}

export async function clearParticipantToken() {
  (await cookies()).delete(PARTICIPANT_COOKIE);
}

export class RpcError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Calls a database RPC function and throws a mapped RpcError on failure. */
export async function callRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await rpcClient().rpc(fn, args);
  if (error) {
    const mapped = mapDbError(error.message);
    if (mapped.code === 'SERVER_ERROR') console.error(`[rpc ${fn}]`, error);
    throw new RpcError(mapped.code, mapped.status, mapped.message);
  }
  return data as T;
}

export function errorResponse(err: unknown) {
  if (err instanceof RpcError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json(
    { error: 'Unexpected server error. Please try again.', code: 'SERVER_ERROR' },
    { status: 500 }
  );
}

/** Server-side state lookup used by participant pages. Returns null when not signed in. */
export async function loadParticipantState<T>() {
  const token = await getParticipantToken();
  if (!token) return null;
  try {
    return await callRpc<T>('get_participant_state', { p_token: token });
  } catch (e) {
    if (e instanceof RpcError && e.code === 'NOT_AUTHENTICATED') return null;
    throw e;
  }
}
