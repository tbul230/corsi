import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/server/session';
import { getAdminData } from '@/lib/server/experiment';
import { toCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const TYPES = ['sessions', 'trials', 'participants', 'break-events'] as const;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const type = req.nextUrl.searchParams.get('type') ?? 'sessions';
  if (!TYPES.includes(type as (typeof TYPES)[number])) {
    return NextResponse.json({ error: 'Unknown export type.' }, { status: 400 });
  }

  const includeTest = req.nextUrl.searchParams.get('include_test') === '1';
  const all = await getAdminData();
  const testSessionIds = new Set(all.sessions.filter((s) => s.is_test).map((s) => s.id));
  // Admin test-mode runs are excluded from exports unless explicitly requested.
  const participants = includeTest ? all.participants : all.participants.filter((p) => !p.is_test);
  const sessions = includeTest ? all.sessions : all.sessions.filter((s) => !s.is_test);
  const trials = includeTest ? all.trials : all.trials.filter((t) => !testSessionIds.has(t.session_id));
  const events = includeTest ? all.events : all.events.filter((e) => !testSessionIds.has(e.session_id));
  const pById = new Map(participants.map((p) => [p.id, p]));
  const sById = new Map(sessions.map((s) => [s.id, s]));
  let csv: string;

  if (type === 'participants') {
    csv = toCsv(
      ['participant_id', 'first_name', 'last_name', 'email', 'is_test', 'created_at', 'consent_participation', 'consent_quiet_environment', 'consent_guidelines', 'consented_at', 'assigned_order', 'conditions_completed', 'experiment_completed', 'experiment_completed_at'],
      participants.map((p) => [
        p.id, p.first_name, p.last_name, p.email, p.is_test, p.created_at, p.consent_participation, p.consent_quiet_environment, p.consent_guidelines, p.consented_at,
        p.assigned_order.join(' > '),
        sessions.filter((s) => s.participant_id === p.id && s.status === 'completed').length,
        p.experiment_completed, p.experiment_completed_at
      ])
    );
  } else if (type === 'sessions') {
    csv = toCsv(
      ['session_id', 'participant_id', 'first_name', 'last_name', 'is_test', 'condition', 'condition_order', 'status', 'break_skipped', 'expected_break_seconds', 'break_started_at', 'break_ends_at', 'break_completed_at', 'actual_break_seconds', 'break_interruptions', 'test_started_at', 'test_completed_at', 'test_duration_seconds', 'test_interruptions', 'corsi_span', 'max_length_correct', 'total_score', 'correct_trials', 'incorrect_trials', 'total_attempts', 'accuracy_pct'],
      sessions.map((s) => {
        const p = pById.get(s.participant_id);
        return [s.id, s.participant_id, p?.first_name, p?.last_name, s.is_test, s.condition, s.condition_order, s.status, s.break_skipped, s.expected_break_seconds, s.break_started_at, s.break_ends_at, s.break_completed_at, s.actual_break_seconds, s.break_interruptions, s.test_started_at, s.test_completed_at, s.test_duration_seconds, s.test_interruptions, s.corsi_span, s.max_length_correct, s.total_score, s.correct_trials, s.incorrect_trials, s.total_attempts, s.accuracy];
      })
    );
  } else if (type === 'trials') {
    csv = toCsv(
      ['trial_id', 'session_id', 'participant_id', 'first_name', 'last_name', 'condition', 'trial_number', 'sequence_length', 'attempt_at_length', 'sequence', 'response', 'is_correct', 'response_time_ms', 'presented_at', 'responded_at'],
      trials.map((t) => {
        const s = sById.get(t.session_id);
        const p = s ? pById.get(s.participant_id) : undefined;
        // blocks exported 1–9 (left→right, top→bottom)
        return [t.id, t.session_id, s?.participant_id, p?.first_name, p?.last_name, s?.condition, t.trial_number, t.sequence_length, t.attempt_at_length, t.sequence.map((b) => b + 1).join('-'), t.response.map((b) => b + 1).join('-'), t.is_correct, t.response_time_ms, t.presented_at, t.responded_at];
      })
    );
  } else {
    csv = toCsv(
      ['event_id', 'session_id', 'participant_id', 'first_name', 'last_name', 'condition', 'event_type', 'client_remaining_seconds', 'occurred_at'],
      events.map((e) => {
        const s = sById.get(e.session_id);
        const p = s ? pById.get(s.participant_id) : undefined;
        return [e.id, e.session_id, s?.participant_id, p?.first_name, p?.last_name, s?.condition, e.event_type, e.client_remaining_seconds, e.occurred_at];
      })
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="corsi-${type}-${stamp}.csv"`,
      'Cache-Control': 'no-store'
    }
  });
}
