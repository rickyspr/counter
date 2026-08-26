-- A simple per-workout "kudos" toggle, visible to anyone who can see
-- the workout (owner or mutual friend) via can_view_workout()
-- (20260826100100_friend_visibility.sql).
create table public.workout_kudos (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (workout_id, user_id)
);

create index workout_kudos_workout_id_idx on public.workout_kudos (workout_id);
create index workout_kudos_user_id_idx on public.workout_kudos (user_id);

alter table public.workout_kudos enable row level security;

create policy "workout_kudos_select_visible"
  on public.workout_kudos for select
  using (public.can_view_workout(workout_kudos.workout_id));

create policy "workout_kudos_insert_own"
  on public.workout_kudos for insert
  with check (user_id = auth.uid() and public.can_view_workout(workout_kudos.workout_id));

-- Un-kudos. No visibility check needed here: if you could give it, you
-- can always take back your own.
create policy "workout_kudos_delete_own"
  on public.workout_kudos for delete
  using (user_id = auth.uid());

grant select, insert, delete on public.workout_kudos to authenticated;
