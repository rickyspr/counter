-- Additional SELECT policies on both private buckets, alongside the
-- existing own-path policies (20260822090100_workout_media_storage.sql,
-- 20260822100100_avatars_storage.sql). Both buckets already key
-- ownership on the first path segment being the owner's uuid with no
-- table lookup - are_mutual_friends() is the same kind of self-
-- contained check, so the cast is safe under the same assumption the
-- existing policies already make (only the app ever writes objects
-- there).
create policy "workout_media_objects_select_friends"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'workout-media'
    and public.are_mutual_friends(((storage.foldername(name))[1])::uuid, auth.uid())
  );

create policy "avatars_objects_select_friends"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and public.are_mutual_friends(((storage.foldername(name))[1])::uuid, auth.uid())
  );
