-- Lockt (internal id: studylog) core schema: profiles, social graph, subjects, goals, study sessions,
-- likes and comments. Row Level Security is configured in a later migration.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
create type public.session_visibility as enum ('private', 'followers');
create type public.session_status as enum ('active', 'completed');
create type public.timer_state as enum ('running', 'paused');
create type public.session_mood as enum ('focused', 'motivated', 'calm', 'proud', 'tired', 'frustrated');
create type public.goal_kind as enum ('weekly_time', 'milestone');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, created during onboarding)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  bio text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 50),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 160),
  constraint profiles_avatar_in_own_folder check (
    avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
  )
);

create unique index profiles_username_key on public.profiles (username);
create index profiles_username_trgm_idx on public.profiles using gin (username extensions.gin_trgm_ops);
create index profiles_display_name_trgm_idx on public.profiles using gin (lower(display_name) extensions.gin_trgm_ops);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Private per-user preferences (never readable by other users).
create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  remember_visibility boolean not null default false,
  last_visibility public.session_visibility not null default 'private',
  updated_at timestamptz not null default now()
);

create trigger user_settings_touch_updated_at
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

create or replace function public.create_user_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger profiles_create_settings
  after insert on public.profiles
  for each row execute function public.create_user_settings();

-- ---------------------------------------------------------------------------
-- Follows (no approval needed for the MVP)
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

create index follows_following_idx on public.follows (following_id, follower_id);

-- ---------------------------------------------------------------------------
-- Subjects (archived rather than deleted so history stays intact)
-- ---------------------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  color text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint subjects_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint subjects_id_user_unique unique (id, user_id)
);

create unique index subjects_active_name_per_user
  on public.subjects (user_id, lower(btrim(name)))
  where archived_at is null;

create trigger subjects_touch_updated_at
  before update on public.subjects
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Goals
--   weekly_time: study N minutes per calendar week (optionally one subject)
--   milestone:   a named accomplishment the user marks complete explicitly
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.goal_kind not null,
  title text not null,
  subject_id uuid,
  weekly_target_minutes integer,
  target_date date,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_title_length check (char_length(btrim(title)) between 1 and 80),
  constraint goals_id_user_unique unique (id, user_id),
  constraint goals_subject_owned foreign key (subject_id, user_id)
    references public.subjects (id, user_id),
  constraint goals_kind_fields check (
    (kind = 'weekly_time'
      and weekly_target_minutes is not null
      and weekly_target_minutes between 15 and 10080
      and target_date is null
      and completed_at is null)
    or
    (kind = 'milestone' and weekly_target_minutes is null)
  )
);

create index goals_user_idx on public.goals (user_id, created_at desc);

