import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AdminParticipant {
  id: string;
  first_name: string;
  last_name: string;
  access_code: string;
  consent_participation: boolean;
  consent_quiet_environment: boolean;
  consent_guidelines: boolean;
  consented_at: string;
  assigned_order: string[];
  experiment_completed: boolean;
  experiment_completed_at: string | null;
  created_at: string;
}

export interface AdminSession {
  id: string;
  participant_id: string;
  condition: 'video_game' | 'youtube' | 'no_screen';
  condition_order: number;
  status: string;
  expected_break_seconds: number;
  break_started_at: string;
  break_ends_at: string;
  break_completed_at: string | null;
  actual_break_seconds: number | null;
  break_interruptions: number;
  test_started_at: string | null;
  test_completed_at: string | null;
  test_duration_seconds: number | null;
  test_interruptions: number;
  corsi_span: number | null;
  max_length_correct: number | null;
  total_score: number | null;
  correct_trials: number | null;
  incorrect_trials: number | null;
  total_attempts: number | null;
  accuracy: number | null;
  created_at: string;
}

export interface AdminTrial {
  id: string;
  session_id: string;
  trial_number: number;
  sequence_length: number;
  attempt_at_length: number;
  sequence: number[];
  response: number[];
  is_correct: boolean;
  response_time_ms: number | null;
  presented_at: string;
  responded_at: string;
}

export interface AdminBreakEvent {
  id: number;
  session_id: string;
  event_type: string;
  client_remaining_seconds: number | null;
  occurred_at: string;
}

const SESSION_COLS =
  'id,participant_id,condition,condition_order,status,expected_break_seconds,break_started_at,break_ends_at,break_completed_at,actual_break_seconds,break_interruptions,test_started_at,test_completed_at,test_duration_seconds,test_interruptions,corsi_span,max_length_correct,total_score,correct_trials,incorrect_trials,total_attempts,accuracy,created_at';

/** Reads everything with the admin's own JWT — RLS only returns rows if the user is in public.admins. */
async function fetchAll<T>(supabase: SupabaseClient, table: string, cols: string, order: string) {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select(cols).order(order).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function loadAdminData(supabase: SupabaseClient) {
  const [participants, sessions, trials, events] = await Promise.all([
    fetchAll<AdminParticipant>(supabase, 'participants', 'id,first_name,last_name,access_code,consent_participation,consent_quiet_environment,consent_guidelines,consented_at,assigned_order,experiment_completed,experiment_completed_at,created_at', 'created_at'),
    fetchAll<AdminSession>(supabase, 'experiment_sessions', SESSION_COLS, 'created_at'),
    fetchAll<AdminTrial>(supabase, 'trial_results', 'id,session_id,trial_number,sequence_length,attempt_at_length,sequence,response,is_correct,response_time_ms,presented_at,responded_at', 'responded_at'),
    fetchAll<AdminBreakEvent>(supabase, 'break_events', 'id,session_id,event_type,client_remaining_seconds,occurred_at', 'id')
  ]);
  return { participants, sessions, trials, events };
}

export type AdminData = Awaited<ReturnType<typeof loadAdminData>>;
