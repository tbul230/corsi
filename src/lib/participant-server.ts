import 'server-only';
import { NextResponse } from 'next/server';
import { mapDbError } from './errors';
import { ExperimentError, getParticipantState } from './server/experiment';
import { getSessionUser, type SessionUser } from './server/session';

export class ApiFailure extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/** Converts experiment errors into JSON responses with participant-friendly messages. */
export function errorResponse(err: unknown) {
  if (err instanceof ExperimentError || err instanceof ApiFailure) {
    const code = err instanceof ExperimentError ? err.code : err.code;
    const mapped = mapDbError(code);
    const status = err instanceof ApiFailure ? err.status : mapped.status;
    const message = err instanceof ApiFailure ? err.message : mapped.message;
    return NextResponse.json({ error: message, code }, { status });
  }
  return NextResponse.json(...describeServerError(err));
}

/**
 * Turns infrastructure failures into a specific, honest message for the participant and logs the
 * real cause (with a short reference) for the research team. Never a generic "unexpected error".
 */
export function describeServerError(err: unknown): [{ error: string; code: string; ref: string }, { status: number }] {
  const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
  const e = err as { code?: unknown; message?: unknown } | null;
  const message = String(e?.message ?? err);
  const grpc = typeof e?.code === 'number' ? e.code : null;
  // No personal data in logs: only the error type/code/message (emails masked) and a request reference.
  const safe = message.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]').slice(0, 500);
  console.error(`[corsi ${ref}] ${(err as Error)?.name ?? 'Error'}${grpc !== null ? ` code=${grpc}` : ''}: ${safe}`);
  let body: { error: string; code: string };
  let status = 503;
  if (/FIREBASE_SERVICE_ACCOUNT|SESSION_SECRET/.test(message)) {
    body = { code: 'SERVER_NOT_CONFIGURED', error: 'The study server is missing part of its configuration, so nothing could be saved. The research team needs to fix this — please try again later.' };
  } else if (grpc === 7 || grpc === 16 || /PERMISSION_DENIED|UNAUTHENTICATED|invalid_grant/i.test(message)) {
    body = { code: 'DATABASE_AUTH_FAILED', error: 'The study server could not log in to its database, so nothing could be saved. The research team needs to fix this — please try again later.' };
  } else if (grpc === 14 || grpc === 4 || /UNAVAILABLE|DEADLINE_EXCEEDED|ETIMEDOUT|ECONNRESET|fetch failed/i.test(message)) {
    body = { code: 'DATABASE_UNAVAILABLE', error: 'The study database did not respond in time. Nothing was lost — please try again in a moment.' };
  } else if (grpc === 10 || /ABORTED|contention/i.test(message)) {
    status = 409;
    body = { code: 'TRY_AGAIN', error: 'Your request clashed with another save made at the same moment. Nothing was lost — please try again.' };
  } else {
    status = 500;
    body = { code: 'SERVER_ERROR', error: `The server could not complete this request (reference ${ref}). Your saved results are safe — please try again, and tell the researchers this reference if it keeps happening.` };
  }
  return [{ ...body, ref }, { status }];
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiFailure('NOT_AUTHENTICATED', 401, 'Please sign in with Google to continue.');
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw new ApiFailure('ADMIN_ONLY', 403, 'Administrator access required.');
  return user;
}

/** Server-side state lookup used by participant pages. Null = not signed in or not registered. */
export async function loadParticipantState() {
  const user = await getSessionUser();
  if (!user) return { user: null, state: null };
  return { user, state: await getParticipantState(user.pid) };
}
