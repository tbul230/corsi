-- =====================================================================
-- Corsi Block-Tapping Experiment — schema, integrity rules and RPC API
-- =====================================================================
-- Design notes
--  * All participant-facing operations go through SECURITY DEFINER
--    functions. Tables have RLS enabled and NO policies for anon, so the
--    public key cannot read or write tables directly.
--  * Participants authenticate with an opaque random token (stored only as
--    a SHA-256 hash) held in an httpOnly cookie by the Next.js server.
--  * Break timing, test timing, sequence generation and scoring are all
--    decided server-side, so the client cannot shorten the break, choose
--    its own sequences or forge scores.
--  * UNIQUE (participant_id, condition) makes repeating a condition
--    impossible regardless of tabs, browsers or direct API calls.
--  * Triggers make completed sessions and trial rows immutable.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create type public.break_condition as enum ('video_game', 'youtube', 'no_screen');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 60),
  access_code text not null unique,
  consent_participation boolean not null,
  consent_quiet_environment boolean not null,
  consent_guidelines boolean not null,
  consented_at timestamptz not null default now(),
  assigned_order public.break_condition[] not null check (cardinality(assigned_order) = 3),
  experiment_completed boolean not null default false,
  experiment_completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint consent_all_given check (consent_participation and consent_quiet_environment and consent_guidelines)
);
create unique index participants_name_unique
  on public.participants (lower(btrim(first_name)), lower(btrim(last_name)));

create table public.participant_tokens (
  token_hash text primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
create index participant_tokens_participant_idx on public.participant_tokens(participant_id);

create table public.experiment_sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  condition public.break_condition not null,
  condition_order smallint not null check (condition_order between 1 and 3),
  status text not null default 'break_in_progress'
    check (status in ('break_in_progress', 'awaiting_test', 'test_in_progress', 'completed')),
  -- break
  expected_break_seconds integer not null default 900 check (expected_break_seconds = 900),
  break_started_at timestamptz not null default now(),
  break_ends_at timestamptz not null,
  break_completed_at timestamptz,
  actual_break_seconds numeric(10, 3),
  break_interruptions integer not null default 0,
  -- test
  test_started_at timestamptz,
  test_completed_at timestamptz,
  test_duration_seconds numeric(10, 3),
  test_interruptions integer not null default 0,
  current_length smallint,
  failures_at_length smallint not null default 0,
  pending_sequence smallint[],
  pending_issued_at timestamptz,
  -- results
  corsi_span smallint,
  max_length_correct smallint,
  total_score integer,
  correct_trials integer,
  incorrect_trials integer,
  total_attempts integer,
  accuracy numeric(5, 2),
  created_at timestamptz not null default now(),
  constraint one_attempt_per_condition unique (participant_id, condition),
  constraint one_session_per_order_slot unique (participant_id, condition_order),
  constraint break_is_fifteen_minutes check (extract(epoch from (break_ends_at - break_started_at)) = 900),
  constraint break_completed_after_end check (break_completed_at is null or break_completed_at >= break_ends_at),
  constraint test_after_break check (test_started_at is null or (break_completed_at is not null and test_started_at >= break_completed_at))
);
create index experiment_sessions_participant_idx on public.experiment_sessions(participant_id);

create table public.trial_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.experiment_sessions(id) on delete cascade,
  trial_number smallint not null,
  sequence_length smallint not null check (sequence_length between 2 and 9),
  attempt_at_length smallint not null check (attempt_at_length in (1, 2)),
  sequence smallint[] not null,
  response smallint[] not null,
  is_correct boolean not null,
  response_time_ms integer check (response_time_ms is null or response_time_ms between 0 and 600000),
  presented_at timestamptz not null,
  responded_at timestamptz not null default now(),
  unique (session_id, trial_number)
);
create index trial_results_session_idx on public.trial_results(session_id);

