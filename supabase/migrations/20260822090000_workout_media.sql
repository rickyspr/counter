-- Bilder och videor som hör till ett pass. Själva filerna ligger i
-- Supabase Storage (se 20260822090100_workout_media_storage.sql); den
-- här tabellen är bara metadata plus sökvägen dit.
--
-- Delningen i två lager är inte kosmetisk. Synk-kön i appen
-- (apps/mobile/lib/offline-queue.ts) skriver om HELA kön som en
-- JSON-sträng vid varje enqueue, så en bild i kön hade serialiserats om
-- vid varje efterföljande set-sparning - och kön blockerar dessutom på
-- sitt huvud, så en video på dåligt nät hade låst all annan synkning.
-- Byte:sen går därför i en egen kö och laddas upp FÖRST; den här raden
-- köas efter att de landat.
create table public.workout_media (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  -- Sökvägen i bucketen: {user_id}/{workout_id}/{media_id}.{ext}.
  -- Unik globalt, vilket den är gratis eftersom den innehåller ett uuid
  -- - men villkoret gör att en ominsättning av samma rad aldrig kan
  -- peka två rader på samma fil.
  storage_path text not null unique,
  -- Sätts av KLIENTEN när media väljs, inte av servern. Ett pass kan
  -- loggas helt offline och synkas i klump långt senare; med now() hade
  -- sorteringen blivit synk-ordningen istället för den ordning
  -- användaren faktiskt lade till bilderna.
  --
  -- Defaulten är ett skyddsnät, inte den tänkta vägen: en insert utan
  -- added_at hade annars fällts av not null (23502), vilket synk-kön
  -- klassar som permanent och alltså SLÄNGER - och då är användarens
  -- bild borta. Fel ordning är bättre än ingen bild.
  added_at timestamptz not null default now(),
  width int,
  height int,
  duration_ms int,
  created_at timestamptz not null default now(),
  -- Samma resonemang som workouts_name_length i
  -- 20260821090000_workout_name.sql: villkoren är ett skydd mot skräp
  -- från något annat än appen. Appen skickar aldrig annat än det
  -- ImagePicker svarat med, och normaliserar saknade värden till null.
  constraint workout_media_width_positive check (width is null or width > 0),
  constraint workout_media_height_positive check (height is null or height > 0),
  constraint workout_media_duration_non_negative check (duration_ms is null or duration_ms >= 0)
);

-- Täcker både "alla media för ett pass" och sorteringen de hämtas i.
create index workout_media_workout_id_idx
  on public.workout_media (workout_id, added_at, id);

-- MEDVETET ingen order_index, till skillnad från workout_exercises och
-- sets. Där är numret användarsynlig identitet ("Set 3") och skyddas av
-- unique (workout_id, order_index) - och det är just den unikheten som
-- tvingar fram hela räknarapparaten i appen (persistCounters före
-- enqueue, drainQueue före redigering, max+1).
--
-- För media hade en krock inte gett omkastad ordning utan en upsert som
-- skriver över en ANNAN rads storage_path, alltså en tappad bild.
-- Sorteringen är (added_at, id) och ingenting kan kollidera. Ska
-- omordning byggas senare är vägen fraktionella index, inte ett unikt
-- heltal.

alter table public.workout_media enable row level security;

-- Ingen egen user_id-kolumn; ägarskap ärvs via workouts, samma mönster
-- som workout_exercises (20260815090004).
create policy "workout_media_select_own"
  on public.workout_media for select
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_media.workout_id
        and w.user_id = auth.uid()
    )
  );

create policy "workout_media_insert_own"
  on public.workout_media for insert
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_media.workout_id
        and w.user_id = auth.uid()
    )
  );

-- Behövs trots att appen aldrig "redigerar" en mediarad: kön skickar en
-- upsert, och en upsert som träffar en befintlig id blir en UPDATE.
create policy "workout_media_update_own"
  on public.workout_media for update
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_media.workout_id
        and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_media.workout_id
        and w.user_id = auth.uid()
    )
  );

create policy "workout_media_delete_own"
  on public.workout_media for delete
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_media.workout_id
        and w.user_id = auth.uid()
    )
  );

-- Se 20260815090006_grants.sql: appen kräver inloggning för allt, så
-- bara `authenticated` - aldrig `anon`.
grant select, insert, update, delete on public.workout_media to authenticated;
