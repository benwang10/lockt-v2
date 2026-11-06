-- =============================================================================
-- DEVELOPMENT SEED DATA — for local Supabase only (`supabase db reset` runs it).
-- Never run against production. Creates two demo accounts:
--
--   ada@studylog.dev   / studylog-demo-1   (username: ada_codes)
--   ben@studylog.dev   / studylog-demo-2   (username: ben_reads)
--
-- Ben follows Ada. Ada has one shared and one private session this week.
-- =============================================================================

do $$
declare
  v_ada uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_ben uuid := 'b0000000-0000-4000-8000-00000000000b';
  v_cs uuid := 'c0000000-0000-4000-8000-0000000000c1';
  v_calc uuid := 'c0000000-0000-4000-8000-0000000000c2';
  v_bio uuid := 'c0000000-0000-4000-8000-0000000000c3';
begin
  -- Auth users (email/password, already confirmed) + email identities.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    ('00000000-0000-0000-0000-000000000000', v_ada, 'authenticated', 'authenticated', 'ada@studylog.dev',
     extensions.crypt('studylog-demo-1', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', v_ben, 'authenticated', 'authenticated', 'ben@studylog.dev',
     extensions.crypt('studylog-demo-2', extensions.gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), v_ada, v_ada::text,
     jsonb_build_object('sub', v_ada::text, 'email', 'ada@studylog.dev', 'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), v_ben, v_ben::text,
     jsonb_build_object('sub', v_ben::text, 'email', 'ben@studylog.dev', 'email_verified', true), 'email', now(), now(), now())
  on conflict do nothing;

  insert into public.profiles (id, username, display_name, bio) values
    (v_ada, 'ada_codes', 'Ada Lin', 'CS major. Pointers are my nemesis (for now).'),
    (v_ben, 'ben_reads', 'Ben Okafor', 'Bio + calc. Library regular.')
  on conflict (id) do nothing;

  insert into public.subjects (id, user_id, name, color) values
    (v_cs, v_ada, 'CS 31', '#5B5BD6'),
    (v_calc, v_ada, 'Calculus', '#0B84C6'),
    (v_bio, v_ben, 'Biology', '#0F8A5F')
  on conflict (id) do nothing;

  insert into public.goals (user_id, kind, title, weekly_target_minutes) values
    (v_ada, 'weekly_time', 'Study 6h/week', 360);
  insert into public.goals (user_id, kind, title, subject_id, target_date) values
    (v_ada, 'milestone', 'Finish CS 31 practice exam', v_cs, current_date + 7);

  insert into public.follows (follower_id, following_id) values (v_ben, v_ada) on conflict do nothing;

  -- Completed sessions (inserted directly; the app creates them via RPCs).
  insert into public.study_sessions (
    user_id, subject_id, subject_name, subject_color, status, timer_state, intention,
    started_at, running_since, accumulated_ms, ended_at, duration_seconds, completed_at,
    title, accomplishment, mood, song_title, song_artist, song_url, visibility
  ) values
    (v_ada, v_cs, 'CS 31', '#5B5BD6', 'completed', null, 'Get through the linked list worksheet',
     now() - interval '3 hours', null, 3000000, now() - interval '2 hours', 3000, now() - interval '2 hours',
     'Linked lists, finally', 'Finished the worksheet and fixed my insert-at-tail bug.', 'proud',
     'Weightless', 'Marconi Union', 'https://open.spotify.com/track/6kkwzB6hXLIONkEk9JciA6', 'followers'),
    (v_ada, v_calc, 'Calculus', '#0B84C6', 'completed', null, null,
     now() - interval '26 hours', null, 1800000, now() - interval '25 hours', 1800, now() - interval '25 hours',
     'Quiet review', 'Re-derived the chain rule examples on my own.', 'calm',
     null, null, null, 'private'),
    (v_ben, v_bio, 'Biology', '#0F8A5F', 'completed', null, 'Flashcards for cell signaling',
     now() - interval '5 hours', null, 2400000, now() - interval '4 hours', 2400, now() - interval '4 hours',
     'Cell signaling flashcards', 'Made 40 flashcards and got 32 right on the first pass.', 'focused',
     null, null, null, 'followers');
end
$$;
