-- =====================================================================
-- Admin test mode
-- =====================================================================
-- Researchers enter a secret admin code to get a throw-away *test*
-- participant (no registration/consent), can skip the 15-minute break and
-- redo any condition. Everything created this way is flagged is_test and is
-- excluded from the public results, charts, statistics and CSV exports.
--
-- The code itself is NOT stored in this file (the repo is public). Only a
-- bcrypt hash lives in public.app_secrets. Set or change it with:
--   insert into public.app_secrets(key, value_hash)
--   values ('admin_test_code', extensions.crypt('<code>', extensions.gen_salt('bf')))
--   on conflict (key) do update set value_hash = excluded.value_hash;
-- =====================================================================

alter table public.participants add column is_test boolean not null default false;
alter table public.experiment_sessions add column is_test boolean not null default false;
alter table public.experiment_sessions add column break_skipped boolean not null default false;

-- Real sessions keep every rule; test sessions may skip the break and use extra order slots.
alter table public.experiment_sessions drop constraint break_completed_after_end;
alter table public.experiment_sessions add constraint break_completed_after_end
  check (is_test or break_completed_at is null or break_completed_at >= break_ends_at);
alter table public.experiment_sessions drop constraint experiment_sessions_condition_order_check;
alter table public.experiment_sessions add constraint condition_order_range
  check (condition_order >= 1 and (is_test or condition_order <= 3));
alter table public.experiment_sessions add constraint skip_only_in_test
  check (not break_skipped or is_test);

create table public.app_secrets (
  key text primary key,
  value_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- Completed REAL results stay locked; test rows may be removed when a condition is redone.
create or replace function public.prevent_completed_session_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'completed' and not old.is_test then
      raise exception 'RESULTS_LOCKED' using hint = 'Completed sessions cannot be deleted.';
    end if;
    return old;
  end if;
  if old.status = 'completed' then
    raise exception 'RESULTS_LOCKED' using hint = 'Completed sessions cannot be modified.';
  end if;
  if new.participant_id <> old.participant_id or new.condition <> old.condition
     or new.break_started_at <> old.break_started_at or new.break_ends_at <> old.break_ends_at
     or new.is_test <> old.is_test then
    raise exception 'IMMUTABLE_FIELD';
  end if;
  return new;
end $$;

create or replace function public.prevent_trial_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1 from public.experiment_sessions s where s.id = old.session_id and s.is_test) then
    return old;
  end if;
  raise exception 'RESULTS_LOCKED' using hint = 'Trial results cannot be modified or deleted.';
end $$;

-- ---------------------------------------------------------------------
-- JSON helpers now expose the test flags
-- ---------------------------------------------------------------------
create or replace function public._session_json(s public.experiment_sessions)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id,
    'condition', s.condition,
    'condition_order', s.condition_order,
    'status', s.status,
    'is_test', s.is_test,
    'break_skipped', s.break_skipped,
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
      'is_test', p.is_test,
      'experiment_completed', p.experiment_completed,
      'experiment_completed_at', p.experiment_completed_at, 'created_at', p.created_at),
    'sessions', coalesce((select jsonb_agg(public._session_json(s) order by s.condition_order)
                          from public.experiment_sessions s where s.participant_id = p.id), '[]'::jsonb),
    'server_now', now())
  from public.participants p where p.id = p_id;
$$;

-- Counterbalancing ignores test participants.
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
  order by (select count(*) from public.participants p where p.assigned_order = perms.ord and not p.is_test), random()
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- Test-mode API
-- ---------------------------------------------------------------------
create or replace function public.start_test_mode(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_hash text; v_id uuid; v_n int; v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select value_hash into v_hash from public.app_secrets where key = 'admin_test_code';
  if v_hash is null or p_code is null or extensions.crypt(p_code, v_hash) <> v_hash then
    perform pg_sleep(1);  -- slow down guessing
    raise exception 'INVALID_ADMIN_CODE';
  end if;
  select count(*) + 1 into v_n from public.participants where is_test;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '') into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.participants where access_code = v_code);
  end loop;
  loop
    begin
      insert into public.participants(first_name, last_name, access_code, consent_participation,
        consent_quiet_environment, consent_guidelines, assigned_order, is_test)
      values ('Admin', 'Test ' || lpad(v_n::text, 3, '0'), v_code, true, true, true,
        array['video_game','youtube','no_screen']::public.break_condition[], true)
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_n := v_n + 1;
    end;
  end loop;
  return jsonb_build_object('token', public._issue_token(v_id)) || public._participant_json(v_id);
end $$;

