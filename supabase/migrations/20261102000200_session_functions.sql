-- Timer lifecycle RPCs and visibility helpers.
--
-- Every timer transition uses the database clock (now()), so device clock
-- skew cannot inflate durations. Each call returns the session together with
-- `server_now` so clients can compute a clock offset for display.
--
-- Errors are raised with stable machine-readable messages that the client
-- maps to friendly text:
--   not_authenticated, subject_not_found, goal_not_found,
--   active_session_exists, session_not_found, session_not_active,
--   session_already_completed, session_id_conflict

create or replace function public.session_payload(p_session public.study_sessions)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'session', case when p_session.id is null then null else to_jsonb(p_session) end,
    'server_now', now()
  );
$$;

create or replace function public.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

-- Clamp a client-reported instant into [lower_bound, now()]. Used so a retried
-- pause/finish can record the moment the user actually tapped the button,
-- while never moving time backwards past the segment start or into the future.
create or replace function public.clamp_instant(p_at timestamptz, p_lower timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(p_lower, least(coalesce(p_at, now()), now()));
$$;

-- ---------------------------------------------------------------------------
-- get_active_session: the caller's running/paused session (or null)
-- ---------------------------------------------------------------------------
create or replace function public.get_active_session()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_session public.study_sessions;
begin
  select * into v_session
    from public.study_sessions
   where user_id = v_uid and status = 'active';
  return public.session_payload(v_session);
end;
$$;

-- ---------------------------------------------------------------------------
-- start_session: idempotent on p_session_id (client-generated per attempt)
-- ---------------------------------------------------------------------------
create or replace function public.start_session(
  p_session_id uuid,
  p_subject_id uuid,
  p_intention text default null,
  p_goal_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_subject public.subjects;
  v_session public.study_sessions;
  v_intention text := nullif(btrim(coalesce(p_intention, '')), '');
begin
  if p_session_id is null then
    raise exception 'session_id_required' using errcode = '22004';
  end if;

  -- A retry of a request that already succeeded returns the same session.
  select * into v_session from public.study_sessions where id = p_session_id;
  if found then
    if v_session.user_id <> v_uid then
      raise exception 'session_id_conflict' using errcode = 'P0001';
    end if;
    return public.session_payload(v_session);
  end if;

  select * into v_subject
    from public.subjects
   where id = p_subject_id and user_id = v_uid and archived_at is null;
  if not found then
    raise exception 'subject_not_found' using errcode = 'P0002';
  end if;

  if p_goal_id is not null and not exists (
    select 1 from public.goals
     where id = p_goal_id and user_id = v_uid and archived_at is null
  ) then
    raise exception 'goal_not_found' using errcode = 'P0002';
  end if;

  if v_intention is not null and char_length(v_intention) > 280 then
    raise exception 'intention_too_long' using errcode = '22001';
  end if;

  begin
    insert into public.study_sessions (
      id, user_id, subject_id, subject_name, subject_color, goal_id,
      intention, status, timer_state, started_at, running_since, accumulated_ms
    ) values (
      p_session_id, v_uid, v_subject.id, v_subject.name, v_subject.color, p_goal_id,
      v_intention, 'active', 'running', now(), now(), 0
    )
    returning * into v_session;
  exception when unique_violation then
    -- Either a concurrent retry with the same id won the race, or another
    -- device already has an active session.
    select * into v_session from public.study_sessions where id = p_session_id and user_id = v_uid;
    if found then
      return public.session_payload(v_session);
    end if;
    raise exception 'active_session_exists' using errcode = 'P0001';
  end;

  return public.session_payload(v_session);
end;
$$;

-- Lock and return the caller's session, raising if it does not exist.
create or replace function public.lock_own_session(p_session_id uuid, p_uid uuid)
returns public.study_sessions
language plpgsql
set search_path = ''
as $$
declare
  v_session public.study_sessions;
begin
  select * into v_session
    from public.study_sessions
   where id = p_session_id and user_id = p_uid
   for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- pause_session: idempotent; p_at = when the user tapped pause (optional)
-- ---------------------------------------------------------------------------
create or replace function public.pause_session(p_session_id uuid, p_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_session public.study_sessions;
  v_at timestamptz;
begin
  v_session := public.lock_own_session(p_session_id, v_uid);

  if v_session.status <> 'active' then
    raise exception 'session_not_active' using errcode = 'P0001';
  end if;
  if v_session.timer_state = 'paused' then
    return public.session_payload(v_session);
  end if;

  v_at := public.clamp_instant(p_at, v_session.running_since);

  update public.study_sessions
     set accumulated_ms = accumulated_ms
           + floor(extract(epoch from (v_at - running_since)) * 1000)::bigint,
         running_since = null,
         timer_state = 'paused'
   where id = v_session.id
  returning * into v_session;

  return public.session_payload(v_session);
end;
$$;

-- ---------------------------------------------------------------------------
-- resume_session: idempotent
-- ---------------------------------------------------------------------------
create or replace function public.resume_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_session public.study_sessions;
begin
  v_session := public.lock_own_session(p_session_id, v_uid);

  if v_session.status <> 'active' then
    raise exception 'session_not_active' using errcode = 'P0001';
  end if;
  if v_session.timer_state = 'running' then
    return public.session_payload(v_session);
  end if;

  update public.study_sessions
     set running_since = now(),
         timer_state = 'running'
   where id = v_session.id
  returning * into v_session;

  return public.session_payload(v_session);
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_session: idempotent completion. A second call (retry, double tap,
-- second device) returns the already-completed session unchanged.
-- The session is saved privately; sharing is an explicit later step.
-- ---------------------------------------------------------------------------
create or replace function public.finish_session(p_session_id uuid, p_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_session public.study_sessions;
  v_end timestamptz;
  v_total_ms bigint;
begin
  v_session := public.lock_own_session(p_session_id, v_uid);

  if v_session.status = 'completed' then
    return public.session_payload(v_session);
  end if;

  if v_session.timer_state = 'running' then
    v_end := public.clamp_instant(p_at, v_session.running_since);
    v_total_ms := v_session.accumulated_ms
      + floor(extract(epoch from (v_end - v_session.running_since)) * 1000)::bigint;
  else
    v_end := public.clamp_instant(p_at, v_session.started_at);
    v_total_ms := v_session.accumulated_ms;
  end if;

  update public.study_sessions
     set status = 'completed',
         timer_state = null,
         running_since = null,
         accumulated_ms = v_total_ms,
         ended_at = v_end,
         completed_at = now(),
         -- Sessions are capped at 24h of active time.
         duration_seconds = least(round(v_total_ms / 1000.0)::integer, 86400),
         title = coalesce(title, left(subject_name, 60) || ' session'),
         visibility = 'private'
   where id = v_session.id
  returning * into v_session;

  return public.session_payload(v_session);
end;
$$;

-- ---------------------------------------------------------------------------
-- discard_session: deletes an *active* session only (never a completed one,
-- so a stale discard from another device cannot destroy a finished session).
-- ---------------------------------------------------------------------------
create or replace function public.discard_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_session public.study_sessions;
begin
  select * into v_session
    from public.study_sessions
   where id = p_session_id and user_id = v_uid
   for update;

  if not found then
    -- Already discarded: idempotent success.
    return jsonb_build_object('discarded', true, 'server_now', now());
  end if;
  if v_session.status = 'completed' then
    raise exception 'session_already_completed' using errcode = 'P0001';
  end if;

  delete from public.study_sessions where id = v_session.id;
  return jsonb_build_object('discarded', true, 'server_now', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Visibility helpers used by RLS policies on likes, comments and storage.
-- A completed session is visible to its owner, and to followers of the owner
-- when shared with followers. Active sessions are never visible to others.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.study_sessions s
     where s.id = p_session_id
       and s.status = 'completed'
       and (
         s.user_id = (select auth.uid())
         or (
           s.visibility = 'followers'
           and exists (
             select 1 from public.follows f
              where f.follower_id = (select auth.uid())
                and f.following_id = s.user_id
           )
         )
       )
  );
$$;

create or replace function public.can_view_session_photo(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.study_sessions s
     where s.photo_path = p_object_name
       and public.can_view_session(s.id)
  );
$$;

-- Upload path must be <uid>/<session id>/<uuid>.<ext> for a completed session
-- the caller owns.
create or replace function public.can_upload_session_photo(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_object_name, '/');
begin
  if array_length(v_parts, 1) <> 3
     or v_parts[1] <> (select auth.uid())::text
     or v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_parts[3] !~ '^[0-9a-f-]{36}\.(jpg|png|webp)$' then
    return false;
  end if;
  return exists (
    select 1 from public.study_sessions s
     where s.id = v_parts[2]::uuid
       and s.user_id = (select auth.uid())
       and s.status = 'completed'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- search_profiles: username / display-name search for signed-in users.
-- LIKE wildcards in the query are escaped.
-- ---------------------------------------------------------------------------
create or replace function public.search_profiles(p_query text, p_limit integer default 20)
returns setof public.profiles
language sql
stable
set search_path = ''
as $$
  with q as (
    select replace(replace(replace(lower(btrim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') as pattern,
           lower(btrim(coalesce(p_query, ''))) as raw
  )
  select p.*
    from public.profiles p, q
   where char_length(q.raw) >= 1
     and p.id <> (select auth.uid())
     and (p.username like '%' || q.pattern || '%' or lower(p.display_name) like '%' || q.pattern || '%')
   order by (p.username = q.raw) desc,
            (p.username like q.pattern || '%') desc,
            p.username
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
