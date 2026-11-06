-- Reading notifications. SECURITY INVOKER: the joins below run under the
-- reader's own Row Level Security, so:
--   * session titles appear only while the reader can still see the session
--     (owner, or follower of a session shared with followers);
--   * comment excerpts appear only while the comment is visible;
--   * nothing about a session the reader cannot see is returned (the
--     session id itself comes back null, so the app can't even link to it);
--   * study-buddy invitations expose their current status so stale or
--     revoked invitations render as "no longer available".
-- Newest first, keyset-paginated on (created_at desc, id desc).

create or replace function public.list_notifications(
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  kind public.notification_kind,
  created_at timestamptz,
  read_at timestamptz,
  actor jsonb,
  session_id uuid,
  session_title text,
  comment_excerpt text,
  invite_id uuid,
  invite_status public.buddy_status
)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.id,
         n.kind,
         n.created_at,
         n.read_at,
         jsonb_build_object(
           'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_path', p.avatar_path
         ) as actor,
         s.id as session_id,
         case when s.id is null then null else coalesce(s.title, s.subject_name || ' session') end as session_title,
         case when s.id is null then null else left(c.body, 120) end as comment_excerpt,
         b.id as invite_id,
         b.status as invite_status
    from public.notifications n
    join public.profiles p on p.id = n.actor_id
    left join public.study_sessions s on s.id = n.session_id and s.status = 'completed'
    left join public.comments c on c.id = n.comment_id
    left join public.study_buddies b on b.id = n.invite_id
   where n.recipient_id = (select auth.uid())
     and (
       p_before_created_at is null
       or n.created_at < p_before_created_at
       or (n.created_at = p_before_created_at and n.id < p_before_id)
     )
   order by n.created_at desc, n.id desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke execute on function public.list_notifications(timestamptz, uuid, integer) from public, anon;
grant execute on function public.list_notifications(timestamptz, uuid, integer) to authenticated;
