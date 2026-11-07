-- v2.5 beta: in-app "Send feedback".
--
-- * Feedback is written ONLY through submit_feedback() (SECURITY DEFINER),
--   which stamps the caller's id and the database clock. Clients have no
--   table privileges at all: nobody can read feedback through the API,
--   including their own, and nobody can edit or delete it.
-- * The project owner reviews submissions in the Supabase dashboard (Table
--   Editor or SQL Editor run as the postgres role, which bypasses RLS).
-- * Only what the user typed plus app version and platform is stored; no
--   session content, email address or device identifiers.
-- * A light rate limit (20 per hour per account) keeps a stuck client or
--   a script from flooding the table.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  message text not null,
  app_version text,
  platform text,
  created_at timestamptz not null default now(),
  constraint feedback_category check (category in ('bug', 'suggestion', 'other')),
  constraint feedback_message_length check (char_length(message) between 1 and 2000),
  constraint feedback_app_version_length check (app_version is null or char_length(app_version) <= 32),
  constraint feedback_platform check (platform is null or platform in ('ios', 'android', 'web', 'other'))
);

create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_user_created_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;
-- No policies and no grants: the API roles can neither read nor write the table directly.
revoke all on public.feedback from public, anon, authenticated;

create or replace function public.submit_feedback(
  p_category text,
  p_message text,
  p_app_version text default null,
  p_platform text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_message text := btrim(coalesce(p_message, ''));
  v_recent integer;
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'profile_required' using errcode = '42501';
  end if;
  if p_category is null or p_category not in ('bug', 'suggestion', 'other') then
    raise exception 'feedback_invalid_category' using errcode = '22023';
  end if;
  if char_length(v_message) = 0 then
    raise exception 'feedback_empty' using errcode = '22023';
  end if;
  if char_length(v_message) > 2000 then
    raise exception 'feedback_too_long' using errcode = '22001';
  end if;
  select count(*) into v_recent
    from public.feedback f
   where f.user_id = v_uid and f.created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'feedback_rate_limited' using errcode = '54000';
  end if;
  insert into public.feedback (user_id, category, message, app_version, platform)
  values (
    v_uid,
    p_category,
    v_message,
    nullif(left(btrim(coalesce(p_app_version, '')), 32), ''),
    case when p_platform in ('ios', 'android', 'web') then p_platform else 'other' end
  );
end;
$$;

revoke execute on function public.submit_feedback(text, text, text, text) from public, anon;
grant execute on function public.submit_feedback(text, text, text, text) to authenticated;