create or replace function public.start_break(p_token text, p_condition public.break_condition)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_pid uuid := public._participant_from_token(p_token); v_order int; v_now timestamptz := now();
  v_test boolean; s public.experiment_sessions;
begin
  if p_condition is null then raise exception 'INVALID_CONDITION'; end if;
  select is_test into v_test from public.participants where id = v_pid for update;
  if exists (select 1 from public.experiment_sessions where participant_id = v_pid and condition = p_condition) then
    raise exception 'CONDITION_ALREADY_DONE';
  end if;
  if exists (select 1 from public.experiment_sessions where participant_id = v_pid and status <> 'completed') then
    raise exception 'SESSION_IN_PROGRESS';
  end if;
  if v_test then
    select coalesce(max(condition_order), 0) + 1 into v_order from public.experiment_sessions where participant_id = v_pid;
  else
    select count(*) + 1 into v_order from public.experiment_sessions where participant_id = v_pid;
  end if;
  begin
    insert into public.experiment_sessions(participant_id, condition, condition_order, break_started_at, break_ends_at, is_test)
    values (v_pid, p_condition, v_order, v_now, v_now + interval '15 minutes', v_test)
    returning * into s;
  exception when unique_violation then
    raise exception 'CONDITION_ALREADY_DONE';
  end;
  insert into public.break_events(session_id, event_type, client_remaining_seconds) values (s.id, 'page_opened', 900);
  return jsonb_build_object('session', public._session_json(s), 'server_now', now());
end $$;

create or replace function public.skip_break(p_token text, p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_pid uuid := public._participant_from_token(p_token); s public.experiment_sessions; v_now timestamptz := now();
begin
  select * into s from public.experiment_sessions where id = p_session and participant_id = v_pid for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not s.is_test then raise exception 'TEST_MODE_ONLY'; end if;
  if s.status = 'break_in_progress' then
    update public.experiment_sessions
       set status = 'awaiting_test', break_completed_at = v_now, break_skipped = true,
           actual_break_seconds = round(extract(epoch from (v_now - break_started_at))::numeric, 3)
     where id = p_session returning * into s;
  end if;
  return jsonb_build_object('session', public._session_json(s), 'server_now', now());
end $$;

create or replace function public.reset_test_condition(p_token text, p_condition public.break_condition)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_pid uuid := public._participant_from_token(p_token); v_test boolean; v_sid uuid;
begin
  select is_test into v_test from public.participants where id = v_pid for update;
  if not v_test then raise exception 'TEST_MODE_ONLY'; end if;
  select id into v_sid from public.experiment_sessions where participant_id = v_pid and condition = p_condition;
  if v_sid is not null then
    delete from public.trial_results where session_id = v_sid;
    delete from public.break_events where session_id = v_sid;
    delete from public.experiment_sessions where id = v_sid;
  end if;
  update public.participants set experiment_completed = false, experiment_completed_at = null where id = v_pid;
  return public._participant_json(v_pid);
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
    'participant', (select jsonb_build_object('first_name', first_name, 'last_name', last_name, 'is_test', is_test)
                      from public.participants where id = v_pid),
    'server_now', now());
end $$;

-- Public results: real participants only.
create or replace function public.get_public_results()
returns jsonb language sql stable security definer set search_path = '' as $$
  with labelled as (
    select p.id, 'P' || lpad(row_number() over (order by p.created_at)::text, 2, '0') as label
    from public.participants p where not p.is_test
  )
  select jsonb_build_object(
    'total_participants', (select count(*) from public.participants where not is_test),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant', l.label, 'condition', s.condition, 'condition_order', s.condition_order,
        'corsi_span', s.corsi_span, 'accuracy', s.accuracy, 'correct_trials', s.correct_trials,
        'total_attempts', s.total_attempts, 'completed_at', s.test_completed_at)
        order by l.label, s.condition_order)
      from public.experiment_sessions s join labelled l on l.id = s.participant_id
      where s.status = 'completed' and not s.is_test), '[]'::jsonb),
    'generated_at', now());
$$;

revoke all on function public.start_test_mode(text), public.skip_break(text, uuid),
  public.reset_test_condition(text, public.break_condition) from public;
grant execute on function public.start_test_mode(text), public.skip_break(text, uuid),
  public.reset_test_condition(text, public.break_condition) to anon, authenticated;
revoke all on function public.prevent_completed_session_changes(), public.prevent_trial_changes(),
  public._session_json(public.experiment_sessions), public._participant_json(uuid), public._balanced_order()
  from public, anon, authenticated;

-- =====================================================================
-- Administrator deletions (participants or single attempts)
-- =====================================================================
-- Completed results are locked against everyone else. Signed-in admins may
-- delete through these functions only; each deletion is written to an audit
-- log with a JSON copy of what was removed.

