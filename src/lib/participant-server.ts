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
  console.error(err);
  return NextResponse.json({ error: 'Unexpected server error. Please try again.', code: 'SERVER_ERROR' }, { status: 500 });
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
