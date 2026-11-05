import type { Condition } from './constants';

export type SessionStatus = 'break_in_progress' | 'awaiting_test' | 'test_in_progress' | 'completed';

export interface SessionSummary {
  id: string;
  condition: Condition;
  condition_order: number;
  status: SessionStatus;
  is_test: boolean;
  break_skipped: boolean;
  input_type?: string | null;
  expected_break_seconds: number;
  break_started_at: string;
  break_ends_at: string;
  break_completed_at: string | null;
  actual_break_seconds: number | null;
  break_interruptions: number;
  test_started_at: string | null;
  test_completed_at: string | null;
  test_duration_seconds: number | null;
  corsi_span: number | null;
  max_length_correct: number | null;
  total_score: number | null;
  correct_trials: number | null;
  incorrect_trials: number | null;
  total_attempts: number | null;
  accuracy: number | null;
  trials_done: number;
}

export interface ParticipantInfo {
  id: string;
  /** Short anonymous code, e.g. "P-7F3K". */
  code: string;
  assigned_order: Condition[];
  is_test: boolean;
  experiment_completed: boolean;
  experiment_completed_at: string | null;
  created_at: string;
}

export interface ParticipantState {
  participant: ParticipantInfo;
  sessions: SessionSummary[];
  server_now: string;
}

export interface TrialSpec {
  trial_number: number;
  sequence_length: number;
  attempt_at_length: number;
  sequence: number[];
}

export interface TrialRecord {
  trial_number: number;
  sequence_length: number;
  attempt_at_length: number;
  sequence: number[];
  response: number[];
  is_correct: boolean;
  response_time_ms: number | null;
}

export interface SessionDetail {
  session: SessionSummary;
  trials: TrialRecord[] | null;
  participant: { code: string; is_test: boolean };
  server_now: string;
}

export type NextTrialResponse =
  | { finished: false; trial: TrialSpec; correct?: boolean }
  | { finished: true; correct: boolean; session: SessionSummary };

export interface PublicSessionRow {
  participant: string;
  condition: Condition;
  condition_order: number;
  corsi_span: number;
  accuracy: number | null;
  correct_trials: number;
  total_attempts: number;
  completed_at: string;
}

export interface PublicResults {
  total_participants: number;
  sessions: PublicSessionRow[];
  generated_at: string;
}
