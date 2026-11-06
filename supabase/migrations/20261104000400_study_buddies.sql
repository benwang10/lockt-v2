-- Study buddies: the owner of a completed session invites other users to be
-- credited on the post. It is attribution only: no session is created for
-- the buddy, their totals/goals/wins are unchanged, and the post is not
-- distributed to the buddy's followers. Authorship and editing stay with
-- the owner.
--
-- State machine (enforced here, never trusted to the client):
--
--   (none) --invite--> pending --accept--> accepted
--                         |  \--decline--> declined   (owner can't re-invite)
--                         \--session made private--> revoked
--   revoked --explicit re-invite by owner--> pending   (never automatic)
--   owner removes pending/accepted/revoked rows; an accepted buddy can remove
--   themselves.
--
-- Privacy:
--   * Invitations only for completed sessions shared with followers.
--   * Accepting requires being able to see the session, i.e. following the
--     owner (an invitation never bypasses visibility).
--   * Switching the session to "Only me" revokes pending invitations and
--     hides it from everyone (accepted buddies included) through the
--     existing session RLS. Re-sharing does not reactivate them.
--   * Pending/declined/revoked rows are visible only to the owner and the
--     invitee. Other viewers see accepted buddies only, and only on sessions
--     they can already see. Accepted attribution may remain after the buddy
--     unfollows; it grants the buddy no access.

create type public.buddy_status as enum ('pending', 'accepted', 'declined', 'revoked');

create table public.study_buddies (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  buddy_id uuid not null references public.profiles (id) on delete cascade,
  status public.buddy_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint study_buddies_not_self check (owner_id <> buddy_id),
  constraint study_buddies_unique unique (session_id, buddy_id)
);

create index study_buddies_buddy_idx on public.study_buddies (buddy_id, status);
create index study_buddies_session_idx on public.study_buddies (session_id, status);
create index study_buddies_owner_idx on public.study_buddies (owner_id);

create trigger study_buddies_touch_updated_at
  before update on public.study_buddies
  for each row execute function public.touch_updated_at();

alter table public.notifications
  add constraint notifications_invite_fk foreign key (invite_id)
  references public.study_buddies (id) on delete cascade;
create index notifications_invite_idx on public.notifications (invite_id) where invite_id is not null;

alter table public.study_buddies enable row level security;
revoke all on public.study_buddies from anon, authenticated;
-- Read-only for clients; every change goes through the RPCs below.
grant select on public.study_buddies to authenticated;

create policy "Owner and invitee see invitations; viewers see accepted buddies"
  on public.study_buddies for select to authenticated
  using (
    owner_id = (select auth.uid())
    or buddy_id = (select auth.uid())
    or (status = 'accepted' and public.can_view_session(session_id))
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Invite one or more users. Idempotent: existing pending/accepted rows are
-- left alone; declined invitations are not re-sent; revoked ones are
-- re-activated only because the owner explicitly invited again here.
create or replace function public.invite_study_buddies(p_session_id uuid, p_buddy_ids uuid[])
returns setof public.study_buddies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_session public.study_sessions;
  v_buddy uuid;
  v_row public.study_buddies;
  v_total integer;
begin
  select * into v_session from public.study_sessions where id = p_session_id for update;
  if not found or v_session.user_id <> v_uid then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status <> 'completed' or v_session.visibility <> 'followers' then
    raise exception 'buddies_require_followers_visibility' using errcode = 'P0001';
  end if;
  if p_buddy_ids is null or cardinality(p_buddy_ids) = 0 then
    return;
  end if;
  if v_uid = any (p_buddy_ids) then
    raise exception 'cannot_invite_self' using errcode = 'P0001';
  end if;

  for v_buddy in select distinct unnest(p_buddy_ids) loop
    if not exists (select 1 from public.profiles where id = v_buddy) then
      raise exception 'buddy_not_found' using errcode = 'P0002';
    end if;

    select * into v_row from public.study_buddies where session_id = p_session_id and buddy_id = v_buddy for update;
    if not found then
      insert into public.study_buddies (session_id, owner_id, buddy_id, status)
      values (p_session_id, v_uid, v_buddy, 'pending')
      returning * into v_row;
      perform public.notify(v_buddy, v_uid, 'buddy_invite', 'buddy_invite:' || v_row.id, p_session_id, null, v_row.id);
    elsif v_row.status = 'revoked' then
      update public.study_buddies
         set status = 'pending', responded_at = null
       where id = v_row.id
      returning * into v_row;
      -- A fresh notification for the explicit re-invite.
      delete from public.notifications where invite_id = v_row.id and kind = 'buddy_invite';
      perform public.notify(v_buddy, v_uid, 'buddy_invite', 'buddy_invite:' || v_row.id, p_session_id, null, v_row.id);
    end if;
    -- pending / accepted: already invited (idempotent); declined: respected.
  end loop;

  select count(*) into v_total
    from public.study_buddies
   where session_id = p_session_id and status in ('pending', 'accepted');
  if v_total > 10 then
    raise exception 'too_many_buddies' using errcode = 'P0001';
  end if;

  return query select * from public.study_buddies where session_id = p_session_id order by created_at, id;
end;
$$;

-- The invitee accepts or declines a pending invitation.
create or replace function public.respond_study_buddy(p_invite_id uuid, p_accept boolean)
returns public.study_buddies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_row public.study_buddies;
  v_session public.study_sessions;
begin
  select * into v_row from public.study_buddies where id = p_invite_id and buddy_id = v_uid for update;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  -- Idempotent retries.
  if (p_accept and v_row.status = 'accepted') or (not p_accept and v_row.status = 'declined') then
    return v_row;
  end if;
  if v_row.status <> 'pending' then
    raise exception 'invite_no_longer_valid' using errcode = 'P0001';
  end if;

  if p_accept then
    select * into v_session from public.study_sessions where id = v_row.session_id;
    if not found or v_session.status <> 'completed' or v_session.visibility <> 'followers' then
      raise exception 'invite_no_longer_valid' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from public.follows f where f.follower_id = v_uid and f.following_id = v_row.owner_id
    ) then
      raise exception 'buddy_requires_follow' using errcode = 'P0001';
    end if;
    update public.study_buddies set status = 'accepted', responded_at = now()
     where id = v_row.id returning * into v_row;
    perform public.notify(v_row.owner_id, v_uid, 'buddy_accepted', 'buddy_accepted:' || v_row.id, v_row.session_id, null, v_row.id);
  else
    update public.study_buddies set status = 'declined', responded_at = now()
     where id = v_row.id returning * into v_row;
  end if;
  -- The invitation has been handled.
  update public.notifications set read_at = coalesce(read_at, now())
   where invite_id = v_row.id and recipient_id = v_uid;
  return v_row;
end;
$$;

-- Owner removes an invitation/buddy, or an accepted buddy removes themselves.
create or replace function public.remove_study_buddy(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_row public.study_buddies;
begin
  select * into v_row from public.study_buddies where id = p_invite_id for update;
  if not found then
    return; -- already removed: idempotent
  end if;
  if v_row.owner_id = v_uid then
    if v_row.status = 'declined' then
      -- Keeping declined rows is what stops repeated re-invitations.
      raise exception 'invite_declined' using errcode = 'P0001';
    end if;
  elsif v_row.buddy_id = v_uid then
    if v_row.status <> 'accepted' then
      raise exception 'invite_not_found' using errcode = 'P0002';
    end if;
  else
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  delete from public.study_buddies where id = v_row.id; -- notifications cascade
end;
$$;

-- Switching a session to private (or otherwise un-sharing it) invalidates
-- pending invitations. Re-sharing never flips them back.
create or replace function public.revoke_buddy_invites_on_unshare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility <> 'followers' and old.visibility = 'followers' then
    update public.study_buddies
       set status = 'revoked'
     where session_id = new.id and status = 'pending';
  end if;
  return null;
end;
$$;

create trigger study_sessions_revoke_buddy_invites
  after update of visibility on public.study_sessions
  for each row execute function public.revoke_buddy_invites_on_unshare();

revoke execute on function
  public.invite_study_buddies(uuid, uuid[]),
  public.respond_study_buddy(uuid, boolean),
  public.remove_study_buddy(uuid),
  public.revoke_buddy_invites_on_unshare()
from public, anon;
revoke execute on function public.revoke_buddy_invites_on_unshare() from authenticated;
grant execute on function
  public.invite_study_buddies(uuid, uuid[]),
  public.respond_study_buddy(uuid, boolean),
  public.remove_study_buddy(uuid)
to authenticated;
