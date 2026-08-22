-- Everything the user can say about themselves, beyond the display name
-- that has been there since 20260815090001_profiles.sql.
--
-- All columns are nullable. A profile is optional decoration around the
-- training data, and an account that predates this migration must keep
-- working without a single one of them being set.
alter table public.profiles
  -- Path inside the private `avatars` bucket, never a URL: the bucket is
  -- private (see 20260822100100_avatars_storage.sql) so every display
  -- goes through a short-lived signed URL. Storing a URL would mean
  -- storing something that stops working.
  add column avatar_path text,
  add column home_gym text,
  -- The date, not the age. An `age` column is silently wrong from the
  -- day after the user's birthday until they happen to correct it; the
  -- date stays true forever and the number is computed by
  -- calculateAge() in packages/shared.
  add column birth_date date,
  -- kg, like every other weight in the schema (see CLAUDE.md). lbs is
  -- presentation only.
  add column body_weight_kg numeric,
  add column height_cm int,
  add column bio text;

-- The bounds below are paired with maxLength/validation in the settings
-- screen, so the app can never hit them. Unlike workouts_name_length in
-- 20260821090000_workout_name.sql these are cheap to be strict about:
-- profile writes do NOT go through the sync queue (see the comment at
-- the top of apps/mobile/lib/profile.ts), so a 23514 surfaces as a
-- dialog the user can act on instead of a silently dropped action.
alter table public.profiles
  add constraint profiles_display_name_length
    check (display_name is null or length(display_name) <= 60),
  add constraint profiles_home_gym_length
    check (home_gym is null or length(home_gym) <= 80),
  add constraint profiles_bio_length
    check (bio is null or length(bio) <= 300),
  add constraint profiles_body_weight_range
    check (body_weight_kg is null or (body_weight_kg > 0 and body_weight_kg < 500)),
  add constraint profiles_height_range
    check (height_cm is null or (height_cm between 50 and 260)),
  -- Deliberately only a lower bound. "Not in the future" is checked in
  -- the client instead: current_date is not immutable, and a check
  -- constraint built on it is a constraint that can start failing on a
  -- dump/restore long after the row was written.
  add constraint profiles_birth_date_range
    check (birth_date is null or birth_date >= date '1900-01-01');

-- No new RLS and no new grants: the four profiles_* policies from
-- 20260815090001 are row-level and already cover these columns, and
-- `authenticated` has table-level rights via 20260815090006_grants.sql.