create table public.deletion_log (
  id bigint generated always as identity primary key,
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  deleted_by_email text,
  kind text not null check (kind in ('participant', 'session')),
  target_id uuid not null,
  summary text,
  snapshot jsonb not null
);
alter table public.deletion_log enable row level security;
revoke all on public.deletion_log from anon, authenticated;
grant select on public.deletion_log to authenticated;
create policy "admins read deletion log" on public.deletion_log
  for select to authenticated using ((select public.is_admin()));

create or replace function public.prevent_completed_session_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'completed' and not old.is_test
       and coalesce(current_setting('corsi.admin_delete', true), '') <> 'on' then
      raise exception 'RESULTS_LOCKED' using hint = 'Completed sessions cannot be deleted.';
    end if;
    return old;
  end if;
  if old.status = 'completed' then
    raise exception 'RESULTS_LOCKED' using hint = 'Completed sessions cannot be modified.';
  end if;
  if new.participant_id <> old.participant_id or new.condition <> old.condition
     or new.break_started_at <> old.break_started_at or new.break_ends_at <> old.break_ends_at
     or new.is_test <> old.is_test then
    raise exception 'IMMUTABLE_FIELD';
  end if;
  return new;
end $$;

create or replace function public.prevent_trial_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and (
       coalesce(current_setting('corsi.admin_delete', true), '') = 'on'
       or exists (select 1 from public.experiment_sessions s where s.id = old.session_id and s.is_test)) then
    return old;
  end if;
  raise exception 'RESULTS_LOCKED' using hint = 'Trial results cannot be modified or deleted.';
end $$;

create or replace function public._admin_delete_session(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.trial_results where session_id = p_session;
  delete from public.break_events where session_id = p_session;
  delete from public.experiment_sessions where id = p_session;
end $$;
revoke all on function public._admin_delete_session(uuid) from public, anon, authenticated;

create or replace function public.admin_delete_session(p_session uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare s public.experiment_sessions; v_snapshot jsonb; v_name text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select * into s from public.experiment_sessions where id = p_session for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  select first_name || ' ' || last_name into v_name from public.participants where id = s.participant_id;
  v_snapshot := jsonb_build_object('session', to_jsonb(s),
    'trials', coalesce((select jsonb_agg(to_jsonb(t)) from public.trial_results t where t.session_id = p_session), '[]'::jsonb));
  perform set_config('corsi.admin_delete', 'on', true);
  perform public._admin_delete_session(p_session);
  perform set_config('corsi.admin_delete', 'off', true);
  update public.participants set experiment_completed = false, experiment_completed_at = null
   where id = s.participant_id;
  insert into public.deletion_log(deleted_by, deleted_by_email, kind, target_id, summary, snapshot)
  values (auth.uid(), auth.jwt() ->> 'email', 'session', p_session,
          coalesce(v_name, '?') || ' · ' || s.condition || ' · span ' || coalesce(s.corsi_span::text, '—'), v_snapshot);
end $$;

create or replace function public.admin_delete_participant(p_participant uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare p public.participants; v_snapshot jsonb; v_sid uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select * into p from public.participants where id = p_participant for update;
  if not found then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  v_snapshot := jsonb_build_object('participant', to_jsonb(p) - 'access_code',
    'sessions', coalesce((select jsonb_agg(to_jsonb(s)) from public.experiment_sessions s where s.participant_id = p_participant), '[]'::jsonb),
    'trials', coalesce((select jsonb_agg(to_jsonb(t)) from public.trial_results t
                         join public.experiment_sessions s on s.id = t.session_id
                        where s.participant_id = p_participant), '[]'::jsonb));
  perform set_config('corsi.admin_delete', 'on', true);
  for v_sid in select id from public.experiment_sessions where participant_id = p_participant loop
    perform public._admin_delete_session(v_sid);
  end loop;
  perform set_config('corsi.admin_delete', 'off', true);
  delete from public.participant_tokens where participant_id = p_participant;
  delete from public.participants where id = p_participant;
  insert into public.deletion_log(deleted_by, deleted_by_email, kind, target_id, summary, snapshot)
  values (auth.uid(), auth.jwt() ->> 'email', 'participant', p_participant,
          p.first_name || ' ' || p.last_name || case when p.is_test then ' (test)' else '' end, v_snapshot);
end $$;

revoke all on function public.admin_delete_session(uuid), public.admin_delete_participant(uuid) from public, anon;
grant execute on function public.admin_delete_session(uuid), public.admin_delete_participant(uuid) to authenticated;