create table public.break_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.experiment_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('page_opened', 'page_closed', 'tab_hidden', 'tab_visible')),
  client_remaining_seconds integer,
  occurred_at timestamptz not null default now()
);
create index break_events_session_idx on public.break_events(session_id);

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Immutability of submitted results
-- ---------------------------------------------------------------------
create or replace function public.prevent_completed_session_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'completed' then
      raise exception 'RESULTS_LOCKED' using hint = 'Completed sessions cannot be deleted.';
    end if;
    return old;
  end if;
  if old.status = 'completed' then
    raise exception 'RESULTS_LOCKED' using hint = 'Completed sessions cannot be modified.';
  end if;
  if new.participant_id <> old.participant_id or new.condition <> old.condition
     or new.break_started_at <> old.break_started_at or new.break_ends_at <> old.break_ends_at then
    raise exception 'IMMUTABLE_FIELD';
  end if;
  return new;
end $$;

create trigger experiment_sessions_lock
  before update or delete on public.experiment_sessions
  for each row execute function public.prevent_completed_session_changes();

create or replace function public.prevent_trial_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'RESULTS_LOCKED' using hint = 'Trial results cannot be modified or deleted.';
end $$;

create trigger trial_results_lock
  before update or delete on public.trial_results
  for each row execute function public.prevent_trial_changes();

-- ---------------------------------------------------------------------
-- Row Level Security: participants have NO direct table access.
-- Admins (Supabase Auth users listed in public.admins) may read everything.
-- ---------------------------------------------------------------------
alter table public.participants enable row level security;
alter table public.participant_tokens enable row level security;
alter table public.experiment_sessions enable row level security;
alter table public.trial_results enable row level security;
alter table public.break_events enable row level security;
alter table public.admins enable row level security;

revoke all on public.participants, public.participant_tokens, public.experiment_sessions,
  public.trial_results, public.break_events, public.admins from anon, authenticated;
grant select on public.participants, public.experiment_sessions, public.trial_results,
  public.break_events, public.admins to authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy "admins read participants" on public.participants
  for select to authenticated using ((select public.is_admin()));
create policy "admins read sessions" on public.experiment_sessions
  for select to authenticated using ((select public.is_admin()));
create policy "admins read trials" on public.trial_results
  for select to authenticated using ((select public.is_admin()));
create policy "admins read break events" on public.break_events
  for select to authenticated using ((select public.is_admin()));
create policy "admins read own admin row" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Internal helpers (not callable by API roles)
-- ---------------------------------------------------------------------
create or replace function public._participant_from_token(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update public.participant_tokens
     set last_used_at = now()
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  returning participant_id into v_id;
  if v_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  return v_id;
end $$;

create or replace function public._issue_token(p_participant uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.participant_tokens(token_hash, participant_id)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_participant);
  return v_token;
end $$;

create or replace function public._clean_name(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text := regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g');
begin
  if char_length(v) < 1 or char_length(v) > 60 then
    raise exception 'INVALID_NAME';
  end if;
  -- letters (any script), spaces, hyphens, apostrophes and periods; must start with a letter
  if v !~ '^[[:alpha:]][[:alpha:] ''’.-]*$' then
    raise exception 'INVALID_NAME';
  end if;
  return v;
end $$;

create or replace function public._random_sequence(p_length int)
returns smallint[] language sql volatile set search_path = '' as $$
  -- p_length distinct blocks (0..8) in random order: no block repeats within a sequence
  select array_agg(b order by r)::smallint[]
  from (select b, random() as r from generate_series(0, 8) b order by r limit p_length) s;
$$;

create or replace function public._session_json(s public.experiment_sessions)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id,
    'condition', s.condition,
    'condition_order', s.condition_order,
    'status', s.status,
    'expected_break_seconds', s.expected_break_seconds,
    'break_started_at', s.break_started_at,
    'break_ends_at', s.break_ends_at,
    'break_completed_at', s.break_completed_at,
    'actual_break_seconds', s.actual_break_seconds,
    'break_interruptions', s.break_interruptions,
    'test_started_at', s.test_started_at,
    'test_completed_at', s.test_completed_at,
    'test_duration_seconds', s.test_duration_seconds,
    'corsi_span', s.corsi_span,
    'max_length_correct', s.max_length_correct,
    'total_score', s.total_score,
    'correct_trials', s.correct_trials,
    'incorrect_trials', s.incorrect_trials,
    'total_attempts', s.total_attempts,
    'accuracy', s.accuracy,
    'trials_done', (select count(*) from public.trial_results t where t.session_id = s.id)
  );
$$;

create or replace function public._participant_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'participant', jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
      'access_code', p.access_code, 'assigned_order', to_jsonb(p.assigned_order),
      'experiment_completed', p.experiment_completed,
      'experiment_completed_at', p.experiment_completed_at, 'created_at', p.created_at),
    'sessions', coalesce((select jsonb_agg(public._session_json(s) order by s.condition_order)
                          from public.experiment_sessions s where s.participant_id = p.id), '[]'::jsonb),
    'server_now', now())
  from public.participants p where p.id = p_id;
