-- Short profile statuses ("notes"): an optional emoji plus a short note,
-- one active status per user, expiring 24 hours after the latest save.
--
-- * Written only through set_status() / clear_status(), which use the
--   database clock for updated_at / expires_at (clients can't extend expiry).
-- * Readable by the owner and the owner's FOLLOWERS while unexpired.
--   Finding someone in search grants nothing: access is the follow graph.
-- * Expired rows are invisible to every query (RLS), so they disappear from
--   the UI without a cleanup job; the next save overwrites the row.

create table public.profile_statuses (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  emoji text,
  body text,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint profile_statuses_body_length check (body is null or char_length(body) between 1 and 100),
  -- A single emoji (including ZWJ / skin-tone / flag sequences): no letters,
  -- digits or whitespace, and short.
  constraint profile_statuses_emoji_format check (
    emoji is null or (char_length(emoji) between 1 and 16 and emoji !~ '[[:alnum:][:space:]]')
  ),
  constraint profile_statuses_not_empty check (emoji is not null or body is not null),
  constraint profile_statuses_expiry check (expires_at > updated_at)
);

create index profile_statuses_expires_idx on public.profile_statuses (expires_at);

alter table public.profile_statuses enable row level security;
revoke all on public.profile_statuses from anon, authenticated;
grant select on public.profile_statuses to authenticated;

create policy "Owner and followers read unexpired statuses"
  on public.profile_statuses for select to authenticated
  using (
    expires_at > now()
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.follows f
         where f.follower_id = (select auth.uid())
           and f.following_id = profile_statuses.user_id
      )
    )
  );

-- Create or replace the caller's status. Expires 24 h after this save.
create or replace function public.set_status(p_emoji text, p_body text)
returns public.profile_statuses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_row public.profile_statuses;
begin
  if v_body is not null and char_length(v_body) > 100 then
    raise exception 'status_too_long' using errcode = '22001';
  end if;
  if v_emoji is null and v_body is null then
    raise exception 'status_empty' using errcode = '22023';
  end if;
  insert into public.profile_statuses (user_id, emoji, body, updated_at, expires_at)
  values (v_uid, v_emoji, v_body, now(), now() + interval '24 hours')
  on conflict (user_id) do update
    set emoji = excluded.emoji,
        body = excluded.body,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.clear_status()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
begin
  delete from public.profile_statuses where user_id = v_uid;
end;
$$;

revoke execute on function public.set_status(text, text), public.clear_status() from public, anon;
grant execute on function public.set_status(text, text), public.clear_status() to authenticated;
