-- Private storage buckets for session photos and avatars.
--
-- Both buckets are private: clients obtain short-lived signed URLs, and the
-- Storage API only signs/serves an object if the caller passes these SELECT
-- policies. Size and MIME limits are enforced server-side by the bucket config.
--
-- Object naming:
--   session-photos/<owner uid>/<session id>/<uuid>.<jpg|png|webp>
--   avatars/<owner uid>/<uuid>.<jpg|png|webp>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('session-photos', 'session-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Session photos: readable by whoever can view the session that references
-- the object (owner always; followers only while it is shared with them).
-- ---------------------------------------------------------------------------
create policy "Session photos readable with their session"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'session-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.can_view_session_photo(name)
    )
  );

create policy "Owners upload photos for their completed sessions"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'session-photos'
    and public.can_upload_session_photo(name)
  );

create policy "Owners replace their session photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'session-photos'
    and public.can_upload_session_photo(name)
  );

create policy "Owners delete their session photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Avatars: basic profile info, readable by any signed-in user.
-- ---------------------------------------------------------------------------
create policy "Avatars readable by signed-in users"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy "Users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  );

create policy "Users replace their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