$$;

-- Choose the least-used of the 6 possible condition orders (counterbalancing).
create or replace function public._balanced_order()
returns public.break_condition[] language sql volatile security definer set search_path = '' as $$
  with perms(ord) as (values
    (array['video_game','youtube','no_screen']::public.break_condition[]),
    (array['video_game','no_screen','youtube']::public.break_condition[]),
    (array['youtube','video_game','no_screen']::public.break_condition[]),
    (array['youtube','no_screen','video_game']::public.break_condition[]),
    (array['no_screen','video_game','youtube']::public.break_condition[]),
    (array['no_screen','youtube','video_game']::public.break_condition[]))
  select ord from perms
  order by (select count(*) from public.participants p where p.assigned_order = perms.ord), random()
  limit 1;
$$;

-- Finalise a session: compute all scores from the stored trial rows.
create or replace function public._finalise_session(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_correct int; v_incorrect int; v_span int; v_now timestamptz := now(); v_participant uuid;
begin
  select count(*) filter (where is_correct), count(*) filter (where not is_correct),
         coalesce(max(sequence_length) filter (where is_correct), 0)
    into v_correct, v_incorrect, v_span
    from public.trial_results where session_id = p_session;

  update public.experiment_sessions set
    status = 'completed',
    test_completed_at = v_now,
    test_duration_seconds = round(extract(epoch from (v_now - test_started_at))::numeric, 3),
    corsi_span = v_span,
    max_length_correct = v_span,
    total_score = v_span * v_correct,
    correct_trials = v_correct,
    incorrect_trials = v_incorrect,
    total_attempts = v_correct + v_incorrect,
    accuracy = case when v_correct + v_incorrect = 0 then null
                    else round(100.0 * v_correct / (v_correct + v_incorrect), 2) end,
    pending_sequence = null,
    pending_issued_at = null,
    current_length = null
  where id = p_session
  returning participant_id into v_participant;

  update public.participants p set experiment_completed = true, experiment_completed_at = v_now
   where p.id = v_participant and not p.experiment_completed
     and (select count(*) from public.experiment_sessions s
           where s.participant_id = v_participant and s.status = 'completed') = 3;
end $$;

-- Issue the next trial (generates and stores a new pending sequence).
create or replace function public._issue_trial(p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.experiment_sessions; v_seq smallint[]; v_trial int;
begin
  select * into s from public.experiment_sessions where id = p_session;
  v_seq := public._random_sequence(s.current_length);
  update public.experiment_sessions
     set pending_sequence = v_seq, pending_issued_at = now()
   where id = p_session;
  select count(*) + 1 into v_trial from public.trial_results where session_id = p_session;
  return jsonb_build_object(
    'trial_number', v_trial,
    'sequence_length', s.current_length,
    'attempt_at_length', s.failures_at_length + 1,
    'sequence', to_jsonb(v_seq));
end $$;

revoke all on function public._participant_from_token(text), public._issue_token(uuid),
  public._clean_name(text), public._random_sequence(int), public._session_json(public.experiment_sessions),
  public._participant_json(uuid), public._balanced_order(), public._finalise_session(uuid),
  public._issue_trial(uuid), public.prevent_completed_session_changes(), public.prevent_trial_changes()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Participant API (called by the Next.js server with the publishable key)
-- ---------------------------------------------------------------------
create or replace function public.check_name_available(p_first_name text, p_last_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_first text := public._clean_name(p_first_name); v_last text := public._clean_name(p_last_name);
begin
  return not exists (select 1 from public.participants
                      where lower(btrim(first_name)) = lower(v_first) and lower(btrim(last_name)) = lower(v_last));
end $$;

create or replace function public.register_participant(
  p_first_name text, p_last_name text,
  p_consent_participation boolean, p_consent_quiet_environment boolean, p_consent_guidelines boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_first text := public._clean_name(p_first_name);
  v_last text := public._clean_name(p_last_name);
  v_id uuid; v_code text; v_token text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if not (coalesce(p_consent_participation, false) and coalesce(p_consent_quiet_environment, false)
          and coalesce(p_consent_guidelines, false)) then
    raise exception 'CONSENT_REQUIRED';
  end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '') into v_code
      from generate_series(1, 6);
    exit when not exists (select 1 from public.participants where access_code = v_code);
  end loop;
  begin
    insert into public.participants(first_name, last_name, access_code, consent_participation,
      consent_quiet_environment, consent_guidelines, assigned_order)
    values (v_first, v_last, v_code, true, true, true, public._balanced_order())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'DUPLICATE_NAME';
  end;
  v_token := public._issue_token(v_id);
  return jsonb_build_object('token', v_token) || public._participant_json(v_id);
end $$;

create or replace function public.resume_participant(p_first_name text, p_last_name text, p_access_code text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.participants
   where lower(btrim(first_name)) = lower(public._clean_name(p_first_name))
     and lower(btrim(last_name)) = lower(public._clean_name(p_last_name))
     and access_code = upper(btrim(coalesce(p_access_code, '')));
  if v_id is null then
    perform pg_sleep(0.5); -- slow down guessing
    raise exception 'INVALID_ACCESS_CODE';
  end if;
  return jsonb_build_object('token', public._issue_token(v_id)) || public._participant_json(v_id);
end $$;

create or replace function public.get_participant_state(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  return public._participant_json(public._participant_from_token(p_token));
end $$;

create or replace function public.logout_participant(p_token text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from public.participant_tokens where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
end $$;

create or replace function public.start_break(p_token text, p_condition public.break_condition)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_pid uuid := public._participant_from_token(p_token); v_order int; v_now timestamptz := now(); s public.experiment_sessions;
begin
  if p_condition is null then raise exception 'INVALID_CONDITION'; end if;
  -- serialise per participant to avoid races between tabs/browsers
  perform 1 from public.participants where id = v_pid for update;
  if exists (select 1 from public.experiment_sessions where participant_id = v_pid and condition = p_condition) then
    raise exception 'CONDITION_ALREADY_DONE';
  end if;
  if exists (select 1 from public.experiment_sessions where participant_id = v_pid and status <> 'completed') then
    raise exception 'SESSION_IN_PROGRESS';
  end if;
  select count(*) + 1 into v_order from public.experiment_sessions where participant_id = v_pid;
  begin
    insert into public.experiment_sessions(participant_id, condition, condition_order, break_started_at, break_ends_at)
    values (v_pid, p_condition, v_order, v_now, v_now + interval '15 minutes')
    returning * into s;
  exception when unique_violation then
    raise exception 'CONDITION_ALREADY_DONE';
  end;
  insert into public.break_events(session_id, event_type, client_remaining_seconds) values (s.id, 'page_opened', 900);
  return jsonb_build_object('session', public._session_json(s), 'server_now', now());
end $$;

create or replace function public.get_session(p_token text, p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_pid uuid := public._participant_from_token(p_token); s public.experiment_sessions; v_trials jsonb;
begin
  select * into s from public.experiment_sessions where id = p_session and participant_id = v_pid;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status = 'completed' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'trial_number', t.trial_number, 'sequence_length', t.sequence_length,
             'attempt_at_length', t.attempt_at_length, 'sequence', to_jsonb(t.sequence),
             'response', to_jsonb(t.response), 'is_correct', t.is_correct,
             'response_time_ms', t.response_time_ms) order by t.trial_number), '[]'::jsonb)
      into v_trials from public.trial_results t where t.session_id = s.id;
  end if;
  return jsonb_build_object(
    'session', public._session_json(s),
    'trials', v_trials,
    'participant', (select jsonb_build_object('first_name', first_name, 'last_name', last_name)
                      from public.participants where id = v_pid),
    'server_now', now());
end $$;

create or replace function public.record_break_event(p_token text, p_session uuid, p_event text, p_remaining integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_pid uuid := public._participant_from_token(p_token); v_status text;
begin
  select status into v_status from public.experiment_sessions where id = p_session and participant_id = v_pid;
  if v_status is null then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_status <> 'break_in_progress' then return; end if;  -- only during the break
  if p_event not in ('page_opened', 'page_closed', 'tab_hidden', 'tab_visible') then raise exception 'INVALID_EVENT'; end if;
  insert into public.break_events(session_id, event_type, client_remaining_seconds)
  values (p_session, p_event, greatest(0, least(900, p_remaining)));
  if p_event = 'page_closed' then
    update public.experiment_sessions set break_interruptions = break_interruptions + 1 where id = p_session;
  end if;
end $$;

create or replace function public.complete_break(p_token text, p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_pid uuid := public._participant_from_token(p_token); s public.experiment_sessions; v_now timestamptz := now();
begin
  select * into s from public.experiment_sessions where id = p_session and participant_id = v_pid for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status = 'break_in_progress' then
    if v_now < s.break_ends_at then
      raise exception 'BREAK_NOT_FINISHED';
    end if;
    update public.experiment_sessions
       set status = 'awaiting_test', break_completed_at = v_now,
           actual_break_seconds = round(extract(epoch from (v_now - break_started_at))::numeric, 3)
     where id = p_session returning * into s;
  end if;
  return jsonb_build_object('session', public._session_json(s), 'server_now', now());
end $$;

-- Starts the test (first call) or resumes it; returns the trial to present.
create or replace function public.next_trial(p_token text, p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_pid uuid := public._participant_from_token(p_token); s public.experiment_sessions; v_now timestamptz := now();
begin
  select * into s from public.experiment_sessions where id = p_session and participant_id = v_pid for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status = 'completed' then raise exception 'TEST_ALREADY_COMPLETED'; end if;
  if s.status = 'break_in_progress' then
    if v_now < s.break_ends_at then raise exception 'BREAK_NOT_FINISHED'; end if;
    update public.experiment_sessions
       set status = 'awaiting_test', break_completed_at = v_now,
           actual_break_seconds = round(extract(epoch from (v_now - break_started_at))::numeric, 3)
     where id = p_session returning * into s;
  end if;
  if s.status = 'awaiting_test' then
    update public.experiment_sessions
       set status = 'test_in_progress', test_started_at = v_now, current_length = 2, failures_at_length = 0
     where id = p_session returning * into s;
  elsif s.pending_sequence is not null then
    -- a trial had been shown but never answered (reload / tab closed): log it and draw a fresh sequence
    update public.experiment_sessions set test_interruptions = test_interruptions + 1 where id = p_session;
  end if;
  return jsonb_build_object('finished', false, 'trial', public._issue_trial(p_session),
                            'test_started_at', s.test_started_at);
end $$;

create or replace function public.submit_trial(p_token text, p_session uuid, p_response integer[], p_response_time_ms integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_pid uuid := public._participant_from_token(p_token);
  s public.experiment_sessions; v_correct boolean; v_trial int; v_finished boolean := false; v_resp smallint[];
begin
  select * into s from public.experiment_sessions where id = p_session and participant_id = v_pid for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status = 'completed' then raise exception 'TEST_ALREADY_COMPLETED'; end if;
  if s.status <> 'test_in_progress' or s.pending_sequence is null then raise exception 'NO_PENDING_TRIAL'; end if;
  if p_response is null or cardinality(p_response) <> cardinality(s.pending_sequence)
     or exists (select 1 from unnest(p_response) r where r is null or r < 0 or r > 8) then
    raise exception 'INVALID_RESPONSE';
  end if;
  v_resp := p_response::smallint[];
  v_correct := v_resp = s.pending_sequence;
  select count(*) + 1 into v_trial from public.trial_results where session_id = p_session;

  insert into public.trial_results(session_id, trial_number, sequence_length, attempt_at_length, sequence,
    response, is_correct, response_time_ms, presented_at)
  values (p_session, v_trial, s.current_length, s.failures_at_length + 1, s.pending_sequence, v_resp, v_correct,
    case when p_response_time_ms between 0 and 600000 then p_response_time_ms end, s.pending_issued_at);

  if v_correct then
    if s.current_length >= 9 then
      v_finished := true;
    else
      update public.experiment_sessions set current_length = current_length + 1, failures_at_length = 0,
        pending_sequence = null, pending_issued_at = null where id = p_session;
    end if;
  else
    if s.failures_at_length + 1 >= 2 then
      v_finished := true;   -- stopping rule: two failed attempts at the same length
    else
      update public.experiment_sessions set failures_at_length = failures_at_length + 1,
        pending_sequence = null, pending_issued_at = null where id = p_session;
    end if;
  end if;

  if v_finished then
    perform public._finalise_session(p_session);
    select * into s from public.experiment_sessions where id = p_session;
    return jsonb_build_object('correct', v_correct, 'finished', true, 'session', public._session_json(s));
  end if;
  return jsonb_build_object('correct', v_correct, 'finished', false, 'trial', public._issue_trial(p_session));
end $$;

-- Anonymised, aggregated data for the public results dashboard.
create or replace function public.get_public_results()
returns jsonb language sql stable security definer set search_path = '' as $$
  with labelled as (
    select p.id, 'P' || lpad(row_number() over (order by p.created_at)::text, 2, '0') as label
    from public.participants p
  )
  select jsonb_build_object(
    'total_participants', (select count(*) from public.participants),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant', l.label, 'condition', s.condition, 'condition_order', s.condition_order,
        'corsi_span', s.corsi_span, 'accuracy', s.accuracy, 'correct_trials', s.correct_trials,
        'total_attempts', s.total_attempts, 'completed_at', s.test_completed_at)
        order by l.label, s.condition_order)
      from public.experiment_sessions s join labelled l on l.id = s.participant_id
      where s.status = 'completed'), '[]'::jsonb),
    'generated_at', now());
$$;

revoke all on function public.check_name_available(text, text), public.register_participant(text, text, boolean, boolean, boolean),
  public.resume_participant(text, text, text), public.get_participant_state(text), public.logout_participant(text),
  public.start_break(text, public.break_condition), public.get_session(text, uuid),
  public.record_break_event(text, uuid, text, integer), public.complete_break(text, uuid),
  public.next_trial(text, uuid), public.submit_trial(text, uuid, integer[], integer), public.get_public_results()
  from public;
grant execute on function public.check_name_available(text, text), public.register_participant(text, text, boolean, boolean, boolean),
  public.resume_participant(text, text, text), public.get_participant_state(text), public.logout_participant(text),
  public.start_break(text, public.break_condition), public.get_session(text, uuid),
  public.record_break_event(text, uuid, text, integer), public.complete_break(text, uuid),
  public.next_trial(text, uuid), public.submit_trial(text, uuid, integer[], integer), public.get_public_results()
  to anon, authenticated;
