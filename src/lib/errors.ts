/** Maps database error codes (raised by the RPC functions) to participant-friendly messages. */
export const ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  NOT_AUTHENTICATED: { status: 401, message: 'Your participant session has expired. Please sign in again.' },
  INVALID_NAME: {
    status: 400,
    message: 'Please enter a valid first and last name (letters, spaces, hyphens and apostrophes only).'
  },
  DUPLICATE_NAME: {
    status: 409,
    message: 'A participant with this name is already registered. Use “Returning participant” with your access code.'
  },
  CONSENT_REQUIRED: { status: 400, message: 'All three agreements must be accepted to take part.' },
  INVALID_ACCESS_CODE: { status: 401, message: 'That name and access code do not match our records.' },
  INVALID_CONDITION: { status: 400, message: 'Unknown break condition.' },
  CONDITION_ALREADY_DONE: { status: 409, message: 'You have already started or completed this break condition. Each condition can only be done once.' },
  SESSION_IN_PROGRESS: { status: 409, message: 'You already have a condition in progress. Finish it before starting another.' },
  SESSION_NOT_FOUND: { status: 404, message: 'Session not found.' },
  BREAK_NOT_FINISHED: { status: 409, message: 'The 15-minute break has not finished yet.' },
  TEST_ALREADY_COMPLETED: { status: 409, message: 'This test has already been completed and saved.' },
  NO_PENDING_TRIAL: { status: 409, message: 'There is no trial waiting for a response.' },
  INVALID_RESPONSE: { status: 400, message: 'Invalid response.' },
  INVALID_EVENT: { status: 400, message: 'Invalid event.' },
  INVALID_ADMIN_CODE: { status: 401, message: 'That admin code is not correct.' },
  TEST_MODE_ONLY: { status: 403, message: 'This action is only available in admin test mode.' },
  ADMIN_ONLY: { status: 403, message: 'Administrator access required.' },
  PARTICIPANT_NOT_FOUND: { status: 404, message: 'Participant not found.' },
  RESULTS_LOCKED: { status: 409, message: 'Submitted results cannot be changed.' }
};

export function mapDbError(message: string | undefined) {
  const code = (message ?? '').trim();
  const known = ERROR_MESSAGES[code];
  if (known) return { code, ...known };
  return { code: 'SERVER_ERROR', status: 500, message: 'Something went wrong while saving. Please try again.' };
}
