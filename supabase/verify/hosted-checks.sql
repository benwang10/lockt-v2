-- READ-ONLY checks to run in the Supabase dashboard → SQL Editor after
-- `npx supabase db push`. Nothing here modifies data. Each query lists what
-- you should see.

-- 1) Migrations recorded (expect 10 rows: 20261102000100 … 20261102000400,
--    20261104000100 … 20261104000500 and 20261106000100 (v2.5 feedback))
select version, name from supabase_migrations.schema_migrations order by version;

-- 2) Buckets (expect avatars: public=false, 2097152; session-photos: public=false, 5242880;
--    both allowing image/jpeg, image/png, image/webp)
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('avatars', 'session-photos')
order by id;

-- 3) Storage policies (expect 8 rows: 4 for avatars, 4 for session photos —
--    one each of SELECT / INSERT / UPDATE / DELETE, all for role authenticated)
select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- 4) RLS enabled on every app table (expect 12 rows, all rls_enabled = true)
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles', 'user_settings', 'follows', 'subjects', 'goals', 'study_sessions', 'likes', 'comments',
                    'profile_statuses', 'notifications', 'study_buddies', 'feedback')
order by 1;

-- 5) Anonymous role has no table privileges on app tables (expect 0 rows)
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
  and table_name in ('profiles', 'user_settings', 'follows', 'subjects', 'goals', 'study_sessions', 'likes', 'comments',
                     'profile_statuses', 'notifications', 'study_buddies', 'feedback');

-- 6) Signed-in users cannot edit durations or timer columns directly
--    (expect only the 9 descriptive columns listed)
select column_name
from information_schema.column_privileges
where grantee = 'authenticated' and table_schema = 'public'
  and table_name = 'study_sessions' and privilege_type = 'UPDATE'
order by 1;

-- 7) After creating test accounts: each has a profile (expect your usernames)
select p.username, u.email, u.email_confirmed_at is not null as email_confirmed
from public.profiles p join auth.users u on u.id = p.id
order by p.created_at;

-- 8) New tables are read-only for signed-in clients (expect 3 rows, all SELECT:
--    notifications, profile_statuses, study_buddies — no INSERT/UPDATE/DELETE).
--    Writes go through database functions / triggers only.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated' and table_schema = 'public'
  and table_name in ('profile_statuses', 'notifications', 'study_buddies')
order by 1, 2;

-- 8b) The only column clients may update on notifications (expect 1 row: read_at)
select column_name
from information_schema.column_privileges
where grantee = 'authenticated' and table_schema = 'public'
  and table_name = 'notifications' and privilege_type = 'UPDATE';

-- 9) Functions signed-in users may call for the new features (expect 8 rows:
--    clear_status, get_profile_highlight, invite_study_buddies, list_notifications,
--    mark_all_notifications_read, remove_study_buddy, respond_study_buddy, set_status
--    — and NOT notify / notify_on_* / revoke_buddy_invites_on_unshare)
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('authenticated', p.oid, 'execute')
  and p.proname in ('set_status', 'clear_status', 'get_profile_highlight', 'list_notifications',
                    'mark_all_notifications_read', 'invite_study_buddies', 'respond_study_buddy',
                    'remove_study_buddy', 'notify', 'notify_on_follow', 'notify_on_like',
                    'notify_on_comment', 'revoke_buddy_invites_on_unshare')
order by 1;

-- 10) Existing profiles kept their data and got the default highlight
--     (expect every profile with highlight_stat = hours_week unless changed in the app)
select username, highlight_stat from public.profiles order by created_at;

-- 11) v2.5 feedback: no API role can read or write the table directly
--     (expect 0 rows), and signed-in users may call submit_feedback (expect 1 row).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'feedback' and grantee in ('anon', 'authenticated');

select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'submit_feedback'
  and has_function_privilege('authenticated', p.oid, 'execute');

-- 12) Reviewing beta feedback (newest first). The SQL Editor runs as the
--     project owner, so this works even though the app can't read the table.
select f.created_at, f.category, p.username, f.platform, f.app_version, f.message
from public.feedback f join public.profiles p on p.id = f.user_id
order by f.created_at desc
limit 100;
