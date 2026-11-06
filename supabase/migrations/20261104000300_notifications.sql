-- In-app notifications (no push / device tokens).
--
-- * Rows are created ONLY by trusted database triggers (SECURITY DEFINER)
--   reacting to real events (follow, like, comment, study-buddy invitation
--   and acceptance). Clients have no INSERT/DELETE privilege, so they can't
--   fabricate events.
-- * Self-actions never notify (liking/commenting on your own session).
-- * `dedupe_key` is unique per recipient, so retried operations can never
--   create duplicates.
-- * Undoing the action removes its notification (unlike, unfollow, comment
--   or session deletion via ON DELETE CASCADE).
-- * Notifications store references, never copies of content. They are read
--   through list_notifications(), a SECURITY INVOKER function, so post
--   titles and comment excerpts are only returned while the reader can still
--   see that session under the normal RLS rules; otherwise the target comes
--   back as null and the client shows a neutral "no longer available" item.
--   (list_notifications() is created in 20261104000500.)

create type public.notification_kind as enum ('follow', 'like', 'comment', 'buddy_invite', 'buddy_accepted');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  session_id uuid references public.study_sessions (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  -- Study-buddy invitation this item is about (FK added with that table).
  invite_id uuid,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_not_self check (recipient_id <> actor_id),
  constraint notifications_dedupe unique (recipient_id, dedupe_key)
);

create index notifications_recipient_feed_idx on public.notifications (recipient_id, created_at desc, id desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_session_idx on public.notifications (session_id) where session_id is not null;
create index notifications_comment_idx on public.notifications (comment_id) where comment_id is not null;
create index notifications_actor_idx on public.notifications (actor_id);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "Recipients read their notifications"
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy "Recipients mark their notifications read"
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Internal helper used by triggers. Not callable by clients.
-- ---------------------------------------------------------------------------
create or replace function public.notify(
  p_recipient uuid,
  p_actor uuid,
  p_kind public.notification_kind,
  p_dedupe_key text,
  p_session uuid default null,
  p_comment uuid default null,
  p_invite uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or p_actor is null or p_recipient = p_actor then
    return;
  end if;
  insert into public.notifications (recipient_id, actor_id, kind, session_id, comment_id, invite_id, dedupe_key)
  values (p_recipient, p_actor, p_kind, p_session, p_comment, p_invite, p_dedupe_key)
  on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Event triggers
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.following_id, new.follower_id, 'follow', 'follow:' || new.follower_id);
    return null;
  end if;
  delete from public.notifications
   where recipient_id = old.following_id and dedupe_key = 'follow:' || old.follower_id;
  return null;
end;
$$;

create trigger follows_notify
  after insert or delete on public.follows
  for each row execute function public.notify_on_follow();

create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select user_id into v_owner from public.study_sessions where id = new.session_id;
    perform public.notify(v_owner, new.user_id, 'like', 'like:' || new.session_id || ':' || new.user_id, new.session_id);
    return null;
  end if;
  delete from public.notifications
   where session_id = old.session_id and dedupe_key = 'like:' || old.session_id || ':' || old.user_id;
  return null;
end;
$$;

create trigger likes_notify
  after insert or delete on public.likes
  for each row execute function public.notify_on_like();

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.study_sessions where id = new.session_id;
  perform public.notify(v_owner, new.user_id, 'comment', 'comment:' || new.id, new.session_id, new.id);
  return null;
end;
$$;

-- Comment deletion removes the notification through the comment_id FK.
create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_on_comment();

-- ---------------------------------------------------------------------------
-- Client API
-- ---------------------------------------------------------------------------

-- list_notifications() is defined in 20261104000500 (after study buddies exist).

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where recipient_id = (select auth.uid()) and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function
  public.notify(uuid, uuid, public.notification_kind, text, uuid, uuid, uuid),
  public.notify_on_follow(),
  public.notify_on_like(),
  public.notify_on_comment(),
  public.mark_all_notifications_read()
from public, anon;

revoke execute on function
  public.notify(uuid, uuid, public.notification_kind, text, uuid, uuid, uuid),
  public.notify_on_follow(),
  public.notify_on_like(),
  public.notify_on_comment()
from authenticated;

grant execute on function public.mark_all_notifications_read() to authenticated;
