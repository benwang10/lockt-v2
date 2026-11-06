-- Row Level Security and privileges.
--
-- Principles
--  * Anonymous clients can read nothing.
--  * Basic profile info and the follow graph are visible to signed-in users.
--  * Subjects, goals, settings and private sessions are owner-only.
--  * Shared ("followers") completed sessions are visible to the owner's
--    followers; likes/comments inherit the session's visibility.
--  * Timer columns and durations can only change through the RPCs in the
--    previous migration (column-level grants block direct edits).

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.follows enable row level security;
alter table public.subjects enable row level security;
alter table public.goals enable row level security;
alter table public.study_sessions enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

-- ---------------------------------------------------------------------------
-- Table privileges (Supabase grants ALL to anon/authenticated by default)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.user_settings, public.follows, public.subjects,
              public.goals, public.study_sessions, public.likes, public.comments
  from anon, authenticated;

grant select, delete on public.profiles to authenticated;
grant insert (id, username, display_name, bio, avatar_path) on public.profiles to authenticated;
grant update (username, display_name, bio, avatar_path) on public.profiles to authenticated;

grant select on public.user_settings to authenticated;
grant update (remember_visibility, last_visibility) on public.user_settings to authenticated;

grant select, insert, delete on public.follows to authenticated;

grant select, delete on public.subjects to authenticated;
grant insert (id, user_id, name, color) on public.subjects to authenticated;
grant update (name, color, archived_at) on public.subjects to authenticated;

grant select, delete on public.goals to authenticated;
grant insert (id, user_id, kind, title, subject_id, weekly_target_minutes, target_date)
  on public.goals to authenticated;
grant update (title, subject_id, weekly_target_minutes, target_date, completed_at, archived_at)
  on public.goals to authenticated;

-- Sessions are created and timed via RPC only. Owners may edit the
-- descriptive fields of completed sessions and delete their own sessions.
grant select, delete on public.study_sessions to authenticated;
grant update (title, accomplishment, mood, photo_path, song_title, song_artist, song_url, visibility, goal_id)
  on public.study_sessions to authenticated;

grant select, delete on public.likes to authenticated;
grant insert (session_id, user_id) on public.likes to authenticated;

grant select, delete on public.comments to authenticated;
grant insert (id, session_id, user_id, body) on public.comments to authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
-- Scoped to this app's functions so applying the migration never changes
-- privileges on unrelated functions that may exist in the project.
revoke execute on function
  public.get_active_session(),
  public.start_session(uuid, uuid, text, uuid),
  public.pause_session(uuid, timestamptz),
  public.resume_session(uuid),
  public.finish_session(uuid, timestamptz),
  public.discard_session(uuid),
  public.search_profiles(text, integer),
  public.can_view_session(uuid),
  public.can_view_session_photo(text),
  public.can_upload_session_photo(text),
  public.session_payload(public.study_sessions),
  public.require_uid(),
  public.clamp_instant(timestamptz, timestamptz),
  public.lock_own_session(uuid, uuid),
  public.touch_updated_at(),
  public.create_user_settings(),
  public.sync_subject_snapshot(),
  public.maintain_session_counters()
from public, anon;

grant execute on function
  public.get_active_session(),
  public.start_session(uuid, uuid, text, uuid),
  public.pause_session(uuid, timestamptz),
  public.resume_session(uuid),
  public.finish_session(uuid, timestamptz),
  public.discard_session(uuid),
  public.search_profiles(text, integer),
  -- used inside RLS policies, which run with the caller's privileges
  public.can_view_session(uuid),
  public.can_view_session_photo(text),
  public.can_upload_session_photo(text)
to authenticated;

-- Internal helpers stay callable only by the owner (security definer RPCs).
revoke execute on function
  public.session_payload(public.study_sessions),
  public.require_uid(),
  public.clamp_instant(timestamptz, timestamptz),
  public.lock_own_session(uuid, uuid),
  public.touch_updated_at(),
  public.create_user_settings(),
  public.sync_subject_snapshot(),
  public.maintain_session_counters()
from authenticated;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy "Profiles are visible to signed-in users"
  on public.profiles for select to authenticated
  using (true);

create policy "Users create their own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users delete their own profile"
  on public.profiles for delete to authenticated
  using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- User settings (owner only)
-- ---------------------------------------------------------------------------
create policy "Owner reads settings"
  on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owner updates settings"
  on public.user_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------
create policy "Follow graph is visible to signed-in users"
  on public.follows for select to authenticated
  using (true);

create policy "Users follow as themselves"
  on public.follows for insert to authenticated
  with check (follower_id = (select auth.uid()));

create policy "Users unfollow as themselves"
  on public.follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Subjects and goals (owner only)
-- ---------------------------------------------------------------------------
create policy "Owner manages subjects (select)"
  on public.subjects for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Owner manages subjects (insert)"
  on public.subjects for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Owner manages subjects (update)"
  on public.subjects for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Owner manages subjects (delete)"
  on public.subjects for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Owner manages goals (select)"
  on public.goals for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Owner manages goals (insert)"
  on public.goals for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Owner manages goals (update)"
  on public.goals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Owner manages goals (delete)"
  on public.goals for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Study sessions
-- ---------------------------------------------------------------------------
create policy "Owners see all their sessions; followers see shared ones"
  on public.study_sessions for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      status = 'completed'
      and visibility = 'followers'
      and exists (
        select 1 from public.follows f
         where f.follower_id = (select auth.uid())
           and f.following_id = study_sessions.user_id
      )
    )
  );

create policy "Owners edit their completed sessions"
  on public.study_sessions for update to authenticated
  using (user_id = (select auth.uid()) and status = 'completed')
  with check (user_id = (select auth.uid()) and status = 'completed');

create policy "Owners delete their sessions"
  on public.study_sessions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Likes and comments inherit session visibility
-- ---------------------------------------------------------------------------
create policy "Likes visible with their session"
  on public.likes for select to authenticated
  using (public.can_view_session(session_id));

create policy "Users like sessions they can see"
  on public.likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_session(session_id));

create policy "Users remove their own likes"
  on public.likes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Comments visible with their session"
  on public.comments for select to authenticated
  using (public.can_view_session(session_id));

create policy "Users comment on sessions they can see"
  on public.comments for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_session(session_id));

create policy "Users delete their own comments"
  on public.comments for delete to authenticated
  using (user_id = (select auth.uid()));
