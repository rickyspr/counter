-- The bucket holding the bytes behind profiles.avatar_path.
--
-- A separate bucket rather than a folder inside `workout-media`. That
-- bucket allows 50 MiB videos, its policies and the app's local staging
-- directory are wired to the upload queue, and sweepOrphanedMedia()
-- deletes anything in that directory the queue does not know about - an
-- avatar parked there would be swept away on the next app start. The
-- limits here are also the ones that actually apply to a profile
-- picture: images only, and small.
--
-- private (public = false), same as workout-media: all user data is
-- protected by RLS, and a public bucket would make every avatar
-- readable by anyone holding the URL. The app reads via
-- createSignedUrl.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880, -- 5 MiB
  array[
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do nothing;

-- The path is {user_id}/{avatar_id}.{ext}, so ownership is decided from
-- the first path segment without a table lookup - the same shape as
-- workout-media, and here it is simply the least the policy can depend
-- on: there is no row to join against at all before the profile has
-- been written.
--
-- A fresh uuid is used for every upload rather than a stable
-- {user_id}.jpg. Reusing the path would leave both the signed-URL cache
-- (keyed by path) and React Native's Image cache (keyed by URI) serving
-- the previous picture after a change.
create policy "avatars_objects_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_objects_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Uploads never overwrite (every one gets a new uuid), but a retry
-- after a lost response would: the client passes upsert so it repairs
-- itself instead of failing on a 409.
create policy "avatars_objects_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Required for the same reason as in workout-media: nothing in Storage
-- cascades from the public schema. Replacing or clearing an avatar
-- leaves the old object behind unless the app removes it explicitly,
-- which it does right after the profile row has been updated.
create policy "avatars_objects_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
