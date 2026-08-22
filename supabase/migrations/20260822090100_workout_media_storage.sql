-- Bucketen som håller själva filerna bakom public.workout_media
-- (20260822090000_workout_media.sql).
--
-- Skapas som migration, inte i dashboarden eller enbart i
-- supabase/config.toml - se CLAUDE.md. `on conflict do nothing` gör den
-- ändå ofarlig att köra mot ett projekt där bucketen redan hunnit
-- skapas av config.toml under lokal utveckling.
--
-- private (public = false): all användardata skyddas av RLS, och en
-- publik bucket hade gjort varje fil läsbar för den som har URL:en.
-- Appen läser istället via createSignedUrls.
--
-- Taken speglar det appen redan begränsar sig till vid valet (bilder
-- komprimeras, video kapas till 30 s). De är ett skyddsnät mot något
-- annat än appen; ett avvisat objekt ger en permanent 4xx som
-- uppladdningskön inte kan försöka om.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workout-media',
  'workout-media',
  false,
  52428800, -- 50 MiB
  array[
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'video/mp4',
    -- iOS spelar in .mov, inte .mp4.
    'video/quicktime'
  ]
)
on conflict (id) do nothing;

-- Sökvägen är {user_id}/{workout_id}/{media_id}.{ext}, och att user_id
-- ligger FÖRST är hela poängen med policyerna nedan: ägarskapet går att
-- avgöra ur namnet utan en enda tabellslagning.
--
-- Det är inte en optimering utan ett krav. Byte:sen laddas upp INNAN
-- passets rad hunnit synkas (ett pass kan loggas helt offline), så en
-- policy som joinade mot public.workouts hade avvisat uppladdningen med
-- ett permanent fel för precis det flöde appen är byggd för.
create policy "workout_media_objects_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'workout-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "workout_media_objects_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'workout-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Uppladdningen sker med x-upsert: true, så ett omförsök efter ett
-- tappat svar skriver över sig självt istället för att krocka med en
-- 409. Det är en UPDATE på objektet och kräver den här policyn.
create policy "workout_media_objects_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'workout-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'workout-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- OBS: `on delete cascade` på workout_media städar RADEN men INTE filen.
-- Storage vet ingenting om public-schemat, så ett raderat pass hade
-- lämnat sina filer kvar för alltid. Appen köar därför alltid en
-- explicit borttagning av objekten bredvid raderingen av raden - den
-- här policyn är vad som gör det möjligt.
create policy "workout_media_objects_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'workout-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
