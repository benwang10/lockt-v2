-- Profile highlight statistic: the owner picks one stat to feature on their
-- profile header. Values are computed on request by get_profile_highlight(),
-- which only ever aggregates rows the CALLER can already read:
--
--   * Owner viewing self: every completed session (private + shared) and the
--     milestone goals they marked completed.
--   * A follower: only sessions currently shared with followers. Milestone
--     wins are never shown to others (goals are private).
--   * Anyone else: nothing (null).
--
-- The function is SECURITY INVOKER, so Row Level Security still applies to
-- every table it reads; the explicit filters below are a second layer, not
-- the only one. Existing profiles default to 'hours_week'.

create type public.profile_highlight as enum (
  'wins_week', 'sessions_week', 'hours_week', 'hours_lifetime', 'hidden'
);

alter table public.profiles
  add column highlight_stat public.profile_highlight not null default 'hours_week';

grant update (highlight_stat) on public.profiles to authenticated;

-- Milestone wins are looked up by completion time.
create index goals_user_completed_idx on public.goals (user_id, completed_at)
  where kind = 'milestone' and completed_at is not null;

-- p_week_start / p_week_end: the viewer's current calendar week (Monday 00:00
-- local → next Monday 00:00 local), computed on the device exactly like the
-- Progress screen. The range is validated to look like one week (DST weeks
-- are 167 or 169 hours).
create or replace function public.get_profile_highlight(
  p_user_id uuid,
  p_week_start timestamptz,
  p_week_end timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_kind public.profile_highlight;
  v_is_owner boolean;
  v_value bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  v_is_owner := (p_user_id = v_uid);
  if p_week_start is null or p_week_end is null
     or p_week_end <= p_week_start
     or p_week_end - p_week_start > interval '170 hours'
     or p_week_end - p_week_start < interval '166 hours' then
    raise exception 'invalid_week_range' using errcode = '22023';
  end if;

  select highlight_stat into v_kind from public.profiles where id = p_user_id;
  if not found or v_kind = 'hidden' then
    return null;
  end if;

  if not v_is_owner then
    -- Non-followers get nothing; wins are owner-only.
    if v_kind = 'wins_week' or not exists (
      select 1 from public.follows f where f.follower_id = v_uid and f.following_id = p_user_id
    ) then
      return null;
    end if;
  end if;

  if v_kind = 'wins_week' then
    select count(*) into v_value
      from public.goals g
     where g.user_id = v_uid -- owner only (checked above)
       and g.kind = 'milestone'
       and g.archived_at is null
       and g.completed_at >= p_week_start
       and g.completed_at < p_week_end;
  elsif v_kind = 'sessions_week' then
    select count(*) into v_value
      from public.study_sessions s
     where s.user_id = p_user_id
       and s.status = 'completed'
       and (v_is_owner or s.visibility = 'followers')
       and s.started_at >= p_week_start
       and s.started_at < p_week_end;
  elsif v_kind = 'hours_week' then
    select coalesce(sum(s.duration_seconds), 0) into v_value
      from public.study_sessions s
     where s.user_id = p_user_id
       and s.status = 'completed'
       and (v_is_owner or s.visibility = 'followers')
       and s.started_at >= p_week_start
       and s.started_at < p_week_end;
  else -- hours_lifetime
    select coalesce(sum(s.duration_seconds), 0) into v_value
      from public.study_sessions s
     where s.user_id = p_user_id
       and s.status = 'completed'
       and (v_is_owner or s.visibility = 'followers');
  end if;

  return jsonb_build_object(
    'kind', v_kind,
    -- seconds for hours_*, a count for wins/sessions
    'value', v_value,
    'scope', case when v_is_owner then 'all' else 'shared' end
  );
end;
$$;

revoke execute on function public.get_profile_highlight(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_profile_highlight(uuid, timestamptz, timestamptz) to authenticated;
