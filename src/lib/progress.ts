import { CONDITIONS, type Condition } from './constants';
import type { ParticipantState, SessionSummary } from './types';

export function conditionStatus(s: SessionSummary | undefined) {
  if (!s) return 'not_started' as const;
  return s.status === 'completed' ? ('completed' as const) : ('in_progress' as const);
}

export function progressOf(state: ParticipantState) {
  const byCondition = new Map<Condition, SessionSummary>(state.sessions.map((s) => [s.condition, s]));
  const completed = state.sessions.filter((s) => s.status === 'completed').length;
  const active = state.sessions.find((s) => s.status !== 'completed') ?? null;
  const recommended =
    state.participant.assigned_order.find((c) => !byCondition.has(c)) ??
    CONDITIONS.find((c) => !byCondition.has(c)) ??
    null;
  return { byCondition, completed, active, recommended };
}