create trigger goals_touch_updated_at
  before update on public.goals
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Study sessions
--
-- Timer state is persisted as timestamps so elapsed time never depends on a
-- client-side interval:
--   active time = accumulated_ms + (now - running_since, if running)
-- subject_name / subject_color are snapshots so feeds don't need access to
-- the owner's subjects table and archived subjects never break history.
-- ---------------------------------------------------------------------------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject_id uuid not null,
  subject_name text not null,
  subject_color text not null,
  goal_id uuid,
  status public.session_status not null default 'active',
  timer_state public.timer_state,
  intention text,
  started_at timestamptz not null default now(),
  running_since timestamptz,
  accumulated_ms bigint not null default 0,
  ended_at timestamptz,
  duration_seconds integer,
  completed_at timestamptz,
  title text,
  accomplishment text,
  mood public.session_mood,
  photo_path text,
  song_title text,
  song_artist text,
  song_url text,
  visibility public.session_visibility not null default 'private',
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sessions_subject_owned foreign key (subject_id, user_id)
    references public.subjects (id, user_id),
  constraint sessions_goal_owned foreign key (goal_id, user_id)
    references public.goals (id, user_id) on delete set null (goal_id),

  constraint sessions_accumulated_nonneg check (accumulated_ms >= 0),
  constraint sessions_duration_range check (duration_seconds is null or duration_seconds between 0 and 86400),
  constraint sessions_intention_length check (intention is null or char_length(intention) <= 280),
  constraint sessions_title_length check (title is null or char_length(btrim(title)) between 1 and 80),
  constraint sessions_accomplishment_length check (accomplishment is null or char_length(accomplishment) <= 2000),
  constraint sessions_song_title_length check (song_title is null or char_length(btrim(song_title)) between 1 and 120),
  constraint sessions_song_artist_length check (song_artist is null or char_length(song_artist) <= 120),
  constraint sessions_song_url_supported check (
    song_url is null or (
      char_length(song_url) <= 500
      and song_url ~ '^https://(open\.spotify\.com|spotify\.link|music\.apple\.com|geo\.music\.apple\.com)/[^[:space:]]*$'
    )
  ),
  constraint sessions_song_needs_title check (song_title is not null or (song_artist is null and song_url is null)),
  constraint sessions_photo_in_own_folder check (
    photo_path is null
    or photo_path ~ ('^' || user_id::text || '/' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
  ),
  constraint sessions_counts_nonneg check (like_count >= 0 and comment_count >= 0),
  constraint sessions_active_is_private check (status = 'completed' or visibility = 'private'),
  constraint sessions_state_consistency check (
    (status = 'active'
      and timer_state is not null
      and ((timer_state = 'running') = (running_since is not null))
      and ended_at is null and duration_seconds is null and completed_at is null)
    or
    (status = 'completed'
      and timer_state is null and running_since is null
      and ended_at is not null and duration_seconds is not null and completed_at is not null)
  )
);

-- Only one active (running or paused) session per account, across devices.
create unique index study_sessions_one_active_per_user
  on public.study_sessions (user_id) where status = 'active';

-- Feed: shared sessions newest first with a stable tiebreaker for keyset paging.
create index study_sessions_shared_feed_idx
  on public.study_sessions (user_id, completed_at desc, id desc)
  where status = 'completed' and visibility = 'followers';

-- Owner history + weekly statistics.
create index study_sessions_owner_history_idx
  on public.study_sessions (user_id, completed_at desc, id desc)
  where status = 'completed';
create index study_sessions_owner_started_idx
  on public.study_sessions (user_id, started_at)
  where status = 'completed';
create index study_sessions_goal_idx on public.study_sessions (goal_id) where goal_id is not null;

create trigger study_sessions_touch_updated_at
  before update on public.study_sessions
  for each row execute function public.touch_updated_at();

-- Renaming / recolouring a subject updates the snapshots on its sessions.
create or replace function public.sync_subject_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name or new.color is distinct from old.color then
    update public.study_sessions
       set subject_name = new.name, subject_color = new.color
     where subject_id = new.id;
  end if;
  return new;
end;
$$;

create trigger subjects_sync_session_snapshot
  after update of name, color on public.subjects
  for each row execute function public.sync_subject_snapshot();

-- ---------------------------------------------------------------------------
-- Likes and comments
-- ---------------------------------------------------------------------------
create table public.likes (
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index likes_user_idx on public.likes (user_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint comments_body_length check (char_length(btrim(body)) between 1 and 500)
);

create index comments_session_idx on public.comments (session_id, created_at, id);
create index comments_user_idx on public.comments (user_id);

-- Denormalised counters for feed cards, maintained by triggers.
create or replace function public.maintain_session_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  v_session uuid := case when tg_op = 'INSERT' then new.session_id else old.session_id end;
begin
  if tg_table_name = 'likes' then
    update public.study_sessions
       set like_count = greatest(like_count + v_delta, 0)
     where id = v_session;
  else
    update public.study_sessions
       set comment_count = greatest(comment_count + v_delta, 0)
     where id = v_session;
  end if;
  return null;
end;
$$;

create trigger likes_maintain_counter
  after insert or delete on public.likes
  for each row execute function public.maintain_session_counters();

create trigger comments_maintain_counter
  after insert or delete on public.comments
  for each row execute function public.maintain_session_counters();
